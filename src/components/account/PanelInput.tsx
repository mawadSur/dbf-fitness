import { useState, type RefObject } from 'react';
import {
  TextInput,
  View,
  type ReturnKeyTypeOptions,
  type TextInputProps,
} from 'react-native';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import { Icon, INPUT_MIN_HEIGHT, Text } from '../ui';

export type PanelInputProps = {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  helperText?: string;
  error?: string;
  secureTextEntry?: boolean;
  autoComplete?: TextInputProps['autoComplete'];
  textContentType?: TextInputProps['textContentType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  returnKeyType?: ReturnKeyTypeOptions;
  onSubmitEditing?: () => void;
  /** The screen that owns the ScrollView uses this to bring the field above the keyboard. */
  onFocus?: () => void;
  inputRef?: RefObject<TextInput | null>;
  disabled?: boolean;
  testID?: string;
};

/**
 * `src/components/ui/Input` with two things it does not expose yet: `onFocus` and a ref.
 *
 * The danger-zone form needs both — the Profile screen owns the ScrollView and scrolls the focused
 * field above the keyboard, and "next" on the password field has to move the caret to the typed
 * confirmation. Everything visual (geometry, radius, focus ring, error row) is read from the same
 * tokens as `Input`, so the two fields are indistinguishable on screen.
 *
 * Listed under `uiRequests`: the right long-term fix is `Input` taking `onFocus`/`inputRef`, and
 * then this file goes away.
 */
export function PanelInput({
  label,
  value,
  onChangeText,
  placeholder,
  helperText,
  error,
  secureTextEntry = false,
  autoComplete,
  textContentType,
  autoCapitalize,
  returnKeyType,
  onSubmitEditing,
  onFocus,
  inputRef,
  disabled = false,
  testID,
}: PanelInputProps) {
  const { colors, tokens } = useOptionalTheme();
  const [focused, setFocused] = useState(false);
  const invalid = !!error;
  const borderColor = invalid ? colors.danger : focused ? colors.focus : colors.borderStrong;

  return (
    <View style={{ gap: 6 }}>
      <Text role="labelSm">{label}</Text>

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
          opacity: disabled ? 0.45 : 1,
        }}
      >
        <TextInput
          ref={inputRef}
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          editable={!disabled}
          secureTextEntry={secureTextEntry}
          autoComplete={autoComplete}
          textContentType={textContentType}
          autoCapitalize={autoCapitalize}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          onFocus={() => {
            setFocused(true);
            onFocus?.();
          }}
          onBlur={() => setFocused(false)}
          accessibilityLabel={label}
          accessibilityHint={error ?? helperText}
          accessibilityState={{ disabled }}
          aria-invalid={invalid}
          style={{
            flex: 1,
            paddingVertical: 8,
            color: colors.text,
            ...tokens.typeScale.body,
          }}
        />
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
