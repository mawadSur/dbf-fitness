import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, View, type ListRenderItemInfo } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner } from '../../src/components/ui';
import { GraceBanner } from '../../src/components/subscription/GraceBanner';
import { SubscriptionRequiredPanel } from '../../src/components/subscription/SubscriptionRequiredPanel';
import { NotesButton } from '../../src/components/notes/NotesButton';
import { NotesScreenShell } from '../../src/components/notes/NotesScreenShell';
import { RecordingListItem } from '../../src/components/notes/RecordingListItem';
import { StateMessage } from '../../src/components/notes/StateMessage';
import { retryTranscription } from '../../src/features/notes/api';
import { notesGate } from '../../src/features/notes/gating';
import {
  useCoachRecordings,
  useNotesViewer,
  useNowTick,
  usePublishedRecordings,
} from '../../src/features/notes/hooks';
import { retryAction, retryReason, uploadHref } from '../../src/features/notes/status';
import { useSubscriptionState } from '../../src/features/subscriptions/useSubscriptionState';
import type { RecordingSummary } from '../../src/features/notes/types';
import { transcriptionErrorMessage } from '../../src/services/transcription/types';

export default function NotesIndexScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const viewerQuery = useNotesViewer();
  const viewer = viewerQuery.data ?? null;
  const isCoach = viewer?.isCoach ?? false;

  const subscription = useSubscriptionState();
  const gate = notesGate({
    isCoach,
    info: subscription.data,
    loading: subscription.isLoading,
  });
  const memberBlocked = gate.kind === 'blocked' || gate.kind === 'checking';

  const coachQuery = useCoachRecordings(isCoach ? viewer?.id : undefined);
  // A blocked member's query would only come back empty (the server filters); do not ask.
  const memberQuery = usePublishedRecordings(!!viewer && !isCoach && !memberBlocked);
  // Re-render while something is in flight so a recording that turns stalled is flagged on time.
  useNowTick(isCoach);
  const listQuery = isCoach ? coachQuery : memberQuery;

  const [pullRefreshing, setPullRefreshing] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const retryBusy = useRef(false);

  const title = isCoach ? 'Recordings' : 'Workout notes';

  const refresh = async () => {
    setPullRefreshing(true);
    try {
      await listQuery.refetch();
    } finally {
      setPullRefreshing(false);
    }
  };

  const retry = useCallback(async (item: RecordingSummary) => {
    // An abandoned upload has no file to transcribe: the fix is to upload again.
    const reason = retryReason(item);
    if (reason && retryAction(reason) === 'upload') {
      router.push(uploadHref(item.liveClassId));
      return;
    }
    const id = item.id;
    if (retryBusy.current) return;
    retryBusy.current = true;
    setRetryingId(id);
    setRetryError(null);
    try {
      await retryTranscription(id);
    } catch (e) {
      setRetryError(transcriptionErrorMessage(e));
    } finally {
      retryBusy.current = false;
      setRetryingId(null);
      void queryClient.invalidateQueries({ queryKey: ['notes', 'coach-list'] });
    }
  }, [queryClient, router]);

  // FlatList re-renders EVERY row whenever `renderItem`/`keyExtractor` change
  // identity, so both are memoised: rebuilding them inline defeated the list's
  // virtualisation on a coach's recording list (design system §8).
  const keyExtractor = useCallback((item: RecordingSummary) => item.id, []);
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<RecordingSummary>) => (
      <RecordingListItem
        recording={item}
        showStatus={isCoach}
        retrying={retryingId === item.id}
        onRetry={isCoach ? () => void retry(item) : undefined}
        onPress={() => router.push(`/notes/${item.id}`)}
      />
    ),
    [isCoach, retryingId, retry, router],
  );

  if (viewerQuery.isLoading) {
    return (
      <NotesScreenShell title="Workout notes">
        <StateMessage kind="loading" />
      </NotesScreenShell>
    );
  }
  if (viewerQuery.isError || !viewer) {
    return (
      <NotesScreenShell title="Workout notes">
        <StateMessage
          kind="error"
          title="Could not load your account"
          message="Check your connection and try again."
          onRetry={() => void viewerQuery.refetch()}
        />
      </NotesScreenShell>
    );
  }

  if (gate.kind === 'checking') {
    return (
      <NotesScreenShell title={title}>
        <StateMessage kind="loading" />
      </NotesScreenShell>
    );
  }
  if (gate.kind === 'blocked') {
    return (
      <NotesScreenShell title={title}>
        <SubscriptionRequiredPanel
          state={gate.reason}
          onRecheck={() => void subscription.refetch()}
          checking={subscription.isFetching}
        />
      </NotesScreenShell>
    );
  }

  const recordings = listQuery.data ?? [];

  return (
    <NotesScreenShell title={title}>
      {listQuery.isLoading ? (
        <StateMessage kind="loading" />
      ) : listQuery.isError ? (
        <StateMessage
          kind="error"
          title="Could not load recordings"
          message="Check your connection and try again."
          onRetry={() => void listQuery.refetch()}
        />
      ) : (
        <FlatList
          data={recordings}
          keyExtractor={keyExtractor}
          refreshing={pullRefreshing}
          onRefresh={() => void refresh()}
          contentContainerStyle={{ padding: 16, paddingBottom: Math.max(insets.bottom, 16) + 16, gap: 12 }}
          ListHeaderComponent={
            gate.kind === 'grace' ? (
              <View style={{ marginHorizontal: -16, marginBottom: 4 }}>
                <GraceBanner info={gate.info} />
              </View>
            ) : isCoach ? (
              <View style={{ gap: 8, marginBottom: 4 }}>
                <NotesButton
                  label="Upload recording"
                  onPress={() => router.push('/notes/upload')}
                />
                {retryError ? (
                  <Banner tone="danger" title="Could not restart transcription" message={retryError} />
                ) : null}
              </View>
            ) : null
          }
          ListEmptyComponent={
            <StateMessage
              kind="empty"
              title={isCoach ? 'No recordings yet' : 'No workout notes yet'}
              message={
                isCoach
                  ? 'Upload a class recording and we will draft a checklist for your members.'
                  : 'When your coach publishes notes from a class, they will show up here.'
              }
            />
          }
          renderItem={renderItem}
        />
      )}
    </NotesScreenShell>
  );
}
