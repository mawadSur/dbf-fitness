import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { ExercisePictogram } from '../../../../src/components/exercises';
import { friendlyErrorMessage } from '../../../../src/components/friendlyError';
import { Card, Chip, Heading, ScreenHeader, ScreenShell, Skeleton, Text } from '../../../../src/components/ui';
import { RetryState } from '../../../../src/components/workout/ListStates';
import { fetchExercise } from '../../../../src/features/workouts/queries';
import { repsOrDurationIcon } from '../../../../src/features/workouts/repsOrDuration';
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

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {/* The icon is read off the value: a clock for durations, the barbell for
              rep counts. One chip renders both, so a fixed clock mislabelled half
              the data ("12 reps" behind a clock glyph). */}
          <Chip label={data.repsOrDuration} icon={repsOrDurationIcon(data.repsOrDuration)} />
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
