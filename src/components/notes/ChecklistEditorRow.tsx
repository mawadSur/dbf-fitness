import type { Dispatch } from 'react';
import { PixelRatio, View } from 'react-native';

import type { EditorAction } from '../../features/notes/checklist';
import type { NoteChecklistItem } from '../../services/transcription/types';
import { useOptionalTheme } from '../../theme/ThemeProvider';
import { shouldStackOptions } from '../account/AppearanceSection';
import { Button, Card, Chip } from '../ui';
import { EditorField } from './EditorField';
import { IconButton } from './IconButton';

type Props = {
  item: NoteChecklistItem;
  index: number;
  count: number;
  dispatch: Dispatch<EditorAction>;
  disabled: boolean;
};

/**
 * One editable row of a drafted checklist: what it says, whether it is an exercise or a note, its
 * sets and reps, where it sits in the list, and whether it stays.
 *
 * The type toggle and the two reorder buttons are three controls on one line, so they STACK once the
 * OS font scale reaches 1.3 — at 200% text a 360dp phone cannot fit them side by side, and clipping
 * a reorder arrow would make the row unusable (design system §9). Sets and reps stack with them for
 * the same reason.
 */
export function ChecklistEditorRow({ item, index, count, dispatch, disabled }: Props) {
  const { colors } = useOptionalTheme();
  const position = `item ${index + 1}`;
  const stacked = shouldStackOptions(PixelRatio.getFontScale());
  const isExercise = item.kind === 'exercise';

  return (
    <Card padding={16} style={{ marginBottom: 12 }}>
      <View style={{ gap: 12 }}>
        <EditorField
          label={isExercise ? 'Exercise' : 'Note'}
          accessibilityLabel={`Text for ${position}`}
          value={item.text}
          onChangeText={(text) => dispatch({ type: 'setText', key: item.key, text })}
          disabled={disabled}
          multiline
          placeholder={isExercise ? 'Exercise' : 'Note'}
        />

        {isExercise ? (
          <View style={{ flexDirection: stacked ? 'column' : 'row', gap: 8 }}>
            <EditorField
              label="Sets"
              accessibilityLabel={`Sets for ${position}`}
              value={item.sets !== undefined ? String(item.sets) : ''}
              onChangeText={(raw) => dispatch({ type: 'setSets', key: item.key, raw })}
              disabled={disabled}
              keyboardType="number-pad"
              returnKeyType="next"
              placeholder="3"
              maxLength={3}
              flex={stacked ? undefined : 1}
            />
            <EditorField
              label="Reps"
              accessibilityLabel={`Reps for ${position}`}
              value={item.reps ?? ''}
              onChangeText={(reps) => dispatch({ type: 'setReps', key: item.key, reps })}
              disabled={disabled}
              returnKeyType="done"
              placeholder="8-10"
              maxLength={40}
              flex={stacked ? undefined : 2}
            />
          </View>
        ) : null}

        <View
          testID={`editor-row-controls-${index}`}
          style={{
            flexDirection: stacked ? 'column' : 'row',
            alignItems: stacked ? 'stretch' : 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          {/* A Chip, not a switch: the row states its own type in words, and pressing it swaps it.
              The check icon on the selected state means the type is never colour alone (§9). */}
          <Chip
            label={isExercise ? 'Exercise' : 'Note'}
            icon={isExercise ? 'workout' : 'file-text'}
            selected={isExercise}
            disabled={disabled}
            onPress={() => dispatch({ type: 'toggleKind', key: item.key })}
            testID={`editor-kind-${index}`}
            style={stacked ? { alignSelf: 'stretch' } : undefined}
          />

          <View style={{ flexDirection: 'row', justifyContent: stacked ? 'flex-start' : 'flex-end', gap: 4 }}>
            <IconButton
              label={`Move ${position} up`}
              icon="chevron-up"
              disabled={disabled || index === 0}
              onPress={() => dispatch({ type: 'move', key: item.key, direction: -1 })}
            />
            <IconButton
              label={`Move ${position} down`}
              icon="chevron-down"
              disabled={disabled || index === count - 1}
              onPress={() => dispatch({ type: 'move', key: item.key, direction: 1 })}
            />
          </View>
        </View>

        {/* Removing is destructive, so it sits on its own row behind a divider, well away from
            "move down", and says what it does rather than showing a bare glyph. */}
        <View style={{ borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingTop: 8, alignItems: 'flex-end' }}>
          <Button
            label="Remove"
            variant="ghost"
            size="sm"
            leadingIcon="trash"
            disabled={disabled}
            accessibilityLabel={`Delete ${position}`}
            onPress={() => dispatch({ type: 'delete', key: item.key })}
            testID={`editor-delete-${index}`}
          />
        </View>
      </View>
    </Card>
  );
}
