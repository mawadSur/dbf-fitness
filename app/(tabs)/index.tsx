import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AffirmationCard } from '../../src/components/AffirmationCard';
import { friendlyErrorFromMany } from '../../src/components/friendlyError';
import { ScoreRing } from '../../src/components/ScoreRing';
import { useMyCoach } from '../../src/features/coaching';
import { supabase } from '../../src/services/supabase/client';
import { colors } from '../../src/theme/tokens';

const STREAK_GOAL = 30;

type TodaysWorkout =
  | { status: 'today'; dayNumber: number; blockName: string; durationMinutes: number }
  | { status: 'complete' };

async function fetchTodaysWorkout(memberId: string): Promise<TodaysWorkout> {
  const { data: plan, error: planError } = await supabase
    .from('workout_plans')
    .select('id')
    .eq('member_id', memberId)
    .maybeSingle();

  if (planError) throw planError;
  if (!plan) return { status: 'complete' };

  const { data: days, error: daysError } = await supabase
    .from('workout_days')
    .select('id, day_number, block_name, duration_minutes')
    .eq('workout_plan_id', plan.id)
    .order('day_number', { ascending: true });

  if (daysError) throw daysError;
  if (!days || days.length === 0) return { status: 'complete' };

  const dayIds = days.map((day) => day.id);

  const { data: completions, error: completionsError } = await supabase
    .from('workout_completions')
    .select('workout_day_id')
    .eq('member_id', memberId)
    .eq('status', 'completed')
    .in('workout_day_id', dayIds);

  if (completionsError) throw completionsError;

  const completedDayIds = new Set(
    (completions ?? []).map((completion) => completion.workout_day_id)
  );
  const nextDay = days.find((day) => !completedDayIds.has(day.id));

  if (!nextDay) return { status: 'complete' };

  return {
    status: 'today',
    dayNumber: nextDay.day_number,
    blockName: nextDay.block_name,
    durationMinutes: nextDay.duration_minutes,
  };
}

type NavLinkProps = {
  label: string;
  href: string;
  accessibilityLabel?: string;
  className?: string;
};

function NavButton({ label, href, accessibilityLabel, className }: NavLinkProps) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(href)}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel ?? label}
      android_ripple={{ color: colors.primaryMuted }}
      className={`min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 ${className ?? ''}`}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <Text className="text-center text-sm font-semibold text-slate-700">{label}</Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [isSessionReady, setIsSessionReady] = useState(false);

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

  const profileQuery = useQuery({
    queryKey: ['profile', userId],
    queryFn: async () => {
      if (!userId) throw new Error('Missing session');

      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', userId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const statsQuery = useQuery({
    queryKey: ['workout', 'stats', userId],
    queryFn: async () => {
      if (!userId) throw new Error('Missing session');

      const { data, error } = await supabase
        .from('member_workout_stats')
        .select('*')
        .eq('member_id', userId)
        // The view is members-only: coaches/admins legitimately have no row (not an error).
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const todaysWorkoutQuery = useQuery({
    queryKey: ['workout', 'today', userId],
    queryFn: () => {
      if (!userId) throw new Error('Missing session');
      return fetchTodaysWorkout(userId);
    },
    enabled: !!userId,
  });

  // Only members have a coach: don't fire the request for coaches/admins (or before the role is known).
  const myCoachQuery = useMyCoach({ enabled: profileQuery.data?.role === 'member' });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        profileQuery.refetch(),
        statsQuery.refetch(),
        todaysWorkoutQuery.refetch(),
        ...(profileQuery.data?.role === 'member' ? [myCoachQuery.refetch()] : []),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!isSessionReady || !userId) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const fullName = profileQuery.data?.full_name ?? 'there';
  const isCoach = profileQuery.data?.role === 'coach' || profileQuery.data?.role === 'admin';
  const currentStreak = statsQuery.data?.current_streak ?? 0;
  const todaysWorkout = todaysWorkoutQuery.data;
  // Only members pick a coach; staff never see the nudge. Wait for both answers so it never flashes.
  const needsCoach =
    profileQuery.data?.role === 'member' &&
    myCoachQuery.isSuccess &&
    myCoachQuery.data === null;
  const loadError = profileQuery.isError || statsQuery.isError || todaysWorkoutQuery.isError;

  return (
    <ScrollView
      testID="home-scroll"
      className="flex-1 bg-white"
      contentContainerClassName="gap-6 px-6 pb-10"
      contentContainerStyle={{ paddingTop: insets.top + 16 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
    >
      <View>
        <Text
          accessibilityRole="header"
          numberOfLines={2}
          className="text-2xl font-bold text-slate-900"
        >
          Hi, {fullName}
        </Text>
        <Text className="text-base text-slate-600">{"Here's where you stand today."}</Text>
      </View>

      {loadError ? (
        <View
          accessibilityLiveRegion="polite"
          className="gap-2 rounded-xl border border-red-200 bg-red-50 p-4"
        >
          <Text className="text-sm text-red-700">
            {friendlyErrorFromMany(
              [profileQuery.error, statsQuery.error, todaysWorkoutQuery.error],
              'Some of your info could not be loaded.',
            )}
          </Text>
          <Pressable
            onPress={handleRefresh}
            accessibilityRole="button"
            accessibilityLabel="Try again"
            android_ripple={{ color: '#FECACA' }}
            className="min-h-[44px] items-center justify-center self-start px-2"
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Text className="text-base font-semibold text-emerald-700">Try again</Text>
          </Pressable>
        </View>
      ) : null}

      {needsCoach ? (
        <Pressable
          onPress={() => router.push('/coach/pick')}
          accessibilityRole="button"
          accessibilityLabel="Pick your coach"
          android_ripple={{ color: colors.primaryMuted }}
          className="gap-1 rounded-xl border border-emerald-200 bg-emerald-50 p-4"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Text className="text-lg font-semibold text-slate-900">Pick your coach</Text>
          <Text className="text-sm text-slate-700">
            Choose a coach to get your workout plan, live classes and notes.
          </Text>
          <Text className="min-h-[44px] pt-2 text-base font-semibold text-emerald-700">
            Choose a coach ›
          </Text>
        </Pressable>
      ) : null}

      <View className="items-center">
        <ScoreRing value={currentStreak} max={STREAK_GOAL} label="Day streak" />
      </View>

      <AffirmationCard />

      <View className="gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <Text className="text-lg font-semibold text-slate-900">{"Today's workout"}</Text>

        {todaysWorkoutQuery.isLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : todaysWorkout && todaysWorkout.status === 'today' ? (
          <>
            <Text numberOfLines={2} className="text-base text-slate-700">
              {todaysWorkout.blockName}
            </Text>
            <Text className="text-sm text-slate-600">{todaysWorkout.durationMinutes} min</Text>
            <Pressable
              onPress={() => router.push('/workout')}
              accessibilityRole="link"
              accessibilityLabel="Go to workout"
              android_ripple={{ color: colors.primaryMuted }}
              className="mt-1 min-h-[44px] items-center justify-center"
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Text className="text-center text-base font-semibold text-emerald-700">
                Go to workout
              </Text>
            </Pressable>
          </>
        ) : (
          <Text className="text-base text-slate-700">Plan complete!</Text>
        )}
      </View>

      <View className="flex-row gap-3">
        <NavButton label="Calendar" href="/calendar" className="flex-1" />
        <NavButton label="Effort" href="/effort" className="flex-1" />
      </View>

      <NavButton label={isCoach ? 'Recordings' : 'Workout notes'} href="/notes" />
    </ScrollView>
  );
}
