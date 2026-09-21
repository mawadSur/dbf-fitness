import { useState } from 'react';
import {
  Platform,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type ReturnKeyTypeOptions,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import { Icon } from './Icon';
import { hitSlopFor, minTouchTarget } from './layout';
import { PressableBase } from './PressableBase';
import { Text } from './Typography';

export const INPUT_MIN_HEIGHT = 48;

export type InputProps = {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  /** Guidance under the field; replaced by `error` when there is one. */
  helperText?: string;
  /** Presence of this string puts the field in the error state. */
  error?: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoComplete?: TextInputProps['autoComplete'];
  textContentType?: TextInputProps['textContentType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  returnKeyType?: ReturnKeyTypeOptions;
  onSubmitEditing?: () => void;
  multiline?: boolean;
  disabled?: boolean;
  /** Announced in the label, not signalled by colour alone. */
  required?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Text field (design system §5): label above, min-h 48, border-strong, focus ring,
 * helper/error below with an icon. Errors sit next to the field and say how to
 * recover (§9).
 */
export function Input({
  label,
  value,
  onChangeText,
  placeholder,
  helperText,
  error,
  secureTextEntry = false,
  keyboardType,
  autoComplete,
  textContentType,
  autoCapitalize,
  returnKeyType,
  onSubmitEditing,
  multiline = false,
  disabled = false,
  required = false,
  style,
  testID,
}: InputProps) {
  const { colors, tokens } = useOptionalTheme();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const invalid = !!error;
  // A disabled field takes the disabled pair rather than `opacity: 0.45` over
  // the live skin, for the same reason `Button` and `Chip` do: the alpha faded
  // the border, the value and the placeholder together, so in dark mode a
  // disabled field was a barely-visible smudge and you could not read the value
  // it was showing you. See `src/theme/tokens.ts`.
  const borderColor = disabled
    ? colors.disabledFg
    : invalid
      ? colors.danger
      : focused
        ? colors.focus
        : colors.borderStrong;
  const target = minTouchTarget(Platform.OS);

  return (
    <View style={[{ gap: 6 }, style]}>
      <Text role="labelSm" tone="default">
        {required ? `${label} (required)` : label}
      </Text>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: INPUT_MIN_HEIGHT,
          borderRadius: tokens.radii.md,
          borderWidth: focused || invalid ? 2 : 1,
          borderColor,
          backgroundColor: disabled ? colors.disabledBg : colors.surface,
          paddingHorizontal: tokens.space.md,
        }}
      >
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={disabled ? colors.disabledFg : colors.textMuted}
          editable={!disabled}
          secureTextEntry={secureTextEntry && !revealed}
          keyboardType={keyboardType}
          autoComplete={autoComplete}
          textContentType={textContentType}
          autoCapitalize={autoCapitalize}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          multiline={multiline}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={label}
          accessibilityHint={error ?? helperText}
          accessibilityState={{ disabled }}
          aria-invalid={invalid}
          style={{
            flex: 1,
            paddingVertical: multiline ? 12 : 8,
            minHeight: multiline ? 96 : undefined,
            textAlignVertical: multiline ? 'top' : 'center',
            color: disabled ? colors.disabledFg : colors.text,
            ...tokens.typeScale.body,
          }}
        />

        {secureTextEntry ? (
          <PressableBase
            testID="input-reveal"
            onPress={() => setRevealed((previous) => !previous)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            accessibilityState={{ selected: revealed, disabled }}
            hitSlop={hitSlopFor(target, Platform.OS) + 4}
            android_ripple={{ color: colors.bgSoft, borderless: true }}
            // Layout NEVER goes in a style callback — see `PressableBase`.
            style={{ width: target, height: target, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name={revealed ? 'eye-off' : 'eye'} size={20} color={colors.textSecondary} />
          </PressableBase>
        ) : null}
      </View>

      {error || helperText ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
          <Icon
            name={invalid ? 'alert-triangle' : 'info'}
            size={16}
            color={invalid ? colors.danger : colors.textMuted}
          />
          <Text role="caption" tone={invalid ? 'danger' : 'muted'} style={{ flex: 1 }}>
            {error ?? helperText}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
