import { useRouter } from 'expo-router';
import { useCallback, useEffect, useReducer, type ReactElement } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '../../src/components/coaching/BackButton';
import { CoachCard } from '../../src/components/coaching/CoachCard';
import { ConfirmPanel } from '../../src/components/coaching/ConfirmPanel';
import { confirmFlowReducer, initialConfirmFlow } from '../../src/components/coaching/confirmFlow';
import { ErrorBlock, LoadingBlock, PrimaryButton } from '../../src/components/coaching/StateBlock';
import { isStaffRole, useAccount } from '../../src/components/coaching/useAccount';
import { ChooseCoachError } from '../../src/features/coaching/api';
import { useChooseCoach, useCoaches, useMyCoach } from '../../src/features/coaching/hooks';
import type { Coach, ChooseCoachErrorCode } from '../../src/features/coaching/types';

const SUCCESS_DELAY_MS = 1500;

export default function PickCoachScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const account = useAccount();

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  }, [router]);

  const header = (
    <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 8, gap: 8 }}>
      <View style={{ alignItems: 'flex-start' }}>
        <BackButton onPress={goBack} />
      </View>
      <Text accessibilityRole="header" style={{ fontSize: 26, fontWeight: '800', color: '#0F172A' }}>
        Choose your coach
      </Text>
    </View>
  );

  if (account.isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
        {header}
        <LoadingBlock />
      </View>
    );
  }

  if (account.data && isStaffRole(account.data.role)) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
        {header}
        <View style={{ padding: 16 }}>
          <Text style={{ fontSize: 15, color: '#334155' }}>
            Choosing a coach is for members only. Coaches and admins do not have a coach.
          </Text>
        </View>
      </View>
    );
  }

  return <CoachList header={header} goBack={goBack} bottomInset={insets.bottom} />;
}

function CoachList({
  header,
  goBack,
  bottomInset,
}: {
  header: ReactElement;
  goBack: () => void;
  bottomInset: number;
}) {
  const coaches = useCoaches();
  const myCoach = useMyCoach();
  const choose = useChooseCoach();
  const [flow, dispatch] = useReducer(confirmFlowReducer, initialConfirmFlow);

  useEffect(() => {
    if (flow.status !== 'done') return;
    const t = setTimeout(goBack, SUCCESS_DELAY_MS);
    return () => clearTimeout(t);
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

  return (
    <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <FlatList
        data={coaches.data ?? []}
        keyExtractor={(c) => c.coachId}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: 24, gap: 12 }}
        refreshControl={
          <RefreshControl
            refreshing={coaches.isRefetching}
            onRefresh={() => {
              coaches.refetch();
              myCoach.refetch();
            }}
          />
        }
        renderItem={({ item }: { item: Coach }) => (
          <View style={{ paddingHorizontal: 16 }}>
            <CoachCard
              coach={item}
              currentCoachId={currentCoachId}
              disabled={busy}
              onSelect={(c) => dispatch({ type: 'select', coachId: c.coachId, coachName: c.fullName })}
            />
          </View>
        )}
        ListEmptyComponent={
          coaches.isLoading ? (
            <LoadingBlock label="Loading coaches…" />
          ) : coaches.isError ? (
            <View style={{ paddingHorizontal: 16 }}>
              <ErrorBlock message="Could not load coaches." onRetry={() => coaches.refetch()} />
            </View>
          ) : (
            <View style={{ padding: 24, alignItems: 'center' }}>
              <Text style={{ fontSize: 16, color: '#334155' }}>No coaches available yet</Text>
            </View>
          )
        }
      />

      {flow.status === 'done' ? (
        <View
          accessibilityRole="alert"
          style={{ backgroundColor: '#ECFDF5', padding: 16, paddingBottom: bottomInset + 16, gap: 10 }}
        >
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#065F46' }}>
            {`${flow.coachName} is now your coach.`}
          </Text>
          <PrimaryButton label="Done" onPress={goBack} />
        </View>
      ) : flow.status !== 'idle' ? (
        <View style={{ paddingBottom: bottomInset, backgroundColor: '#F0FDF4' }}>
          <ConfirmPanel
            coachName={flow.coachName}
            hasCurrentCoach={!!currentCoachId}
            saving={busy}
            errorCode={flow.status === 'error' ? flow.code : undefined}
            onConfirm={() => submit(flow.coachId)}
            onCancel={() => dispatch({ type: 'cancel' })}
          />
        </View>
      ) : null}
    </View>
  );
}
