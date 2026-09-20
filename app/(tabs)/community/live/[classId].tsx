import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CallControlsBar } from '../../../../src/components/live/CallControlsBar';
import { CoachClassControls } from '../../../../src/components/live/CoachClassControls';
import { GraceBanner, GraceNotice } from '../../../../src/components/live/GraceNotice';
import { LiveButton } from '../../../../src/components/live/LiveButton';
import { SubscriptionBlockedPanel } from '../../../../src/components/live/SubscriptionBlockedPanel';
import { fetchCurrentMember, fetchLiveClass } from '../../../../src/features/liveClasses/api';
import { canManageClass } from '../../../../src/features/liveClasses/coachActions';
import { infoFromRtcSubscription } from '../../../../src/features/liveClasses/graceCopy';
import {
  blockedReasonText,
  canAttemptJoin,
  decideJoin,
  type JoinDecision,
} from '../../../../src/features/liveClasses/joinDecision';
import { displayStateOf, joinBlockedMessage, STATUS_BADGE_LABEL } from '../../../../src/features/liveClasses/status';
import { computeContentWidth } from '../../../../src/features/liveClasses/tileLayout';
import { formatCountdown, formatStartTime } from '../../../../src/features/liveClasses/timing';
import { useLiveClassPresence } from '../../../../src/features/liveClasses/useLiveClassPresence';
import { useLiveClassSession } from '../../../../src/features/liveClasses/useLiveClassSession';
import { useNow } from '../../../../src/features/liveClasses/useNow';
import { VideoTileGrid } from '../../../../src/features/liveClasses/VideoTileGrid';
import type { SubscriptionInfo } from '../../../../src/features/subscriptions/state';
import {
  SUBSCRIPTION_STATE_QUERY_KEY,
  useSubscriptionState,
} from '../../../../src/features/subscriptions/useSubscriptionState';

const MAX_CONTENT_WIDTH = 720;
const SIDE_PADDING = 16;

/** Copy for decisions that are neither joinable nor a subscription block. */
function closedMessage(decision: JoinDecision, status: Parameters<typeof joinBlockedMessage>[0]): string | null {
  switch (decision.kind) {
    case 'closed':
      return joinBlockedMessage(status) ?? 'This class is no longer available to join.';
    case 'server-denied':
      return 'This class is only open to members of the coach running it.';
    case 'reauth':
      return 'Your session has expired. Sign in again to join.';
    case 'signed-out':
      return 'Sign in to join this class.';
    default:
      return null;
  }
}

