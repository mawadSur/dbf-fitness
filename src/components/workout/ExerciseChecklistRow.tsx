import { View } from 'react-native';

import { ExercisePictogram } from '../exercises';
import { ChecklistRow } from '../ui';

export type ExerciseChecklistRowProps = {
  name: string;
  repsOrDuration: string;
  /** Stored pictogram key; null falls back to the name, then to a category. */
  imageKey: string | null;
  checked: boolean;
  onToggle: () => void;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
};

/**
 * A checklist row with the exercise's pictogram thumbnail in front of it.
 *
 * The design-system `ChecklistRow` owns the checkbox, the label and the
 * details affordance and has no leading slot, so the tile sits beside it
 * rather than inside it — see `uiRequests` in this stream's report for the
 * `leading` prop that would let this collapse into the primitive.
 *
 * The pictogram is decorative: `ExercisePictogram` hides it from screen
 * readers, and the row's own accessible name already carries the exercise.
 */
export function ExerciseChecklistRow({
  name,
  repsOrDuration,
  imageKey,
  checked,
  onToggle,
  onPress,
  disabled = false,
  testID,
}: ExerciseChecklistRowProps) {
  return (
    <View
      testID={testID}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
    >
      <ExercisePictogram imageKey={imageKey} name={name} variant="thumb" />
      <ChecklistRow
        label={name}
        sublabel={repsOrDuration}
        checked={checked}
        onToggle={onToggle}
        onPress={onPress}
        disabled={disabled}
        style={{ flex: 1 }}
      />
    </View>
  );
}
