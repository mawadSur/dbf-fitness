import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';

import { friendlyErrorMessage } from '../../../../src/components/friendlyError';
import { useDelayedVisible } from '../../../../src/components/ui/useDelayedVisible';
import { GraceBanner } from '../../../../src/components/live/GraceNotice';
import { LiveClassCard } from '../../../../src/components/live/LiveClassCard';
import { ScheduleSkeleton } from '../../../../src/components/live/ScheduleSkeleton';
import { SubscriptionBlockedPanel } from '../../../../src/components/live/SubscriptionBlockedPanel';
import {
  Banner,
  Button,
  EmptyState,
  ScreenHeader,
  ScreenShell,
  SectionHeader,
} from '../../../../src/components/ui';
import {
  fetchCurrentMember,
  fetchUpcomingLiveClasses,
  type LiveClass,
} from '../../../../src/features/liveClasses/api';
import { canOpenClassFromList } from '../../../../src/features/liveClasses/joinDecision';
import { buildScheduleRows, type ScheduleRow } from '../../../../src/features/liveClasses/schedule';
import { useNow } from '../../../../src/features/liveClasses/useNow';
import { usePushRegistration } from '../../../../src/features/liveClasses/usePushRegistration';
import { useSubscriptionState } from '../../../../src/features/subscriptions/useSubscriptionState';

const REFETCH_INTERVAL_MS = 60_000;

const keyExtractor = (row: ScheduleRow<LiveClass>) => row.key;

export default function LiveScheduleScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const now = useNow();
  usePushRegistration();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['liveClasses', 'schedule'],
    queryFn: fetchUpcomingLiveClasses,
    refetchInterval: REFETCH_INTERVAL_MS,
  });
  const memberQuery = useQuery({ queryKey: ['liveClasses', 'me'], queryFn: fetchCurrentMember });
  const subscription = useSubscriptionState();

  const info = subscription.data ?? null;
  const canOpen = canOpenClassFromList(info);
  const role = memberQuery.data?.role;
  const isCoach = role === 'coach' || role === 'admin';
  const myId = memberQuery.data?.id ?? null;
  const showSkeleton = useDelayedVisible(isLoading);

  const rows = useMemo(() => buildScheduleRows(data ?? [], now), [data, now]);

  const goBack = useCallback(
    () => (router.canGoBack() ? router.back() : router.replace('/community')),
    [router],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refetch(),
        queryClient.invalidateQueries({ queryKey: ['subscription', 'state'] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [refetch, queryClient]);

  const renderItem = useCallback(
    ({ item: row }: { item: ScheduleRow<LiveClass> }) =>
      row.kind === 'section' ? (
        <SectionHeader title={row.title} subtitle={`${row.count} ${row.count === 1 ? 'class' : 'classes'}`} />
      ) : (
        <View style={{ paddingBottom: 12 }}>
          <LiveClassCard
            liveClass={row.item}
            state={row.state}
            now={now}
            canOpen={canOpen}
            coachLabel={myId && row.item.coach_id === myId ? 'You run this class' : null}
            onOpen={() => router.push(`/community/live/${row.item.id}`)}
          />
        </View>
      ),
    [now, canOpen, myId, router],
  );

  return (
    <ScreenShell
      testID="live-schedule"
      insideTabs
      scroll={false}
      header={
        <ScreenHeader
          title="Live classes"
          eyebrow="Train together"
          onBack={goBack}
          backAccessibilityLabel="Back to community"
          actions={
            isCoach ? (
              <Button
                label="Schedule"
                size="sm"
                leadingIcon="plus"
                onPress={() => router.push('/community/live/new')}
                accessibilityLabel="Schedule a class"
              />
            ) : null
          }
        />
      }
    >
      <FlatList
        testID="live-schedule-list"
        style={{ flex: 1 }}
        data={isLoading || isError ? [] : rows}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={
          <ScheduleListHeader
            info={info}
            canOpen={canOpen}
            isLoading={isLoading}
            showSkeleton={showSkeleton}
            isError={isError}
            error={error}
            isEmpty={rows.length === 0}
            onRetry={() => void refetch()}
            onRefresh={() => void onRefresh()}
          />
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </ScreenShell>
  );
}

type HeaderProps = {
  info: ReturnType<typeof useSubscriptionState>['data'] | null;
  canOpen: boolean;
  isLoading: boolean;
  showSkeleton: boolean;
  isError: boolean;
  error: unknown;
  isEmpty: boolean;
  onRetry: () => void;
  onRefresh: () => void;
};

/**
 * Everything above the class rows: the grace reminder, the access gate, and the
 * loading / error / empty states. A first load shows placeholder cards (only once
 * the fetch has been slow enough to need them), never a bare screen spinner.
 */
function ScheduleListHeader({
  info,
  canOpen,
  isLoading,
  showSkeleton,
  isError,
  error,
  isEmpty,
  onRetry,
  onRefresh,
}: HeaderProps) {
  return (
    <View style={{ gap: 12, paddingBottom: 12 }}>
      {info?.state === 'grace' ? <GraceBanner info={info} /> : null}

      {info && !canOpen ? (
        <SubscriptionBlockedPanel reason={info.state === 'expired' ? 'expired' : 'required'} />
      ) : null}

      {isLoading ? (
        showSkeleton ? (
          <ScheduleSkeleton />
        ) : null
      ) : isError ? (
        <View style={{ gap: 12 }}>
          <Banner
            tone="danger"
            title={friendlyErrorMessage(error, 'Could not load live classes.')}
            testID="schedule-error"
          />
          <Button label="Try again" variant="secondary" leadingIcon="refresh" onPress={onRetry} />
        </View>
      ) : isEmpty ? (
        <EmptyState
          testID="schedule-empty"
          icon="calendar"
          title="No live classes scheduled yet."
          message="When your coach schedules a class it shows up here."
          actionLabel="Check again"
          onAction={onRefresh}
        />
      ) : null}
    </View>
  );
}
