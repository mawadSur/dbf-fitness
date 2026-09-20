import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { friendlyErrorMessage } from '../../../src/components/friendlyError';
import { ChecklistRow } from '../../../src/components/ChecklistRow';
import { MilestoneToast } from '../../../src/components/MilestoneToast';
import { useMilestoneCheck } from '../../../src/features/milestones/useMilestoneCheck';
import { utcDayRange } from '../../../src/features/workouts/completionWindow';
import {
  ALREADY_LOGGED_TODAY_MESSAGE,
  describeFinishWorkoutError,
  isAlreadyLoggedTodayError,
} from '../../../src/features/workouts/finishWorkoutErrors';
import { supabase } from '../../../src/services/supabase/client';
import { colors } from '../../../src/theme/tokens';

type ExerciseRow = {
  id: string;
  name: string;
  reps_or_duration: string;
  order_index: number;
};

type WorkoutDayDetail = {
  dayNumber: number;
  blockName: string;
  exercises: ExerciseRow[];
  /** Already logged during the current UTC day — the DB would reject a second insert. */
  completedToday: boolean;
};

async function getMemberId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

async function fetchWorkoutDay(dayId: string): Promise<WorkoutDayDetail> {
  const { data: day, error: dayError } = await supabase
    .from('workout_days')
    .select('day_number, block_name')
    .eq('id', dayId)
    .single();
  if (dayError) throw dayError;

  const { data: exercises, error: exercisesError } = await supabase
    .from('exercises')
    .select('id, name, reps_or_duration, order_index')
    .eq('workout_day_id', dayId)
    .order('order_index', { ascending: true });
  if (exercisesError) throw exercisesError;

  // Mirrors the DB key (member_id, workout_day_id, (completed_at at time zone 'utc')::date)
  // from migration 20260919152200, so the button is disabled exactly when an insert
  // would 23505. Repeating the day on a later date stays allowed.
  let completedToday = false;
  const memberId = await getMemberId();
  if (memberId) {
    const { startInclusive, endExclusive } = utcDayRange();
    const { count, error: completedError } = await supabase
      .from('workout_completions')
      .select('id', { count: 'exact', head: true })
      .eq('member_id', memberId)
      .eq('workout_day_id', dayId)
      .gte('completed_at', startInclusive)
      .lt('completed_at', endExclusive);
    if (completedError) throw completedError;
    completedToday = (count ?? 0) > 0;
  }

  return {
    dayNumber: day.day_number,
    blockName: day.block_name,
    exercises: exercises ?? [],
    completedToday,
  };
}

function BackLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      android_ripple={{ color: colors.primaryMuted }}
      className="min-h-[44px] justify-center self-start pr-4"
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <Text className="text-base font-semibold text-emerald-700">{label}</Text>
    </Pressable>
  );
}

