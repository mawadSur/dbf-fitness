import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';

import { friendlyErrorMessage } from '../../../src/components/friendlyError';
import {
  Banner,
  Button,
  Eyebrow,
  EmptyState,
  FixedFooter,
  ScreenHeader,
  ScreenShell,
  Text,
} from '../../../src/components/ui';
import { ExerciseChecklistRow } from '../../../src/components/workout/ExerciseChecklistRow';
import { CardListSkeleton, RetryState } from '../../../src/components/workout/ListStates';
import { WorkoutFinished } from '../../../src/components/workout/WorkoutFinished';
import {
  ALREADY_LOGGED_TODAY_MESSAGE,
  describeFinishWorkoutError,
  isAlreadyLoggedTodayError,
} from '../../../src/features/workouts/finishWorkoutErrors';
import { checklistProgress, durationCopy } from '../../../src/features/workouts/planSummary';
import { fetchWorkoutDay, finishWorkout } from '../../../src/features/workouts/queries';
import { useDelayedVisible } from '../../../src/components/ui/useDelayedVisible';
import type { ExerciseListRow } from '../../../src/types/exercise';

export default function WorkoutDayScreen() {
  const { dayId } = useLocalSearchParams<{ dayId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [justFinished, setJustFinished] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['workout', 'day', dayId],
    queryFn: () => fetchWorkoutDay(dayId),
    enabled: !!dayId,
  });

  const showSkeleton = useDelayedVisible(isLoading);

  const finishMutation = useMutation({
    mutationFn: () => finishWorkout(dayId, Array.from(checkedIds)),
    onSuccess: () => {
      // Refresh the day list + this day's own queries, and the calendar's stats/history
      // (both derive from workout_completions).
      queryClient.invalidateQueries({ queryKey: ['workout'] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      // Force the milestone checker mounted below to evaluate against fresh
      // stats instead of a cached pre-finish snapshot.
      queryClient.invalidateQueries({ queryKey: ['milestone-check'] });
      setJustFinished(true);
    },
  });

  const toggleExercise = useCallback((exerciseId: string) => {
    setCheckedIds((current) => {
      const next = new Set(current);
      if (next.has(exerciseId)) next.delete(exerciseId);
      else next.add(exerciseId);
      return next;
    });
  }, []);

  const openExercise = useCallback(
    (exerciseId: string) => router.push(`/workout/exercise/${exerciseId}`),
    [router],
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch]);

  const renderItem = useCallback(
    ({ item }: { item: ExerciseListRow }) => (
      <ExerciseChecklistRow
        name={item.name}
        repsOrDuration={item.reps_or_duration}
        imageKey={item.image_key}
        checked={checkedIds.has(item.id)}
        onToggle={() => toggleExercise(item.id)}
        onPress={() => openExercise(item.id)}
      />
    ),
    [checkedIds, openExercise, toggleExercise],
  );

  const checkedInDay = useMemo(
    () => (data?.exercises ?? []).filter((exercise) => checkedIds.has(exercise.id)).length,
    [data?.exercises, checkedIds],
  );

  if (justFinished) return <WorkoutFinished onDone={() => router.back()} />;

  const back = () => router.back();

  if (isLoading) {
    return (
      <ScreenShell
        insideTabs
        testID="workout-day"
        header={<ScreenHeader title="Workout" onBack={back} />}
      >
        <CardListSkeleton count={4} visible={showSkeleton} testID="workout-day-skeleton" />
      </ScreenShell>
    );
  }

  if (isError || !data) {
    return (
      <ScreenShell
        insideTabs
        testID="workout-day"
        header={<ScreenHeader title="Workout" onBack={back} />}
      >
        <RetryState
          title={friendlyErrorMessage(error, 'Could not load this workout day.')}
          message="Nothing was lost — this was only a problem loading the day."
          onRetry={() => refetch()}
          testID="workout-day-error"
        />
      </ScreenShell>
    );
  }

  // Either the server already has today's row, or this session just hit the 23505.
  const alreadyLoggedToday = data.completedToday || isAlreadyLoggedTodayError(finishMutation.error);
  const duration = durationCopy(data.durationMinutes);

  return (
    <ScreenShell
      insideTabs
      scroll={false}
      testID="workout-day"
      header={
        <ScreenHeader title={data.blockName} eyebrow={`Day ${data.dayNumber}`} onBack={back} />
      }
      footer={
        <FixedFooter>
          <View style={{ gap: 8 }}>
            {alreadyLoggedToday ? (
              <Text role="bodySm" tone="muted" align="center">
                {ALREADY_LOGGED_TODAY_MESSAGE}
              </Text>
            ) : null}
            {finishMutation.isError && !alreadyLoggedToday ? (
              <Banner
                tone="danger"
                title={describeFinishWorkoutError(finishMutation.error)}
                testID="finish-error"
              />
            ) : null}
            <Button
              label={alreadyLoggedToday ? 'Logged for today' : 'Finish workout'}
              onPress={() => finishMutation.mutate()}
              disabled={alreadyLoggedToday}
              loading={finishMutation.isPending}
              fullWidth
              testID="finish-workout"
            />
          </View>
        </FixedFooter>
      }
    >
      <FlatList
        testID="workout-day-list"
        data={data.exercises}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ItemSeparatorComponent={Separator}
        refreshing={isRefreshing}
        onRefresh={handleRefresh}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 16 }}
        ListHeaderComponent={
          <View style={{ gap: 4, paddingBottom: 16 }}>
            <Eyebrow tone="muted">{duration ?? 'Today'}</Eyebrow>
            <Text role="label" accessibilityLabel={`Progress, ${checklistProgress(checkedInDay, data.exercises.length)}`}>
              {checklistProgress(checkedInDay, data.exercises.length)}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="info"
            title="No exercises yet"
            message="Your coach hasn't added exercises to this day."
            testID="workout-day-empty"
          />
        }
      />
    </ScreenShell>
  );
}

const keyExtractor = (exercise: ExerciseListRow) => exercise.id;
const Separator = () => <View style={{ height: 12 }} />;
