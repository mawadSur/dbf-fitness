import { useState, type RefObject } from 'react';
import {
  Platform,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type ReturnKeyTypeOptions,
  type TextInputProps,
} from 'react-native';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import { Icon, INPUT_MIN_HEIGHT, PressableBase, Text, hitSlopFor, minTouchTarget } from '../ui';

export type AuthFieldProps = {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  /** Validation message; its presence puts the field in the error state. */
  error?: string | null;
  helperText?: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoComplete?: TextInputProps['autoComplete'];
  textContentType?: TextInputProps['textContentType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoCorrect?: boolean;
  returnKeyType?: ReturnKeyTypeOptions;
  maxLength?: number;
  /** False keeps the keyboard up while focus moves to the next field. */
  blurOnSubmit?: boolean;
  onSubmitEditing?: () => void;
  onBlur?: () => void;
  /** So the previous field can move focus here on "next". */
  inputRef?: RefObject<TextInput | null>;
  testID?: string;
};

/**
 * The auth screens' text field.
 *
 * It is `src/components/ui/Input` — same tokens, same 48pt box, same label and
 * error row, same reveal toggle — plus the two things the auth forms need and
 * the shared `Input` does not expose yet: a ref for field-to-field focus on
 * "next", and an `onBlur` hook so a field can validate when it is left. Both are
 * listed in the report's `uiRequests` for promotion into `Input`; nothing here
 * invents new colour, spacing or type.
 */
export function AuthField({
  label,
  value,
  onChangeText,
  error,
  helperText,
  secureTextEntry = false,
  keyboardType,
  autoComplete,
  textContentType,
  autoCapitalize,
  autoCorrect,
  returnKeyType,
  maxLength,
  blurOnSubmit,
  onSubmitEditing,
  onBlur,
  inputRef,
  testID,
}: AuthFieldProps) {
  const { colors, tokens } = useOptionalTheme();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const invalid = !!error;
  const borderColor = invalid ? colors.danger : focused ? colors.focus : colors.borderStrong;
  const target = minTouchTarget(Platform.OS);

  // On web the underlying <input> also draws the browser's own blue focus ring,
  // which lands INSIDE our 2px `colors.focus` border and reads as a rendering
  // bug. We already paint a visible, token-coloured focus indicator on the box,
  // so the UA one is suppressed rather than lost (WCAG 2.4.7 still satisfied).
  // `outlineStyle` is a react-native-web style key, absent from RN's ViewStyle.
  const webFocusRingReset =
    Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextInputProps['style']) : null;

  return (
    <View style={{ gap: 6 }}>
      <Text role="labelSm" tone="default">
        {label}
      </Text>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: INPUT_MIN_HEIGHT,
          borderRadius: tokens.radii.md,
          borderWidth: focused || invalid ? 2 : 1,
          borderColor,
          backgroundColor: colors.surface,
          paddingHorizontal: tokens.space.md,
        }}
      >
        <TextInput
          ref={inputRef}
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={secureTextEntry && !revealed}
          keyboardType={keyboardType}
          autoComplete={autoComplete}
          textContentType={textContentType}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          returnKeyType={returnKeyType}
          maxLength={maxLength}
          blurOnSubmit={blurOnSubmit}
          onSubmitEditing={onSubmitEditing}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          accessibilityLabel={label}
          accessibilityHint={error ?? helperText}
          aria-invalid={invalid}
          style={[
            {
              flex: 1,
              paddingVertical: 8,
              color: colors.text,
              ...tokens.typeScale.body,
            },
            webFocusRingReset,
          ]}
        />

        {secureTextEntry ? (
          <PressableBase
            testID={testID ? `${testID}-reveal` : 'auth-field-reveal'}
            onPress={() => setRevealed((previous) => !previous)}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            accessibilityState={{ selected: revealed }}
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
        <View
          accessibilityLiveRegion={invalid ? 'polite' : 'none'}
          style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}
        >
          <Icon
            name={invalid ? 'alert-triangle' : 'info'}
            size={16}
            color={invalid ? colors.danger : colors.textMuted}
          />
          <Text
            role="caption"
            tone={invalid ? 'danger' : 'muted'}
            style={{ flex: 1 }}
            testID={testID ? `${testID}-message` : undefined}
          >
            {error ?? helperText}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
