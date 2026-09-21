import { useCallback, type Dispatch } from 'react';
import { FlatList, View } from 'react-native';

import type { EditorAction, EditorState } from '../../features/notes/checklist';
import { MAX_CHECKLIST_ITEMS, type NoteChecklistItem } from '../../services/transcription/types';
import { Banner, EmptyState, Text } from '../ui';
import { ChecklistEditorRow } from './ChecklistEditorRow';
import { EditorField } from './EditorField';
import { NotesButton } from './NotesButton';

type Props = {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  disabled?: boolean;
};

/** Editable checklist for a drafted note: title, items (text, kind, sets/reps), reorder, delete, add. */
export function ChecklistEditor({ state, dispatch, disabled = false }: Props) {
  const atLimit = state.items.length >= MAX_CHECKLIST_ITEMS;
  const count = state.items.length;

  const keyExtractor = useCallback((item: NoteChecklistItem) => item.key, []);

  const renderItem = useCallback(
    ({ item, index }: { item: NoteChecklistItem; index: number }) => (
      <ChecklistEditorRow item={item} index={index} count={count} dispatch={dispatch} disabled={disabled} />
    ),
    [count, dispatch, disabled],
  );

  // No section heading in the list header: the screen above already says "Draft" and what to
  // do with it, and repeating it would put the word twice in the first 40 pixels.
  return (
    <FlatList
      data={state.items}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 16 }}>
          <EditorField
            label="Checklist title"
            value={state.title}
            onChangeText={(title) => dispatch({ type: 'setTitle', title })}
            disabled={disabled}
            returnKeyType="done"
            placeholder="Checklist title"
          />
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          icon="file-text"
          title="No items yet"
          message="Add an exercise or a note below and it will appear here."
        />
      }
      ListFooterComponent={
        <View style={{ gap: 8, marginTop: 4 }}>
          <NotesButton
            label="Add exercise"
            variant="secondary"
            disabled={disabled || atLimit}
            onPress={() => dispatch({ type: 'add', kind: 'exercise' })}
          />
          <NotesButton
            label="Add note"
            variant="secondary"
            disabled={disabled || atLimit}
            onPress={() => dispatch({ type: 'add', kind: 'note' })}
          />
          {atLimit ? (
            <Banner
              tone="info"
              title="That is the most a checklist can hold"
              message={`Remove an item to add another. The limit is ${MAX_CHECKLIST_ITEMS}.`}
            />
          ) : null}
          <Text role="caption" tone="muted" tabularNums>
            {`${count} of ${MAX_CHECKLIST_ITEMS} items`}
          </Text>
        </View>
      }
    />
  );
}
