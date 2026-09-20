import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useReducer, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Text, View } from 'react-native';

import { publishNote, retryTranscription, saveEditedContent } from '../../features/notes/api';
import { editorReducer, initialEditorState, serializeEditor } from '../../features/notes/checklist';
import { notesKeys } from '../../features/notes/hooks';
import {
  isInFlight,
  RETRY_COPY,
  retryAction,
  retryReason,
  statusUi,
  uploadHref,
  type RetryReason,
} from '../../features/notes/status';
import type { RecordingDetail } from '../../features/notes/types';
import { transcriptionErrorMessage } from '../../services/transcription/types';
import { colors } from '../../theme/tokens';
import { BottomActionBar } from './BottomActionBar';
import { ChecklistEditor } from './ChecklistEditor';
import { MemberChecklist } from './MemberChecklist';
import { NotesButton } from './NotesButton';
import { StatusChip } from './StatusChip';

type Props = {
  recording: RecordingDetail;
  onRefetch: () => void;
};

function Banner({ tone, text }: { tone: 'error' | 'ok'; text: string }) {
  return (
    <Text
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      style={{
        marginHorizontal: 16,
        marginTop: 8,
        fontSize: 13,
        color: tone === 'error' ? '#B91C1C' : '#047857',
      }}
    >
      {text}
    </Text>
  );
}

/**
 * The one control that re-runs the pipeline. Shared by the failed panel and the in-flight panel,
 * because a recording stuck at 'uploading' (file up, hand-off lost) or at 'transcribing' with an
 * expired lease needs exactly the same call — and without it the coach has no way out: the status
 * machine is trigger-protected, so they cannot move the row themselves.
 */
