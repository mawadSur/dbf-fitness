import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { friendlyErrorMessage } from '../../../../src/components/friendlyError';
import { useDelayedVisible } from '../../../../src/components/ui/useDelayedVisible';
import { ScheduleClassForm } from '../../../../src/components/live/ScheduleClassForm';
import {
  Banner,
  Button,
  Card,
  EmptyState,
  ScreenHeader,
  ScreenShell,
  Skeleton,
} from '../../../../src/components/ui';
import { fetchCurrentMember } from '../../../../src/features/liveClasses/api';

/** Coach/admin only: schedule a new live class. */
export default function ScheduleClassScreen() {
  const router = useRouter();
  const memberQuery = useQuery({ queryKey: ['liveClasses', 'me'], queryFn: fetchCurrentMember });
  const member = memberQuery.data ?? null;
  const showSkeleton = useDelayedVisible(memberQuery.isLoading);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/community/live'));

  const isCoach = member?.role === 'coach' || member?.role === 'admin';
  if (memberQuery.isSuccess && isCoach && member) {
    return (
      <ScheduleClassForm
        coachId={member.id}
        onBack={goBack}
        onCreated={(created) => router.replace(`/community/live/${created.id}`)}
      />
    );
  }

  return (
    <ScreenShell
      testID="schedule-gate"
      insideTabs
      header={
        <ScreenHeader
          title="Schedule class"
          eyebrow="Coach"
          onBack={goBack}
          backAccessibilityLabel="Back to live classes"
        />
      }
    >
      {memberQuery.isLoading ? (
        showSkeleton ? (
          <Card testID="schedule-gate-skeleton" style={{ gap: 12 }}>
            <Skeleton width="60%" height={24} />
            <Skeleton width="80%" height={16} />
            <Skeleton height={48} radius={12} />
          </Card>
        ) : null
      ) : memberQuery.isError ? (
        <View style={{ gap: 12 }}>
          <Banner
            tone="danger"
            title={friendlyErrorMessage(memberQuery.error, 'Could not load your profile.')}
            testID="schedule-gate-error"
          />
          <Button
            label="Try again"
            variant="secondary"
            leadingIcon="refresh"
            onPress={() => void memberQuery.refetch()}
          />
        </View>
      ) : (
        <EmptyState
          testID="schedule-gate-denied"
          icon="lock"
          title="Coaches only"
          message="Only coaches can schedule live classes. Ask your coach to add one."
          actionLabel="Back to live classes"
          onAction={goBack}
        />
      )}
    </ScreenShell>
  );
}
