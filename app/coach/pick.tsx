import { useRouter } from 'expo-router';
import { useCallback, useEffect, useReducer, type ReactElement } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';

import { CoachCard } from '../../src/components/coaching/CoachCard';
import { ConfirmPanel } from '../../src/components/coaching/ConfirmPanel';
import { confirmFlowReducer, initialConfirmFlow } from '../../src/components/coaching/confirmFlow';
import { ErrorBlock, LoadingBlock } from '../../src/components/coaching/StateBlock';
import { isStaffRole, useAccount } from '../../src/components/coaching/useAccount';
import { ListSkeleton } from '../../src/components/ui/LoadingSkeleton';
import {
  Banner,
  Button,
  EmptyState,
  FixedFooter,
  ScreenHeader,
  ScreenShell,
} from '../../src/components/ui';
import { ChooseCoachError } from '../../src/features/coaching/api';
import { useChooseCoach, useCoaches, useMyCoach } from '../../src/features/coaching/hooks';
import type { Coach, ChooseCoachErrorCode } from '../../src/features/coaching/types';

const SUCCESS_DELAY_MS = 1500;

export default function PickCoachScreen() {
  const router = useRouter();
  const account = useAccount();

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  }, [router]);

  const header = <ScreenHeader eyebrow="Coaching" title="Choose your coach" onBack={goBack} />;

  if (account.isLoading) {
    return (
      <ScreenShell header={header} testID="pick-coach">
        <LoadingBlock label="Loading your account…" />
      </ScreenShell>
    );
  }

  if (account.isError) {
    return (
      <ScreenShell header={header} testID="pick-coach">
        <ErrorBlock message="Could not load your account." onRetry={() => account.refetch()} />
      </ScreenShell>
    );
  }

  // Staff never get a coach, so the picker must not even ask the server for the list.
  if (account.data && isStaffRole(account.data.role)) {
    return (
      <ScreenShell header={header} testID="pick-coach">
        <EmptyState
          icon="info"
          title="Members only"
          message="Choosing a coach is for members only. Coaches and admins do not have a coach."
          actionLabel="Go back"
          onAction={goBack}
        />
      </ScreenShell>
    );
  }

  return <CoachList header={header} goBack={goBack} />;
}

function CoachList({ header, goBack }: { header: ReactElement; goBack: () => void }) {
  const coaches = useCoaches();
  const myCoach = useMyCoach();
  const choose = useChooseCoach();
  const [flow, dispatch] = useReducer(confirmFlowReducer, initialConfirmFlow);

  useEffect(() => {
    if (flow.status !== 'done') return;
    const timer = setTimeout(goBack, SUCCESS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [flow.status, goBack]);

  const submit = async (coachId: string) => {
    dispatch({ type: 'submit' });
    try {
      await choose.mutateAsync(coachId);
      dispatch({ type: 'succeed' });
    } catch (e) {
      const code: ChooseCoachErrorCode = e instanceof ChooseCoachError ? e.code : 'unknown';
      dispatch({ type: 'fail', code });
    }
  };

  const currentCoachId = myCoach.data?.coachId ?? null;
  const busy = flow.status === 'saving';
  const list = coaches.data ?? [];
  // Partial data: the list arrived but nobody on it can take a new member.
  const noneAccepting = list.length > 0 && !list.some((c) => c.acceptingMembers);

  const renderItem = useCallback(
    ({ item }: { item: Coach }) => (
      <CoachCard
        coach={item}
        currentCoachId={currentCoachId}
        disabled={busy}
        onSelect={(c) => dispatch({ type: 'select', coachId: c.coachId, coachName: c.fullName })}
      />
    ),
    [busy, currentCoachId],
  );

  const footer =
    flow.status === 'done' ? (
      <FixedFooter testID="choose-coach-done">
        <View style={{ gap: 12 }}>
          <Banner tone="success" title={`${flow.coachName} is now your coach.`} />
          <Button label="Done" onPress={goBack} fullWidth />
        </View>
      </FixedFooter>
    ) : flow.status !== 'idle' ? (
      <ConfirmPanel
        coachName={flow.coachName}
        hasCurrentCoach={!!currentCoachId}
        saving={busy}
        errorCode={flow.status === 'error' ? flow.code : undefined}
        onConfirm={() => submit(flow.coachId)}
        onCancel={() => dispatch({ type: 'cancel' })}
      />
    ) : null;

  return (
    <ScreenShell scroll={false} padded={false} header={header} footer={footer} testID="pick-coach">
      <FlatList
        data={list}
        keyExtractor={keyOf}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        ListHeaderComponent={
          noneAccepting ? (
            <Banner
              tone="info"
              title="No coach is taking new members right now"
              message="Check back soon, or ask your gym who is opening up next."
            />
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={coaches.isRefetching}
            onRefresh={() => {
              coaches.refetch();
              myCoach.refetch();
            }}
          />
        }
        ListEmptyComponent={
          coaches.isLoading ? (
            <ListSkeleton label="Loading coaches" />
          ) : coaches.isError ? (
            <ErrorBlock message="Could not load coaches." onRetry={() => coaches.refetch()} />
          ) : (
            <EmptyState
              icon="community"
              title="No coaches available yet"
              message="Once a coach joins DBF you can pick them here."
              actionLabel="Refresh"
              onAction={() => coaches.refetch()}
            />
          )
        }
      />
    </ScreenShell>
  );
}

const keyOf = (coach: Coach) => coach.coachId;