function RetryControl({
  recordingId,
  liveClassId,
  reason,
  onRefetch,
}: {
  recordingId: string;
  liveClassId: string | null;
  reason: RetryReason;
  onRefetch: () => void;
}) {
  const router = useRouter();
  const label = RETRY_COPY[reason].label;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  const retry = async () => {
    // No file was ever uploaded, so there is nothing to transcribe: go back to the upload screen.
    if (retryAction(reason) === 'upload') {
      router.push(uploadHref(liveClassId));
      return;
    }
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await retryTranscription(recordingId);
    } catch (e) {
      setError(transcriptionErrorMessage(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
      onRefetch();
    }
  };

  return (
    <View style={{ gap: 8 }}>
      {error ? (
        <Text accessibilityRole="alert" style={{ fontSize: 14, color: '#B91C1C' }}>
          {error}
        </Text>
      ) : null}
      <NotesButton label={label} busy={busy} onPress={() => void retry()} />
    </View>
  );
}

function ProgressPanel({ recording, onRefetch }: Props) {
  const ui = statusUi(recording.status);
  const stalled = retryReason(recording);

  return (
    <View style={{ padding: 16, gap: 12 }}>
      <StatusChip status={recording.status} />
      <View
        accessibilityLiveRegion="polite"
        style={{
          borderWidth: 1,
          borderColor: '#E2E8F0',
          backgroundColor: '#F8FAFC',
          borderRadius: 12,
          padding: 20,
          gap: 12,
          alignItems: 'center',
        }}
      >
        {stalled ? null : <ActivityIndicator color={colors.primary} size="large" />}
        <Text style={{ fontSize: 16, fontWeight: '600', color: '#0F172A', textAlign: 'center' }}>
          {ui.label}
        </Text>
        <Text style={{ fontSize: 14, color: '#475569', textAlign: 'center' }}>{ui.description}</Text>
        {stalled === 'upload_incomplete' ? null : (
          <Text style={{ fontSize: 12, color: '#475569', textAlign: 'center' }}>
            This page updates on its own. You can leave and come back.
          </Text>
        )}
      </View>
      {stalled ? (
        <View style={{ gap: 8 }}>
          <Text accessibilityRole="alert" style={{ fontSize: 14, color: '#B91C1C' }}>
            {RETRY_COPY[stalled].explanation}
          </Text>
          <RetryControl
            recordingId={recording.id}
            liveClassId={recording.liveClassId}
            reason={stalled}
            onRefetch={onRefetch}
          />
        </View>
      ) : null}
    </View>
  );
}

function FailedPanel({ recording, onRefetch }: Props) {
  return (
    <View style={{ padding: 16, gap: 12 }}>
      <StatusChip status="failed" />
      <Text style={{ fontSize: 16, fontWeight: '600', color: '#0F172A' }}>
        {statusUi('failed').description}
      </Text>
      {recording.errorMessage ? (
        <Text accessibilityRole="alert" style={{ fontSize: 14, color: '#B91C1C' }}>
          {recording.errorMessage}
        </Text>
      ) : null}
      <RetryControl
        recordingId={recording.id}
        liveClassId={recording.liveClassId}
        reason="failed"
        onRefetch={onRefetch}
      />
    </View>
  );
}

function DraftEditor({ recording, onRefetch }: Props) {
  const queryClient = useQueryClient();
  // Initialised once on mount: later refetches (focus) must never clobber in-progress edits.
  const [state, dispatch] = useReducer(editorReducer, recording, initialEditorState);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);
  const busyRef = useRef(false);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: notesKeys.detail(recording.id) });
    void queryClient.invalidateQueries({ queryKey: ['notes', 'coach-list'] });
    void queryClient.invalidateQueries({ queryKey: notesKeys.memberList });
  };

  const run = async (kind: 'save' | 'publish') => {
    if (busyRef.current) return;
    if (!recording.noteId) {
      // No pull-to-refresh on the editor: refetch ourselves so the draft id can arrive.
      onRefetch();
      setMessage({
        tone: 'error',
        text: 'This recording has no draft to save yet. Checking again now, try once more in a moment.',
      });
      return;
    }
    const serialized = serializeEditor(state);
    if (!serialized.ok) {
      setConfirming(false);
      setMessage({ tone: 'error', text: serialized.reason });
      return;
    }
    busyRef.current = true;
    setSaving(true);
    setMessage(null);
    try {
      if (kind === 'publish') await publishNote(recording.noteId, serialized.json);
      else await saveEditedContent(recording.noteId, serialized.json);
      dispatch({ type: 'saved' });
      setConfirming(false);
      setMessage({
        tone: 'ok',
        text: kind === 'publish' ? 'Published. Your members can see it now.' : 'Changes saved.',
      });
      invalidate();
      onRefetch();
    } catch {
      setMessage({
        tone: 'error',
        text:
          kind === 'publish'
            ? 'Could not publish. Check your connection and try again.'
            : 'Could not save your changes. Check your connection and try again.',
      });
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      // Android runs edge-to-edge (the window no longer resizes for the keyboard), so it needs an
      // explicit behavior too, or the focused field and the action bar sit under the keyboard.
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 4 }}>
        <StatusChip status="draft" />
        <Text style={{ fontSize: 13, color: '#475569' }}>{statusUi('draft').description}</Text>
      </View>
      {message ? <Banner tone={message.tone} text={message.text} /> : null}

      <View style={{ flex: 1 }}>
        <ChecklistEditor state={state} dispatch={dispatch} disabled={saving} />
      </View>

      <BottomActionBar>
        {confirming ? (
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 14, color: '#0F172A' }}>
              Publish this checklist? Your members will see it right away.
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <NotesButton
                label="Cancel"
                variant="secondary"
                disabled={saving}
                onPress={() => setConfirming(false)}
                style={{ flex: 1 }}
              />
              <NotesButton
                label="Confirm publish"
                busy={saving}
                onPress={() => void run('publish')}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <NotesButton
              label={state.dirty ? 'Save changes' : 'Saved'}
              variant="secondary"
              busy={saving}
              disabled={!state.dirty}
              onPress={() => void run('save')}
              style={{ flex: 1 }}
            />
            <NotesButton
              label="Publish"
              disabled={saving}
              onPress={() => {
                const serialized = serializeEditor(state);
                if (!serialized.ok) setMessage({ tone: 'error', text: serialized.reason });
                else {
                  setMessage(null);
                  setConfirming(true);
                }
              }}
              style={{ flex: 1 }}
            />
          </View>
        )}
      </BottomActionBar>
    </KeyboardAvoidingView>
  );
}

/** Coach view of one recording, chosen by the status the database reports. */
export function CoachRecordingView({ recording, onRefetch }: Props) {
  if (isInFlight(recording.status)) return <ProgressPanel recording={recording} onRefetch={onRefetch} />;
  if (recording.status === 'failed') return <FailedPanel recording={recording} onRefetch={onRefetch} />;
  if (recording.status === 'draft') return <DraftEditor recording={recording} onRefetch={onRefetch} />;

  // published: read-only.
  return recording.checklist ? (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <StatusChip status="published" />
      </View>
      <MemberChecklist
        readOnly
        checklist={recording.checklist}
        checkedKeys={new Set()}
        onToggle={() => undefined}
      />
    </View>
  ) : (
    <View style={{ padding: 16, gap: 8 }}>
      <StatusChip status="published" />
      <Text style={{ fontSize: 14, color: '#475569' }}>This note has no checklist content.</Text>
    </View>
  );
}
