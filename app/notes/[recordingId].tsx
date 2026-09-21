import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Text } from '../../src/components/ui';
import { GraceBanner } from '../../src/components/subscription/GraceBanner';
import { SubscriptionRequiredPanel } from '../../src/components/subscription/SubscriptionRequiredPanel';
import { CoachRecordingView } from '../../src/components/notes/CoachRecordingView';
import { MemberChecklist } from '../../src/components/notes/MemberChecklist';
import { NotesScreenShell } from '../../src/components/notes/NotesScreenShell';
import { StateMessage } from '../../src/components/notes/StateMessage';
import { formatRecordingDate } from '../../src/components/notes/RecordingListItem';
import { notesGate } from '../../src/features/notes/gating';
import {
  useMemberProgress,
  useNotesViewer,
  useNowTick,
  useRecordingDetail,
} from '../../src/features/notes/hooks';
import { useSubscriptionState } from '../../src/features/subscriptions/useSubscriptionState';

export default function RecordingDetailScreen() {
  const params = useLocalSearchParams<{ recordingId?: string | string[] }>();
  const recordingId = Array.isArray(params.recordingId) ? params.recordingId[0] : params.recordingId;

  const viewerQuery = useNotesViewer();
  const detailQuery = useRecordingDetail(recordingId ?? '');
  const viewer = viewerQuery.data ?? null;
  const recording = detailQuery.data ?? null;

  const subscription = useSubscriptionState();
  const gate = notesGate({
    isCoach: viewer?.isCoach ?? false,
    info: subscription.data,
    loading: subscription.isLoading,
  });
  useNowTick(!!viewer?.isCoach);

  const memberNoteId =
    viewer && !viewer.isCoach && gate.kind !== 'blocked' && recording?.status === 'published'
      ? recording.noteId
      : null;
  const progress = useMemberProgress(memberNoteId);

  const title = recording?.classTitle ?? 'Workout notes';

  if (!recordingId) {
    return (
      <NotesScreenShell title="Workout notes" fallbackHref="/notes">
        <StateMessage kind="empty" title="Recording not found" />
      </NotesScreenShell>
    );
  }

  // A blocked member is told why before anything else: the server returns no rows for them, and
  // "not available" or a raw error would leave them with no way forward.
  if (viewer && !viewer.isCoach && gate.kind === 'blocked') {
    return (
      <NotesScreenShell title="Workout notes" fallbackHref="/notes">
        <SubscriptionRequiredPanel
          state={gate.reason}
          onRecheck={() => void subscription.refetch()}
          checking={subscription.isFetching}
        />
      </NotesScreenShell>
    );
  }

  if (viewerQuery.isLoading || detailQuery.isLoading || (viewer && gate.kind === 'checking')) {
    return (
      <NotesScreenShell title="Workout notes" fallbackHref="/notes">
        <StateMessage kind="loading" />
      </NotesScreenShell>
    );
  }

  if (viewerQuery.isError || detailQuery.isError || !viewer) {
    return (
      <NotesScreenShell title="Workout notes" fallbackHref="/notes">
        <StateMessage
          kind="error"
          title="Could not load this recording"
          message="Check your connection and try again."
          onRetry={() => {
            void viewerQuery.refetch();
            void detailQuery.refetch();
          }}
        />
      </NotesScreenShell>
    );
  }

  if (!recording) {
    return (
      <NotesScreenShell title="Workout notes" fallbackHref="/notes">
        <StateMessage
          kind="denied"
          title="Recording not available"
          message="It may have been removed, or it is not shared with you."
        />
      </NotesScreenShell>
    );
  }

  if (viewer.isCoach) {
    return (
      <NotesScreenShell title={title} fallbackHref="/notes">
        <CoachRecordingView recording={recording} onRefetch={() => void detailQuery.refetch()} />
      </NotesScreenShell>
    );
  }

  // Member: only a published checklist is ever shown.
  if (recording.status !== 'published' || !recording.checklist || !recording.noteId) {
    return (
      <NotesScreenShell title={title} fallbackHref="/notes">
        <StateMessage
          kind="denied"
          title="Not published yet"
          message="Your coach has not published notes for this class yet."
        />
      </NotesScreenShell>
    );
  }

  return (
    <NotesScreenShell title={title} fallbackHref="/notes">
      {gate.kind === 'grace' ? <GraceBanner info={gate.info} /> : null}
      {progress.isError ? (
        <StateMessage
          kind="error"
          title="Could not load your progress"
          message="Your checks may be out of date."
          onRetry={() => void progress.refetch()}
        />
      ) : null}
      <View style={{ flex: 1 }}>
        <MemberChecklist
          checklist={recording.checklist}
          checkedKeys={progress.checkedKeys}
          onToggle={progress.toggle}
          subtitle={formatRecordingDate(recording.classStartsAt ?? recording.createdAt) || null}
          errorNotice={progress.toggleError ? 'Could not save that check. Try again.' : null}
          refreshing={detailQuery.isRefetching}
          onRefresh={() => {
            void detailQuery.refetch();
            void progress.refetch();
          }}
        />
        {progress.isLoading ? (
          <Text role="bodySm" tone="muted" style={{ textAlign: 'center', paddingBottom: 8 }}>
            Loading your progress…
          </Text>
        ) : null}
      </View>
    </NotesScreenShell>
  );
}
