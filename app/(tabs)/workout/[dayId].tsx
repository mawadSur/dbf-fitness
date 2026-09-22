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
import { finishWorkout, newClientRequestId } from '../../../src/features/workouts/finishWorkout';
import { checklistProgress, durationCopy } from '../../../src/features/workouts/planSummary';
import { fetchWorkoutDay } from '../../../src/features/workouts/queries';
import { useExerciseTicks } from '../../../src/features/workouts/useExerciseTicks';
import { useDelayedVisible } from '../../../src/components/ui/useDelayedVisible';
import type { ExerciseListRow } from '../../../src/types/exercise';

export default function WorkoutDayScreen() {
  const { dayId } = useLocalSearchParams<{ dayId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [justFinished, setJustFinished] = useState(false);
  const [alreadyLoggedFromServer, setAlreadyLoggedFromServer] = useState(false);
  // One id for the whole mount: tapping Finish again after a timeout is the
  // same attempt, not a second workout.
  const clientRequestId = useMemo(() => newClientRequestId(), []);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['workout', 'day', dayId],
    queryFn: () => fetchWorkoutDay(dayId),
    enabled: !!dayId,
  });

  const showSkeleton = useDelayedVisible(isLoading);

  // The server has today's row — on load, or as the idempotent answer to this
  // tap. Computed before the ticks because it is what decides whether they are
  // a record of what was done or a draft of what is being done.
  const loggedOnServer = !!data?.completedToday || alreadyLoggedFromServer;

  const exercises = data?.exercises;
  const visibleIds = useMemo(() => (exercises ?? []).map((row) => row.id), [exercises]);

  const { checkedIds, locked, toggle, discardDraft } = useExerciseTicks({
    memberId: data?.memberId ?? null,
    dayId: dayId ?? null,
    visibleIds,
    ready: !!data,
    alreadyLogged: loggedOnServer,
    completedExerciseIds: data?.completedExerciseIds ?? EMPTY_IDS,
  });

  const finishMutation = useMutation({
    mutationFn: () =>
      finishWorkout({
        dayId,
        exerciseIds: Array.from(checkedIds),
        clientRequestId,
      }),
    onSuccess: (result) => {
      // Refresh the day list + this day's own queries, and the calendar's stats/history
      // (both derive from workout_completions).
      queryClient.invalidateQueries({ queryKey: ['workout'] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      // Force the milestone checker mounted below to evaluate against fresh
      // stats instead of a cached pre-finish snapshot.
      queryClient.invalidateQueries({ queryKey: ['milestone-check'] });
      // `finish_workout` is idempotent: a repeat for the same local day returns
      // the existing row instead of the 23505 the two-insert path used to throw.
      // That is not a celebration, so it takes the already-logged branch.
      if (result.alreadyLogged) setAlreadyLoggedFromServer(true);
      else setJustFinished(true);
      // The day is recorded; the local draft has nothing left to remember.
      discardDraft();
    },
  });

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
        // A logged day reports what was done; the box is not an edit control
        // any more, but the exercise itself stays open to read.
        toggleDisabled={locked}
        onToggle={() => toggle(item.id)}
        onPress={() => openExercise(item.id)}
      />
    ),
    [checkedIds, locked, openExercise, toggle],
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

  // `loggedOnServer`, plus the legacy insert path's 23505 — which is a footer
  // message only: that error leaves the ticks on screen as the member left them.
  const alreadyLoggedToday =
    loggedOnServer || isAlreadyLoggedTodayError(finishMutation.error);
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

/** Stable empty default, so the ticks hook is not handed a new array each render. */
const EMPTY_IDS: readonly string[] = [];