export default function LiveClassScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { width: windowWidth } = useWindowDimensions();
  const { classId } = useLocalSearchParams<{ classId: string }>();
  const id = Array.isArray(classId) ? classId[0] : classId;
  const now = useNow();
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [rechecking, setRechecking] = useState(false);

  const classQuery = useQuery({
    queryKey: ['liveClasses', 'class', id],
    queryFn: () => fetchLiveClass(id),
    enabled: !!id,
  });
  const memberQuery = useQuery({ queryKey: ['liveClasses', 'me'], queryFn: fetchCurrentMember });
  const subscriptionQuery = useSubscriptionState();

  const liveClass = classQuery.data ?? null;
  const member = memberQuery.data ?? null;
  const subscription: SubscriptionInfo | null = subscriptionQuery.data ?? null;

  const session = useLiveClassSession(id ?? '', liveClass?.agora_channel_name ?? null, member);
  const inCall = session.phase === 'joined';
  const presence = useLiveClassPresence(id ?? '', member, inCall);

  // The server refused: the cached subscription / class status is stale, so refresh both.
  const { denial } = session;
  useEffect(() => {
    if (!denial) return;
    void queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_STATE_QUERY_KEY });
    if (denial === 'class_not_joinable') void queryClient.invalidateQueries({ queryKey: ['liveClasses'] });
  }, [denial, queryClient]);

  const topPad = { paddingTop: insets.top + 8 };
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/community/live'));
  const backButton = (
    <LiveButton
      label="‹ Back"
      variant="ghost"
      onPress={goBack}
      className="self-start"
      accessibilityLabel="Back to live classes"
    />
  );

  if (classQuery.isLoading || memberQuery.isLoading) {
    return (
      <View className="flex-1 gap-4 bg-white px-4" style={topPad}>
        {backButton}
        <ActivityIndicator color="#059669" />
      </View>
    );
  }

  const loadError = classQuery.error ?? memberQuery.error;
  if (loadError) {
    return (
      <View className="flex-1 gap-4 bg-white px-4" style={topPad}>
        {backButton}
        <Text className="text-center text-sm text-red-600">
          {loadError instanceof Error ? loadError.message : 'Could not load this class.'}
        </Text>
        <LiveButton
          label="Try again"
          variant="secondary"
          onPress={() => {
            void classQuery.refetch();
            void memberQuery.refetch();
          }}
        />
      </View>
    );
  }

  if (!liveClass) {
    return (
      <View className="flex-1 gap-4 bg-white px-4" style={topPad}>
        {backButton}
        <Text className="text-2xl font-bold text-slate-900">Class not found</Text>
        <Text className="text-sm text-slate-500">
          This live class doesn&apos;t exist or is no longer available.
        </Text>
      </View>
    );
  }

  const state = displayStateOf(liveClass.status, liveClass.starts_at, now);
  const decision = decideJoin({
    classStatus: liveClass.status,
    signedIn: !!member,
    subscription,
    denial: session.denial,
  });
  const joining = session.phase === 'joining';
  const joinEnabled = canAttemptJoin(decision) && !joining;
  const owner = canManageClass(member, liveClass.coach_id);
  const infoMessage = closedMessage(decision, liveClass.status);
  // Why Join is unavailable, announced by screen readers (a bare "Join class, disabled" says nothing).
  const disabledReason =
    !joinEnabled && !joining
      ? decision.kind === 'blocked'
        ? blockedReasonText(decision.reason)
        : infoMessage
      : null;

  // The server's view of the subscription (from the join itself) beats the cached one.
  const graceInfo: SubscriptionInfo | null = session.joinSubscription
    ? session.joinSubscription.state === 'grace'
      ? infoFromRtcSubscription(session.joinSubscription)
      : null
    : subscription?.state === 'grace'
      ? subscription
      : null;

  const onJoinPress = () => {
    if (decision.kind === 'needs-grace-notice' && subscription) {
      setNoticeOpen(true);
      return;
    }
    // Unknown/stale client state: the server's reply may still demand the grace notice first.
    void session.join();
  };

  const recheck = async () => {
    setRechecking(true);
    try {
      await queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_STATE_QUERY_KEY });
      session.resetDenial();
    } finally {
      setRechecking(false);
    }
  };

  const localTile = session.tiles.find((tile) => tile.isLocal);
  // px-4 on the ScrollView sits OUTSIDE the max-w column, so min(window - 2*pad, max) equals the rendered column.
  const contentWidth = computeContentWidth(windowWidth, MAX_CONTENT_WIDTH, SIDE_PADDING);

  return (
    <View className="flex-1 bg-white">
      <ScrollView
        className="flex-1 px-4"
        contentContainerClassName="pb-8"
        contentContainerStyle={topPad}
        keyboardShouldPersistTaps="handled"
      >
        <View className="w-full max-w-[720px] gap-4 self-center">
          {backButton}

          <View className="gap-1">
            <View className="flex-row items-start justify-between gap-3">
              <Text className="flex-1 text-2xl font-bold text-slate-900" numberOfLines={3}>
                {liveClass.title}
              </Text>
              <View className="rounded-full bg-slate-100 px-2 py-1">
                <Text className="text-xs font-semibold text-slate-700">{STATUS_BADGE_LABEL[state]}</Text>
              </View>
            </View>
            <Text className="text-sm text-slate-600">{formatStartTime(liveClass.starts_at)}</Text>
            <Text className="text-sm font-medium text-slate-900">
              {formatCountdown(liveClass.starts_at, now)}
            </Text>
          </View>

          {inCall ? (
            <View className="gap-4">
              {graceInfo ? <GraceBanner info={graceInfo} /> : null}

              <VideoTileGrid participants={session.tiles} availableWidth={contentWidth} />

              <View className="gap-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <Text className="text-sm font-semibold text-slate-900">
                  In this class{presence.unavailable ? '' : ` (${presence.participants.length})`}
                </Text>
                {presence.unavailable ? (
                  <Text className="text-sm text-amber-700">
                    Participant list unavailable. You are still in the class.
                  </Text>
                ) : presence.participants.length === 0 ? (
                  <Text className="text-sm text-slate-500">Connecting…</Text>
                ) : (
                  presence.participants.map((entry) => (
                    <Text key={entry.userId} className="text-sm text-slate-700" numberOfLines={1}>
                      {entry.fullName}
                      {entry.userId === member?.id ? ' (you)' : ''}
                    </Text>
                  ))
                )}
              </View>
            </View>
          ) : (
            <View className="gap-3">
              {decision.kind === 'blocked' ? (
                <SubscriptionBlockedPanel reason={decision.reason} onRecheck={() => void recheck()} checking={rechecking} />
              ) : null}

              {session.graceNotice ? (
                // The server says grace although the client did not know (query null/failed/stale).
                <GraceNotice
                  info={infoFromRtcSubscription(session.graceNotice)}
                  joining={joining}
                  onJoinAnyway={() => void session.join({ graceAcknowledged: true })}
                />
              ) : noticeOpen && decision.kind === 'needs-grace-notice' && subscription ? (
                <GraceNotice
                  info={subscription}
                  joining={joining}
                  onJoinAnyway={() => {
                    setNoticeOpen(false);
                    void session.join({ graceAcknowledged: true });
                  }}
                />
              ) : (
                <LiveButton
                  label={joining ? 'Joining…' : session.error ? 'Try again' : 'Join'}
                  onPress={onJoinPress}
                  disabled={!joinEnabled && !joining}
                  busy={joining}
                  accessibilityLabel={session.error ? 'Try joining again' : 'Join class'}
                  accessibilityHint={disabledReason ?? undefined}
                />
              )}

              {infoMessage ? <Text className="text-center text-sm text-slate-600">{infoMessage}</Text> : null}
              {session.error ? (
                <Text accessibilityRole="alert" className="text-center text-sm text-red-700">
                  {session.error}
                </Text>
              ) : null}
            </View>
          )}

          {owner ? <CoachClassControls liveClass={liveClass} /> : null}
        </View>
      </ScrollView>

      {inCall ? (
        <CallControlsBar
          muted={localTile?.isMuted ?? false}
          cameraOff={localTile?.isCameraOff ?? false}
          onToggleMute={() => void session.toggleMute()}
          onToggleCamera={() => void session.toggleCamera()}
          onLeave={() => void session.leave()}
        />
      ) : null}
    </View>
  );
}
