import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChecklistRow } from '../../src/components/ChecklistRow';
import { todayDateString as computeTodayDateString } from '../../src/features/diet/dates';
import { supabase } from '../../src/services/supabase/client';
import { colors } from '../../src/theme/tokens';

type DietItemRow = {
  id: string;
  name: string;
  description: string | null;
  order_index: number;
};

type DietPlanDetail = {
  title: string;
  description: string | null;
  items: DietItemRow[];
} | null;

async function fetchDietPlan(memberId: string): Promise<DietPlanDetail> {
  const { data: assignment, error: assignmentError } = await supabase
    .from('diet_plan_assignments')
    .select('diet_plan_id')
    .eq('member_id', memberId)
    .order('assigned_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (assignmentError) throw assignmentError;
  if (!assignment) return null;

  const { data: plan, error: planError } = await supabase
    .from('diet_plans')
    .select('title, description')
    .eq('id', assignment.diet_plan_id)
    .single();
  if (planError) throw planError;

  const { data: items, error: itemsError } = await supabase
    .from('diet_items')
    .select('id, name, description, order_index')
    .eq('diet_plan_id', assignment.diet_plan_id)
    .order('order_index', { ascending: true });
  if (itemsError) throw itemsError;

  return {
    title: plan.title,
    description: plan.description,
    items: items ?? [],
  };
}

async function fetchTodaysCheckins(
  memberId: string,
  todayDateString: string
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('diet_checkins')
    .select('diet_item_id')
    .eq('member_id', memberId)
    .eq('checkin_date', todayDateString);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.diet_item_id));
}

export default function FoodScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [isSessionReady, setIsSessionReady] = useState(false);
  // UTC day, matching the streak view and the diet_checkins RLS window (see features/diet/dates.ts).
  const todayDateString = computeTodayDateString();
  const insets = useSafeAreaInsets();
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

      if (isChecked) {
        const { error } = await supabase
          .from('diet_checkins')
          .delete()
          .eq('member_id', userId)
          .eq('diet_item_id', itemId)
          .eq('checkin_date', todayDateString);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('diet_checkins').insert({
          member_id: userId,
          diet_item_id: itemId,
          checkin_date: todayDateString,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['diet', 'checkins', userId, todayDateString],
      });
    },
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([planQuery.refetch(), checkinsQuery.refetch()]);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!isSessionReady || !userId || planQuery.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const refreshControl = <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />;

  if (planQuery.isError) {
    return (
      <ScrollView
        className="flex-1 bg-white"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 24,
          paddingTop: insets.top + 16,
        }}
        refreshControl={refreshControl}
      >
        <Text accessibilityRole="alert" className="text-center text-base text-red-700">
          {planQuery.error instanceof Error
            ? planQuery.error.message
            : 'Could not load your diet plan.'}
        </Text>
        <Pressable
          onPress={() => planQuery.refetch()}
          accessibilityRole="button"
          accessibilityLabel="Try again"
          android_ripple={{ color: colors.primaryMuted }}
          className="min-h-[44px] items-center justify-center px-4"
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Text className="text-base font-semibold text-emerald-700">Try again</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (!planQuery.data) {
    return (
      <ScrollView
        className="flex-1 bg-white"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: 24,
          paddingTop: insets.top + 16,
        }}
        refreshControl={refreshControl}
      >
        <Text className="text-center text-base text-slate-600">
          No diet plan assigned yet — check back soon.
        </Text>
      </ScrollView>
    );
  }

  const { title, description, items } = planQuery.data;
  const checkedIds = checkinsQuery.data ?? new Set<string>();

  return (
    <FlatList
      className="flex-1 bg-white"
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerClassName="gap-3 px-6 pb-10"
      contentContainerStyle={{ paddingTop: insets.top + 16 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
      ListHeaderComponent={
        <View className="gap-1 pb-1">
          <Text className="text-xs font-semibold uppercase text-slate-600">Food</Text>
          <Text
            accessibilityRole="header"
            numberOfLines={2}
            className="text-2xl font-bold text-slate-900"
          >
            {title}
          </Text>
          {description ? <Text className="text-sm text-slate-600">{description}</Text> : null}
        </View>
      }
      ListFooterComponent={
        <>
          {checkinsQuery.isError ? (
            <Text accessibilityRole="alert" className="pt-3 text-center text-sm text-red-700">
              Could not load today&apos;s check-ins. Pull down to retry.
            </Text>
          ) : null}
          {toggleMutation.isError ? (
            <Text
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              className="pt-3 text-center text-sm text-red-700"
            >
              {toggleMutation.error instanceof Error
                ? toggleMutation.error.message
                : 'Could not save that change.'}
            </Text>
          ) : null}
        </>
      }
      renderItem={({ item }) => (
        <ChecklistRow
          label={item.name}
          sublabel={item.description ?? undefined}
          checked={checkedIds.has(item.id)}
          onToggle={() =>
            toggleMutation.mutate({
              itemId: item.id,
              isChecked: checkedIds.has(item.id),
            })
          }
        />
      )}
    />
  );
}
