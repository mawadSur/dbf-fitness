import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, View } from 'react-native';

import { friendlyErrorMessage } from '../../../src/components/friendlyError';
import { DayCard } from '../../../src/components/workout/DayCard';
import { CardListSkeleton, RetryState } from '../../../src/components/workout/ListStates';
import { EmptyState, ScreenHeader, ScreenShell } from '../../../src/components/ui';
import type { PlanDay } from '../../../src/features/workouts/planSummary';
import { fetchPlanOverview, getMemberId } from '../../../src/features/workouts/queries';
import { useDelayedVisible } from '../../../src/components/ui/useDelayedVisible';

export default function WorkoutScreen() {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['workout', 'days'],
    queryFn: async () => fetchPlanOverview(await getMemberId()),
  });

  const showSkeleton = useDelayedVisible(isLoading);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch]);

  const openDay = useCallback((dayId: string) => router.push(`/workout/${dayId}`), [router]);

  const renderItem = useCallback(
    ({ item }: { item: PlanDay }) => (
      <DayCard
        day={item}
        isCompleted={!!data?.completedDayIds.has(item.id)}
        isToday={data?.todayDayId === item.id}
        onPress={openDay}
      />
    ),
    [data?.completedDayIds, data?.todayDayId, openDay],
  );

  const header = <ScreenHeader title="Workout" eyebrow="Your plan" />;

  if (isLoading) {
    return (
      <ScreenShell insideTabs testID="workout" header={header}>
        <CardListSkeleton count={4} visible={showSkeleton} testID="workout-skeleton" />
      </ScreenShell>
    );
  }

  if (isError) {
    return (
      <ScreenShell
        insideTabs
        testID="workout"
        header={header}
        refreshing={isRefreshing}
        onRefresh={handleRefresh}
      >
        <RetryState
          title={friendlyErrorMessage(error, 'Could not load your workout plan.')}
          message="Your plan is safe — this was only a problem loading it."
          onRetry={() => refetch()}
          busy={isRefreshing}
          testID="workout-error"
        />
      </ScreenShell>
    );
  }

  if (!data || data.days.length === 0) {
    return (
      <ScreenShell
        insideTabs
        testID="workout"
        header={header}
        refreshing={isRefreshing}
        onRefresh={handleRefresh}
      >
        <EmptyState
          icon="clock"
          title="Your coach is preparing your plan"
          message="Your coach hasn't assigned a workout plan yet. Pull down to check again."
          testID="workout-empty"
        />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell insideTabs scroll={false} testID="workout" header={header}>
      <FlatList
        testID="workout-list"
        data={data.days}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ItemSeparatorComponent={Separator}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshing={isRefreshing}
        onRefresh={handleRefresh}
      />
    </ScreenShell>
  );
}

const keyExtractor = (day: PlanDay) => day.id;
const Separator = () => <View style={{ height: 12 }} />;
