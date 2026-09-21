import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';

import { friendlyErrorMessage } from '../../src/components/friendlyError';
import {
  Banner,
  ChecklistRow,
  EmptyState,
  Eyebrow,
  ScreenHeader,
  ScreenShell,
  Text,
} from '../../src/components/ui';
import { CardListSkeleton, RetryState } from '../../src/components/workout/ListStates';
import { todayDateString as computeTodayDateString } from '../../src/features/diet/dates';
import { dayHeading, dietProgress } from '../../src/features/diet/dayLabel';
import {
  fetchDietPlan,
  fetchTodaysCheckins,
  toggleCheckin,
  type DietItemRow,
} from '../../src/features/diet/queries';
import { useDelayedVisible } from '../../src/components/ui/useDelayedVisible';
import { supabase } from '../../src/services/supabase/client';

export default function FoodScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [isSessionReady, setIsSessionReady] = useState(false);
  // UTC day, matching the streak view and the diet_checkins RLS window (see features/diet/dates.ts).
  const todayDateString = computeTodayDateString();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
      setIsSessionReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
      setIsSessionReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const planQuery = useQuery({
    queryKey: ['diet', 'plan', userId],
    queryFn: () => fetchDietPlan(userId as string),
    enabled: !!userId,
  });

  const checkinsQuery = useQuery({
    queryKey: ['diet', 'checkins', userId, todayDateString],
    queryFn: () => fetchTodaysCheckins(userId as string, todayDateString),
    enabled: !!userId,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ itemId, isChecked }: { itemId: string; isChecked: boolean }) => {
      if (!userId) throw new Error('Not signed in.');
      await toggleCheckin({ memberId: userId, itemId, isChecked, todayDateString });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['diet', 'checkins', userId, todayDateString],
      });
    },
  });

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([planQuery.refetch(), checkinsQuery.refetch()]);
    } finally {
      setIsRefreshing(false);
    }
  }, [planQuery, checkinsQuery]);

  const checkedIds = useMemo(
    () => checkinsQuery.data ?? new Set<string>(),
    [checkinsQuery.data],
  );

  // Only the row being saved goes disabled — locking the whole list for one
  // tick would make a slow connection feel broken.
  const pendingItemId = toggleMutation.isPending ? toggleMutation.variables.itemId : null;

  const renderItem = useCallback(
    ({ item }: { item: DietItemRow }) => (
      <ChecklistRow
        label={item.name}
        sublabel={item.description ?? undefined}
        checked={checkedIds.has(item.id)}
        disabled={pendingItemId === item.id}
        onToggle={() =>
          toggleMutation.mutate({ itemId: item.id, isChecked: checkedIds.has(item.id) })
        }
        testID={`food-item-${item.id}`}
      />
    ),
    [checkedIds, pendingItemId, toggleMutation],
  );

  const isFirstLoad = !isSessionReady || !userId || planQuery.isLoading;
  const showSkeleton = useDelayedVisible(isFirstLoad);
  const header = <ScreenHeader title="Food" eyebrow={dayHeading(todayDateString)} />;

  if (isFirstLoad) {
    return (
      <ScreenShell insideTabs testID="food" header={header}>
        <CardListSkeleton count={4} visible={showSkeleton} testID="food-skeleton" />
      </ScreenShell>
    );
  }

  if (planQuery.isError) {
    return (
      <ScreenShell
        insideTabs
        testID="food"
        header={header}
        refreshing={isRefreshing}
        onRefresh={handleRefresh}
      >
        <RetryState
          title={friendlyErrorMessage(planQuery.error, 'Could not load your diet plan.')}
          message="Your plan is safe — this was only a problem loading it."
          onRetry={() => planQuery.refetch()}
          busy={isRefreshing}
          testID="food-error"
        />
      </ScreenShell>
    );
  }

  if (!planQuery.data) {
    return (
      <ScreenShell
        insideTabs
        testID="food"
        header={header}
        refreshing={isRefreshing}
        onRefresh={handleRefresh}
      >
        <EmptyState
          icon="clock"
          title="No diet plan yet"
          message="No diet plan assigned yet — check back soon. Pull down to look again."
          testID="food-empty"
        />
      </ScreenShell>
    );
  }

  const { title, description, items } = planQuery.data;
  const checkedInPlan = items.filter((item) => checkedIds.has(item.id)).length;

  return (
    <ScreenShell insideTabs scroll={false} testID="food" header={header}>
      <FlatList
        testID="food-list"
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ItemSeparatorComponent={Separator}
        refreshing={isRefreshing}
        onRefresh={handleRefresh}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 24 }}
        ListHeaderComponent={
          <View style={{ gap: 4, paddingBottom: 16 }}>
            <Eyebrow tone="muted">{title}</Eyebrow>
            {description ? <Text tone="secondary">{description}</Text> : null}
            <Text
              role="label"
              accessibilityLabel={`Progress, ${dietProgress(checkedInPlan, items.length)}`}
            >
              {dietProgress(checkedInPlan, items.length)}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="info"
            title="Nothing on the list yet"
            message="Your coach hasn't added anything to this plan."
            testID="food-no-items"
          />
        }
        ListFooterComponent={
          <View style={{ gap: 12, paddingTop: 16 }}>
            {checkinsQuery.isError ? (
              <Banner
                tone="warning"
                title={friendlyErrorMessage(
                  checkinsQuery.error,
                  "Could not load today's check-ins. Pull down to retry.",
                )}
                testID="food-checkins-error"
              />
            ) : null}
            {toggleMutation.isError ? (
              <Banner
                tone="danger"
                title={friendlyErrorMessage(toggleMutation.error, 'Could not save that change.')}
                testID="food-toggle-error"
              />
            ) : null}
          </View>
        }
      />
    </ScreenShell>
  );
}

const keyExtractor = (item: DietItemRow) => item.id;
const Separator = () => <View style={{ height: 12 }} />;
