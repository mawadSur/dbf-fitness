import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { friendlyErrorMessage } from '../../../../src/components/friendlyError';
import { useDelayedVisible } from '../../../../src/components/ui/useDelayedVisible';
import { CallControlsBar } from '../../../../src/components/live/CallControlsBar';
import { ClassJoinPanel } from '../../../../src/components/live/ClassJoinPanel';
import { ClassPresenceList } from '../../../../src/components/live/ClassPresenceList';
import { ClassSkeleton } from '../../../../src/components/live/ClassSkeleton';
import { CoachClassControls } from '../../../../src/components/live/CoachClassControls';
import { GraceBanner, GraceNotice } from '../../../../src/components/live/GraceNotice';
import { LiveStage } from '../../../../src/components/live/LiveStage';
import { SubscriptionBlockedPanel } from '../../../../src/components/live/SubscriptionBlockedPanel';
import {
  Badge,
  Banner,
  Card,
  CONTENT_MAX_WIDTH,
  EmptyState,
  ScreenHeader,
  ScreenShell,
  screenGutter,
  Text,
} from '../../../../src/components/ui';
import { fetchCurrentMember, fetchLiveClass } from '../../../../src/features/liveClasses/api';
import { canManageClass } from '../../../../src/features/liveClasses/coachActions';
import { infoFromRtcSubscription } from '../../../../src/features/liveClasses/graceCopy';
import {
  blockedReasonText,
  canAttemptJoin,
  decideJoin,
  type JoinDecision,
} from '../../../../src/features/liveClasses/joinDecision';
import { STATUS_BADGE } from '../../../../src/features/liveClasses/schedule';
import { displayStateOf, joinBlockedMessage, STATUS_BADGE_LABEL } from '../../../../src/features/liveClasses/status';
import { computeContentWidth } from '../../../../src/features/liveClasses/tileLayout';
import { formatCountdown, formatStartTime } from '../../../../src/features/liveClasses/timing';
import { useLiveClassPresence } from '../../../../src/features/liveClasses/useLiveClassPresence';
import { useLiveClassSession } from '../../../../src/features/liveClasses/useLiveClassSession';
import { useNow } from '../../../../src/features/liveClasses/useNow';
import type { SubscriptionInfo } from '../../../../src/features/subscriptions/state';
import {
  SUBSCRIPTION_STATE_QUERY_KEY,
  useSubscriptionState,
} from '../../../../src/features/subscriptions/useSubscriptionState';

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

  const loading = classQuery.isLoading || memberQuery.isLoading;
  const showSkeleton = useDelayedVisible(loading);
  const loadError = classQuery.error ?? memberQuery.error;
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/community/live'));

  const header = (
    <ScreenHeader
      title={liveClass?.title ?? 'Live class'}
      eyebrow="Live class"
      onBack={goBack}
      backAccessibilityLabel="Back to live classes"
    />
  );

  if (loading || loadError || !liveClass) {
    return (
      <ScreenShell testID="live-class" insideTabs header={header}>
        {loading ? (
          showSkeleton ? (
            <ClassSkeleton />
          ) : null
        ) : loadError ? (
          <EmptyState
            testID="live-class-error"
            icon="alert-triangle"
            title="Could not load this class"
            message={friendlyErrorMessage(loadError, 'Could not load this class.')}
            actionLabel="Try again"
            onAction={() => {
              void classQuery.refetch();
              void memberQuery.refetch();
            }}
          />
        ) : (
          <EmptyState
            testID="live-class-missing"
            icon="calendar"
            title="Class not found"
            message="This live class doesn’t exist or is no longer available."
            actionLabel="Back to live classes"
            onAction={goBack}
          />
        )}
      </ScreenShell>
    );
  }

  const state = displayStateOf(liveClass.status, liveClass.starts_at, now);
  const badge = STATUS_BADGE[state];
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
  // The shell caps its column at 640 and pays the gutter, so the stage gets exactly that width.
  const contentWidth = computeContentWidth(windowWidth, CONTENT_MAX_WIDTH, screenGutter(windowWidth));

  return (
    <ScreenShell
      testID="live-class"
      insideTabs
      header={header}
      contentStyle={{ gap: 16 }}
      footer={
        inCall ? (
          <CallControlsBar
            muted={localTile?.isMuted ?? false}
            cameraOff={localTile?.isCameraOff ?? false}
            onToggleMute={() => void session.toggleMute()}
            onToggleCamera={() => void session.toggleCamera()}
            onLeave={() => void session.leave()}
          />
        ) : undefined
      }
    >
      <Card testID="class-summary" style={{ gap: 8 }}>
        <Badge label={STATUS_BADGE_LABEL[state]} tone={badge.tone} icon={badge.icon} />
        <Text role="bodySm" tone="secondary">
          {formatStartTime(liveClass.starts_at)}
        </Text>
        <Text role="label">{formatCountdown(liveClass.starts_at, now)}</Text>
      </Card>

      {inCall ? (
        <View style={{ gap: 16 }}>
          {graceInfo ? <GraceBanner info={graceInfo} /> : null}
          {session.mode === 'mock' ? (
            <Banner
              tone="info"
              title="Preview mode"
              message="Live video isn’t switched on yet, so you are seeing a local preview. Nothing is broadcast."
              testID="preview-mode"
            />
          ) : null}

          <LiveStage
            participants={session.tiles}
            availableWidth={contentWidth}
            preview={session.mode === 'mock'}
          />

          <ClassPresenceList
            entries={presence.participants}
            unavailable={presence.unavailable}
            currentUserId={member?.id ?? null}
          />
        </View>
      ) : (
        <View style={{ gap: 16 }}>
          {decision.kind === 'blocked' ? (
            <SubscriptionBlockedPanel
              reason={decision.reason}
              onRecheck={() => void recheck()}
              checking={rechecking}
            />
          ) : null}

          {session.graceNotice ? (
            // The server says grace although the client did not know (query null/failed/stale).
            <GraceNotice
              info={infoFromRtcSubscription(session.graceNotice)}
              joining={joining}
              onJoinAnyway={() => void session.join({ graceAcknowledged: true })}
              onDismiss={session.dismissGraceNotice}
            />
          ) : noticeOpen && decision.kind === 'needs-grace-notice' && subscription ? (
            <GraceNotice
              info={subscription}
              joining={joining}
              onJoinAnyway={() => {
                setNoticeOpen(false);
                void session.join({ graceAcknowledged: true });
              }}
              onDismiss={() => setNoticeOpen(false)}
            />
          ) : (
            // The notice replaces Join while it is open: the member answers it first.
            <ClassJoinPanel
              enabled={joinEnabled}
              joining={joining}
              errorMessage={session.error}
              disabledReason={disabledReason}
              infoMessage={infoMessage}
              onPress={onJoinPress}
            />
          )}
        </View>
      )}

      {owner ? <CoachClassControls liveClass={liveClass} /> : null}
    </ScreenShell>
  );
}
