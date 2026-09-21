import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { ExercisePictogram } from '../../../../src/components/exercises';
import { formatPrescription } from '../../../../src/features/exercises';
import { friendlyErrorMessage } from '../../../../src/components/friendlyError';
import { Card, Chip, Heading, ScreenHeader, ScreenShell, Skeleton, Text } from '../../../../src/components/ui';
import { RetryState } from '../../../../src/components/workout/ListStates';
import { fetchExercise } from '../../../../src/features/workouts/queries';
import { useDelayedVisible } from '../../../../src/components/ui/useDelayedVisible';

export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['workout', 'exercise', id],
    queryFn: () => fetchExercise(id),
    enabled: !!id,
  });

  const showSkeleton = useDelayedVisible(isLoading);
  const back = () => router.back();
  // Built from whatever shape the row arrived in; see the chip below.
  const prescription = formatPrescription({
    repsOrDuration: data?.repsOrDuration ?? null,
    ...(data as Record<string, unknown> | undefined),
  });

  if (isLoading) {
    return (
      <ScreenShell
        insideTabs
        testID="exercise"
        header={<ScreenHeader title="Exercise" onBack={back} />}
      >
        <View
          style={{ gap: 16 }}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Loading this exercise"
        >
          {showSkeleton ? (
            <>
              <Skeleton width="100%" height={180} radius={16} />
              <Skeleton width="60%" height={28} />
              <Skeleton width="35%" height={20} />
              <Skeleton width="100%" height={72} />
            </>
          ) : (
            <>
              <View style={{ height: 180 }} />
              <View style={{ height: 28 }} />
              <View style={{ height: 20 }} />
              <View style={{ height: 72 }} />
            </>
          )}
        </View>
      </ScreenShell>
    );
  }

  if (isError || !data) {
    return (
      <ScreenShell
        insideTabs
        testID="exercise"
        header={<ScreenHeader title="Exercise" onBack={back} />}
      >
        <RetryState
          title={friendlyErrorMessage(error, 'Could not load this exercise.')}
          message="Nothing was lost — this was only a problem loading it."
          onRetry={() => refetch()}
          testID="exercise-error"
        />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      insideTabs
      testID="exercise"
      header={<ScreenHeader title={data.name} eyebrow="Exercise" onBack={back} />}
    >
      <View style={{ gap: 16, paddingBottom: 24 }}>
        <ExercisePictogram
          imageKey={data.imageKey}
          name={data.name}
          variant="hero"
          testID="exercise-hero"
        />

        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {/* The icon is read off the MEANING of the prescription: a clock only for
                time, the barbell for rep counts, an arrow for distance. One chip renders
                all of them, so a fixed clock mislabelled half the data ("12 reps" behind
                a clock glyph).

                `formatPrescription` takes either shape — the structured columns
                (`prescription_mode`, `sets`, `reps_min`/`reps_max`, `seconds`, …) when the
                row has them, and the legacy free-text `reps_or_duration` when it does not —
                so this screen is already correct for rows written before and after that
                migration. `fetchExercise` does not select the structured columns yet
                (`src/features/workouts/queries.ts` belongs to another stream); the moment
                it does, they flow straight through. */}
            <Chip label={prescription.text} icon={prescription.icon} testID="exercise-prescription" />
          </View>
          {prescription.detail ? (
            <Text role="bodySm" tone="muted" testID="exercise-prescription-detail">
              {prescription.detail}
            </Text>
          ) : null}
        </View>

        <Card padding={16}>
          <View style={{ gap: 8 }}>
            <Heading level={3}>How to do it</Heading>
            {data.detail ? (
              <Text tone="secondary">{data.detail}</Text>
            ) : (
              <Text tone="muted">
                Your coach hasn&apos;t added notes for this one. Follow the movement above and ask
                them if anything feels off.
              </Text>
            )}
          </View>
        </Card>
      </View>
    </ScreenShell>
  );
}