export default function WorkoutDayScreen() {
  const { dayId } = useLocalSearchParams<{ dayId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [justFinished, setJustFinished] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['workout', 'day', dayId],
    queryFn: () => fetchWorkoutDay(dayId),
    enabled: !!dayId,
  });

  const finishMutation = useMutation({
    mutationFn: async () => {
      const memberId = await getMemberId();
      if (!memberId) throw new Error('Not signed in.');

      const { data: completion, error: completionError } = await supabase
        .from('workout_completions')
        .insert({
          member_id: memberId,
          workout_day_id: dayId,
          status: 'completed',
        })
        .select('id')
        .single();
      if (completionError) throw completionError;

      const exerciseRows = Array.from(checkedIds).map((exerciseId) => ({
        workout_completion_id: completion.id,
        exercise_id: exerciseId,
      }));

      if (exerciseRows.length > 0) {
        const { error: exerciseError } = await supabase
          .from('exercise_completions')
          .insert(exerciseRows);
        if (exerciseError) throw exerciseError;
      }
    },
    onSuccess: () => {
      // Refresh the day list + this day's own queries, and the calendar's stats/history
      // (both derive from workout_completions).
      queryClient.invalidateQueries({ queryKey: ['workout'] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      // Force the milestone checker mounted below to evaluate against fresh
      // stats instead of a cached pre-finish snapshot (e.g. left over from
      // an earlier calendar-screen visit this session).
      queryClient.invalidateQueries({ queryKey: ['milestone-check'] });

      setJustFinished(true);
    },
  });

  function toggleExercise(exerciseId: string) {
    setCheckedIds((current) => {
      const next = new Set(current);
      if (next.has(exerciseId)) {
        next.delete(exerciseId);
      } else {
        next.add(exerciseId);
      }
      return next;
    });
  }

  if (justFinished) {
    return <FinishedScreen onDone={() => router.back()} />;
  }

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View className="flex-1 bg-white px-6" style={{ paddingTop: insets.top + 8 }}>
        <BackLink label="‹ Workout" onPress={() => router.back()} />
        <View className="flex-1 items-center justify-center gap-2">
          <Text accessibilityRole="alert" className="text-center text-base text-red-700">
            {friendlyErrorMessage(error, 'Could not load this workout day.')}
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
        </View>
      </View>
    );
  }

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Either the server already has today's row, or this session just hit the 23505.
  const alreadyLoggedToday =
    data.completedToday || isAlreadyLoggedTodayError(finishMutation.error);
  const finishDisabled = finishMutation.isPending || alreadyLoggedToday;

  return (
    <View className="flex-1 bg-white">
      <FlatList
        className="flex-1"
        data={data.exercises}
        keyExtractor={(exercise) => exercise.id}
        contentContainerClassName="gap-3 px-6 pb-8"
        contentContainerStyle={{ paddingTop: insets.top + 8 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
        ListHeaderComponent={
          <View className="gap-3 pb-1">
            <BackLink label="‹ Workout" onPress={() => router.back()} />
            <View className="gap-1">
              <Text className="text-xs font-semibold uppercase text-slate-600">
                Day {data.dayNumber}
              </Text>
              <Text
                accessibilityRole="header"
                numberOfLines={3}
                className="text-2xl font-bold text-slate-900"
              >
                {data.blockName}
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <Text className="text-base text-slate-600">No exercises in this workout yet.</Text>
        }
        ListFooterComponent={
          finishMutation.isError ? (
            <Text
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              className="pt-3 text-center text-sm text-red-700"
            >
              {describeFinishWorkoutError(finishMutation.error)}
            </Text>
          ) : null
        }
        renderItem={({ item: exercise }) => (
          <ChecklistRow
            label={exercise.name}
            sublabel={exercise.reps_or_duration}
            checked={checkedIds.has(exercise.id)}
            onToggle={() => toggleExercise(exercise.id)}
            onPress={() => router.push(`/workout/exercise/${exercise.id}`)}
          />
        )}
      />

      <View
        className="border-t border-slate-200 bg-white px-6 pt-4"
        style={{ paddingBottom: Math.max(insets.bottom, 16) }}
      >
        {alreadyLoggedToday ? (
          <Text className="pb-3 text-center text-sm text-slate-600">
            {ALREADY_LOGGED_TODAY_MESSAGE}
          </Text>
        ) : null}

        <Pressable
          onPress={() => finishMutation.mutate()}
          disabled={finishDisabled}
          accessibilityRole="button"
          accessibilityLabel="Finish workout"
          accessibilityState={{
            disabled: finishDisabled,
            busy: finishMutation.isPending,
          }}
          android_ripple={finishDisabled ? undefined : { color: colors.primaryMuted }}
          className={`min-h-[48px] items-center justify-center rounded-xl py-3 ${
            finishDisabled ? 'bg-emerald-300' : 'bg-emerald-700'
          }`}
        >
          <Text className="text-base font-semibold text-white">
            {finishMutation.isPending
              ? 'Saving…'
              : alreadyLoggedToday
                ? 'Logged for today'
                : 'Finish Workout'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function FinishedScreen({ onDone }: { onDone: () => void }) {
  const { newlyAchievedTier } = useMilestoneCheck();
  const [dismissed, setDismissed] = useState(false);
  const toastTier = dismissed ? null : newlyAchievedTier;

  return (
    <View className="flex-1 items-center justify-center gap-6 bg-white px-6">
      {toastTier && (
        <MilestoneToast tier={toastTier} visible onDismiss={() => setDismissed(true)} />
      )}

      <Text accessibilityRole="header" className="text-center text-lg font-semibold text-slate-900">
        Workout complete — nice work, see you next session.
      </Text>

      <Pressable
        onPress={onDone}
        accessibilityRole="button"
        accessibilityLabel="Done"
        android_ripple={{ color: colors.primaryMuted }}
        className="min-h-[48px] items-center justify-center rounded-xl bg-emerald-700 px-6 py-3"
        style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
      >
        <Text className="text-base font-semibold text-white">Done</Text>
      </Pressable>
    </View>
  );
}
