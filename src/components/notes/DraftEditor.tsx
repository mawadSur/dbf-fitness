import { useQueryClient } from '@tanstack/react-query';
import { useReducer, useRef, useState } from 'react';
import { KeyboardAvoidingView, View } from 'react-native';

import { publishNote, saveEditedContent } from '../../features/notes/api';
import { editorReducer, initialEditorState, serializeEditor } from '../../features/notes/checklist';
import { notesKeys } from '../../features/notes/hooks';
import { statusUi } from '../../features/notes/status';
import type { RecordingDetail } from '../../features/notes/types';
import { KEYBOARD_AVOIDING_BEHAVIOR } from '../keyboard';
import { Banner, Text } from '../ui';
import { BottomActionBar } from './BottomActionBar';
import { ChecklistEditor } from './ChecklistEditor';
import { NotesButton } from './NotesButton';
import { StatusChip } from './StatusChip';

type Props = {
  recording: RecordingDetail;
  onRefetch: () => void;
};

type Message = { tone: 'error' | 'ok'; text: string };

/** The coach's draft: edit the generated checklist, save it, publish it behind a confirmation. */
export function DraftEditor({ recording, onRefetch }: Props) {
  const queryClient = useQueryClient();
  // Initialised once on mount: later refetches (focus) must never clobber in-progress edits.
  const [state, dispatch] = useReducer(editorReducer, recording, initialEditorState);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
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
      behavior={KEYBOARD_AVOIDING_BEHAVIOR}
      style={{ flex: 1 }}
    >
      <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 6 }}>
        <StatusChip status="draft" />
        <Text role="bodySm" tone="secondary">
          {statusUi('draft').description}
        </Text>
      </View>
      {message ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <Banner tone={message.tone === 'error' ? 'danger' : 'success'} title={message.text} />
        </View>
      ) : null}

      <View style={{ flex: 1 }}>
        <ChecklistEditor state={state} dispatch={dispatch} disabled={saving} />
      </View>

      <BottomActionBar>
        {confirming ? (
          <View style={{ gap: 8 }}>
            <Text role="body">Publish this checklist? Your members will see it right away.</Text>
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
