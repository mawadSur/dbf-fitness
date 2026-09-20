import type { Dispatch } from 'react';
import { FlatList, Text, TextInput, View } from 'react-native';

import type { EditorAction, EditorState } from '../../features/notes/checklist';
import { MAX_CHECKLIST_ITEMS, type NoteChecklistItem } from '../../services/transcription/types';
import { NotesButton } from './NotesButton';
import { PressableBase } from '../ui/PressableBase';

type Props = {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  disabled?: boolean;
};

const inputStyle = {
  minHeight: 44,
  borderWidth: 1,
  borderColor: '#CBD5E1',
  borderRadius: 10,
  paddingHorizontal: 12,
  paddingVertical: 10,
  fontSize: 16,
  color: '#0F172A',
  backgroundColor: '#FFFFFF',
} as const;

function IconButton({
  label,
  glyph,
  onPress,
  disabled,
}: {
  label: string;
  glyph: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <PressableBase
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      android_ripple={{ color: '#E2E8F0', borderless: true }}
      pressFeedback={disabled ? 'none' : 0.6}
      // Layout NEVER goes in a style callback — see `PressableBase`.
      style={{
        minWidth: 44,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.35 : 1,
      }}
    >
      <Text style={{ fontSize: 18, color: '#334155' }}>{glyph}</Text>
    </PressableBase>
  );
}

function EditorRow({
  item,
  index,
  count,
  dispatch,
  disabled,
}: {
  item: NoteChecklistItem;
  index: number;
  count: number;
  dispatch: Dispatch<EditorAction>;
  disabled: boolean;
}) {
  const position = `item ${index + 1}`;
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: '#E2E8F0',
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        padding: 12,
        gap: 8,
        marginBottom: 12,
      }}
    >
      <TextInput
        value={item.text}
        onChangeText={(text) => dispatch({ type: 'setText', key: item.key, text })}
        editable={!disabled}
        multiline
        placeholder={item.kind === 'exercise' ? 'Exercise' : 'Note'}
        placeholderTextColor="#64748B"
        accessibilityLabel={`Text for ${position}`}
        autoCapitalize="sentences"
        returnKeyType="default"
        style={{ ...inputStyle, textAlignVertical: 'top' }}
      />

      {item.kind === 'exercise' ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={item.sets !== undefined ? String(item.sets) : ''}
            onChangeText={(raw) => dispatch({ type: 'setSets', key: item.key, raw })}
            editable={!disabled}
            keyboardType="number-pad"
            returnKeyType="next"
            placeholder="Sets"
            placeholderTextColor="#64748B"
            maxLength={3}
            accessibilityLabel={`Sets for ${position}`}
            style={{ ...inputStyle, flex: 1 }}
          />
          <TextInput
            value={item.reps ?? ''}
            onChangeText={(reps) => dispatch({ type: 'setReps', key: item.key, reps })}
            editable={!disabled}
            returnKeyType="done"
            placeholder="Reps (e.g. 8-10)"
            placeholderTextColor="#64748B"
            maxLength={40}
            accessibilityLabel={`Reps for ${position}`}
            style={{ ...inputStyle, flex: 2 }}
          />
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <PressableBase
          onPress={() => dispatch({ type: 'toggleKind', key: item.key })}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`${position} is ${item.kind === 'exercise' ? 'an exercise' : 'a note'}. Switch type`}
          accessibilityState={{ disabled }}
          android_ripple={{ color: '#E2E8F0' }}
          pressFeedback={0.7}
          // Layout NEVER goes in a style callback — see `PressableBase`.
          style={{
            minHeight: 44,
            paddingHorizontal: 12,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: '#CBD5E1',
            backgroundColor: '#FFFFFF',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#0F172A' }}>
            {item.kind === 'exercise' ? 'Exercise' : 'Note'}
          </Text>
        </PressableBase>

        <View style={{ flexDirection: 'row' }}>
          <IconButton
            label={`Move ${position} up`}
            glyph="↑"
            disabled={disabled || index === 0}
            onPress={() => dispatch({ type: 'move', key: item.key, direction: -1 })}
          />
          <IconButton
            label={`Move ${position} down`}
            glyph="↓"
            disabled={disabled || index === count - 1}
            onPress={() => dispatch({ type: 'move', key: item.key, direction: 1 })}
          />
        </View>
      </View>

      {/* Removing is destructive, so it lives on its own row, well away from the edit and reorder
          controls, as a labelled button rather than a bare glyph one thumb-slip from "move down". */}
      <View style={{ borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 8, alignItems: 'flex-end' }}>
        <PressableBase
          onPress={() => dispatch({ type: 'delete', key: item.key })}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${position}`}
          accessibilityState={{ disabled }}
          android_ripple={{ color: '#FEE2E2' }}
          pressFeedback={disabled ? 'none' : 0.6}
          // Layout NEVER goes in a style callback — see `PressableBase`.
          style={{
            minHeight: 44,
            minWidth: 44,
            paddingHorizontal: 12,
            borderRadius: 10,
            justifyContent: 'center',
            opacity: disabled ? 0.35 : 1,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#B91C1C' }}>Remove</Text>
        </PressableBase>
      </View>
    </View>
  );
}

/** Editable checklist for a drafted note: title, items (text, kind, sets/reps), reorder, delete, add. */
export function ChecklistEditor({ state, dispatch, disabled = false }: Props) {
  const atLimit = state.items.length >= MAX_CHECKLIST_ITEMS;
  return (
    <FlatList
      data={state.items}
      keyExtractor={(item) => item.key}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
      ListHeaderComponent={
        <View style={{ gap: 8, marginBottom: 16 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#475569' }}>Checklist title</Text>
          <TextInput
            value={state.title}
            onChangeText={(title) => dispatch({ type: 'setTitle', title })}
            editable={!disabled}
            returnKeyType="done"
            placeholder="Checklist title"
            placeholderTextColor="#64748B"
            accessibilityLabel="Checklist title"
            style={inputStyle}
          />
        </View>
      }
      renderItem={({ item, index }) => (
        <EditorRow
          item={item}
          index={index}
          count={state.items.length}
          dispatch={dispatch}
          disabled={disabled}
        />
      )}
      ListEmptyComponent={
        <Text style={{ fontSize: 14, color: '#475569', paddingVertical: 8 }}>
          No items yet. Add an exercise or a note below.
        </Text>
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
            <Text style={{ fontSize: 12, color: '#475569' }}>
              {`A checklist can hold up to ${MAX_CHECKLIST_ITEMS} items.`}
            </Text>
          ) : null}
        </View>
      }
    />
  );
}
