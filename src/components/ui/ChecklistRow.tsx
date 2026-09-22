import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import { rippleFor } from '../../theme/tokens';
import { Icon } from './Icon';
import { PressableBase } from './PressableBase';
import { Text } from './Typography';

/** ≥ 44pt on iOS and ≥ 48dp on Android in one number (design system §9). */
export const CHECK_TARGET_SIZE = 48;
const BOX_SIZE = 24;

export type ChecklistRowProps = {
  label: string;
  sublabel?: string;
  checked: boolean;
  onToggle: () => void;
  /** Optional details affordance; omit it and no button is exposed. */
  onPress?: () => void;
  disabled?: boolean;
  /**
   * Locks the CHECKBOX only, leaving the details affordance live and the row
   * at full contrast.
   *
   * For a row whose checked state is a finished record rather than something
   * still being decided — a workout already logged for today. `disabled` would
   * be wrong there twice over: it also shuts the exercise itself, and it fades
   * the row to 45%, which says "unavailable" about work the member has done.
   */
  toggleDisabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Checklist row (design system §5). The API is identical to the pre-design-system
 * `src/components/ChecklistRow.tsx`, which now delegates here.
 *
 * The checked state is carried by the box fill, a check icon AND the
 * `accessibilityState` — colour is never the only signal (§9).
 */
export function ChecklistRow({
  label,
  sublabel,
  checked,
  onToggle,
  onPress,
  disabled = false,
  toggleDisabled = false,
  style,
  testID,
}: ChecklistRowProps) {
  const { colors, tokens } = useOptionalTheme();
  const noToggle = disabled || toggleDisabled;

  return (
    <View
      testID={testID}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: tokens.space.xs,
          paddingRight: tokens.space.lg,
          borderRadius: tokens.radii.lg,
          borderWidth: 1,
          borderColor: colors.borderSoft,
          backgroundColor: colors.surface,
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}
    >
      <PressableBase
        onPress={noToggle ? undefined : onToggle}
        disabled={noToggle}
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        accessibilityState={{ checked, disabled: noToggle }}
        android_ripple={noToggle ? undefined : { color: rippleFor(colors.text), borderless: true }}
        // Layout NEVER goes in a style callback — see `PressableBase`.
        pressFeedback={noToggle ? 'none' : 'ds'}
        style={{
          width: CHECK_TARGET_SIZE,
          height: CHECK_TARGET_SIZE,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          testID="checklist-box"
          style={{
            width: BOX_SIZE,
            height: BOX_SIZE,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: tokens.radii.sm,
            borderWidth: 2,
            borderColor: checked ? colors.cta : colors.borderStrong,
            backgroundColor: checked ? colors.cta : 'transparent',
          }}
        >
          {checked ? <Icon name="check" size={16} color={colors.onCta} /> : null}
        </View>
      </PressableBase>

      <PressableBase
        onPress={disabled ? undefined : onPress}
        disabled={!onPress || disabled}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={onPress ? `${label}, details` : undefined}
        accessibilityState={onPress ? { disabled } : undefined}
        android_ripple={onPress && !disabled ? { color: rippleFor(colors.text) } : undefined}
        // Layout NEVER goes in a style callback — see `PressableBase`.
        pressFeedback={onPress && !disabled ? 'ds' : 'none'}
        style={{ minHeight: CHECK_TARGET_SIZE, flex: 1, justifyContent: 'center', paddingVertical: 8 }}
      >
        <Text
          role="label"
          tone={checked ? 'muted' : 'default'}
          numberOfLines={2}
          style={checked ? { textDecorationLine: 'line-through' } : undefined}
        >
          {label}
        </Text>
        {sublabel ? (
          <Text role="caption" tone="muted" numberOfLines={2}>
            {sublabel}
          </Text>
        ) : null}
      </PressableBase>
    </View>
  );
}
