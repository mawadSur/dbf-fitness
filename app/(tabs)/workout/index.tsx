import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
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

import { supabase } from '../../../src/services/supabase/client';
import { colors } from '../../../src/theme/tokens';

type WorkoutDayRow = {
  id: string;
  day_number: number;
  block_name: string;
  duration_minutes: number | null;
};

type WorkoutOverview = {
  days: WorkoutDayRow[];
  completedDayIds: Set<string>;
  todayDayId: string | null;
};

async function getMemberId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

async function fetchWorkoutOverview(): Promise<WorkoutOverview> {
  const memberId = await getMemberId();
  if (!memberId) {
    return { days: [], completedDayIds: new Set(), todayDayId: null };
  }

  const { data: plan, error: planError } = await supabase
    .from('workout_plans')
    .select('id')
    .eq('member_id', memberId)
    .maybeSingle();
  if (planError) throw planError;
  if (!plan) {
    return { days: [], completedDayIds: new Set(), todayDayId: null };
  }

  const { data: days, error: daysError } = await supabase
    .from('workout_days')
    .select('id, day_number, block_name, duration_minutes')
    .eq('workout_plan_id', plan.id)
    .order('day_number', { ascending: true });
  if (daysError) throw daysError;

  const dayRows: WorkoutDayRow[] = days ?? [];
  const dayIds = dayRows.map((day) => day.id);
  const completedDayIds = new Set<string>();

  if (dayIds.length > 0) {
    const { data: completions, error: completionsError } = await supabase
      .from('workout_completions')
      .select('workout_day_id')
      .eq('member_id', memberId)
      .eq('status', 'completed')
      .in('workout_day_id', dayIds);
    if (completionsError) throw completionsError;

    for (const completion of (completions ?? []) as {
      workout_day_id: string;
    }[]) {
      completedDayIds.add(completion.workout_day_id);
    }
  }

  const todayDay = dayRows.find((day) => !completedDayIds.has(day.id));

  return {
    days: dayRows,
    completedDayIds,
    todayDayId: todayDay?.id ?? null,
  };
}

export default function WorkoutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['workout', 'days'],
    queryFn: fetchWorkoutOverview,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const refreshControl = <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />;
  const centeredContent = {
    flexGrow: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingHorizontal: 24,
    paddingTop: insets.top + 16,
  };

  if (isError) {
    return (
      <ScrollView
        className="flex-1 bg-white"
        contentContainerStyle={centeredContent}
        refreshControl={refreshControl}
      >
        <Text accessibilityRole="alert" className="text-center text-base text-red-700">
          {error instanceof Error ? error.message : 'Could not load your workout plan.'}
        </Text>
        <Pressable
          onPress={() => refetch()}
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

  if (!data || data.days.length === 0) {
    return (
      <ScrollView
        className="flex-1 bg-white"
        contentContainerStyle={centeredContent}
        refreshControl={refreshControl}
      >
        <Text accessibilityRole="header" className="text-2xl font-bold text-slate-900">
          Workout
        </Text>
        <Text className="text-center text-base text-slate-600">
          Your coach hasn&apos;t assigned a workout plan yet.
        </Text>
      </ScrollView>
    );
  }

  return (
    <FlatList
      testID="workout-list"
      className="flex-1 bg-white"
      data={data.days}
      keyExtractor={(day) => day.id}
      contentContainerClassName="gap-3 px-6 pb-10"
      contentContainerStyle={{ paddingTop: insets.top + 16 }}
      refreshControl={refreshControl}
      ListHeaderComponent={
        <Text accessibilityRole="header" className="pb-1 text-2xl font-bold text-slate-900">
          Workout
        </Text>
      }
      renderItem={({ item: day }) => {
        const isCompleted = data.completedDayIds.has(day.id);
        const isToday = data.todayDayId === day.id;
        const statusLabel = isCompleted ? 'Completed' : 'Upcoming';

        return (
          <Pressable
            onPress={() => router.push(`/workout/${day.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`Day ${day.day_number}, ${day.block_name}, ${statusLabel}${isToday ? ', today' : ''}`}
            android_ripple={{ color: colors.primaryMuted }}
            className={`min-h-[44px] flex-row items-center justify-between gap-3 rounded-lg border p-4 ${
              isToday ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 bg-slate-50'
            }`}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <View className="flex-1 gap-1">
              <Text className="text-xs font-semibold uppercase text-slate-600">
                Day {day.day_number}
                {isToday ? ' · Today' : ''}
              </Text>
              <Text numberOfLines={2} className="text-lg font-bold text-slate-900">
                {day.block_name}
              </Text>
              {day.duration_minutes != null ? (
                <Text className="text-sm text-slate-600">{day.duration_minutes} min</Text>
              ) : null}
            </View>
            <Text
              className={`text-sm font-semibold ${
                isCompleted ? 'text-emerald-700' : 'text-slate-600'
              }`}
            >
              {statusLabel}
            </Text>
          </Pressable>
        );
      }}
    />
  );
}
