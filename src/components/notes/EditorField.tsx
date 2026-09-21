import { useState } from 'react';
import { TextInput, View, type KeyboardTypeOptions, type ReturnKeyTypeOptions } from 'react-native';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import { INPUT_MIN_HEIGHT, Text } from '../ui';

export type EditorFieldProps = {
  /** What the coach reads above the field ("Exercise", "Sets"). */
  label: string;
  /**
   * What a screen reader says instead, when the visible label alone is ambiguous
   * ("Sets" is meaningless when eleven rows each have one — "Sets for item 2" is not).
   */
  accessibilityLabel?: string;
  /** Hides the visible label when the row above already names the group. */
  labelHidden?: boolean;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: KeyboardTypeOptions;
  returnKeyType?: ReturnKeyTypeOptions;
  maxLength?: number;
  disabled?: boolean;
  /** Rendered under the field, e.g. a character counter. */
  helperText?: string;
  flex?: number;
  testID?: string;
};

/**
 * `src/components/ui/Input` with a visible label that can differ from the accessible name.
 *
 * The checklist editor needs both: the eye wants "Exercise" / "Sets" / "Reps" once per row, while a
 * screen reader (and the tests that stand in for one) needs "Sets for item 2" so a coach moving
 * through eleven identical rows knows which one has focus. Geometry, radius, focus ring and colours
 * are read from the same tokens as `Input`, so the fields are indistinguishable on screen.
 *
 * Listed under `uiRequests`: the shared fix is `Input` taking `accessibilityLabel` and
 * `labelHidden`, after which this file goes away.
 */
export function EditorField({
  label,
  accessibilityLabel,
  labelHidden = false,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  keyboardType,
  returnKeyType,
  maxLength,
  disabled = false,
  helperText,
  flex,
  testID,
}: EditorFieldProps) {
  const { colors, tokens } = useOptionalTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={{ gap: 6, flex }}>
      {labelHidden ? null : (
        <Text role="labelSm" tone="default">
          {label}
        </Text>
      )}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: INPUT_MIN_HEIGHT,
          borderRadius: tokens.radii.md,
          borderWidth: focused ? 2 : 1,
          borderColor: focused ? colors.focus : colors.borderStrong,
          backgroundColor: colors.surface,
          paddingHorizontal: tokens.space.md,
          opacity: disabled ? 0.45 : 1,
        }}
      >
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          editable={!disabled}
          multiline={multiline}
          keyboardType={keyboardType}
          returnKeyType={returnKeyType}
          maxLength={maxLength}
          autoCapitalize={multiline ? 'sentences' : 'none'}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityState={{ disabled }}
          style={{
            flex: 1,
            paddingVertical: multiline ? 12 : 8,
            minHeight: multiline ? 72 : undefined,
            textAlignVertical: multiline ? 'top' : 'center',
            color: colors.text,
            ...tokens.typeScale.body,
          }}
        />
      </View>

      {helperText ? (
        <Text role="caption" tone="muted">
          {helperText}
        </Text>
      ) : null}
    </View>
  );
}
