import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import { Icon } from './Icon';
import type { IconName } from './icons';
import { hitSlopFor } from './layout';
import { PressableBase } from './PressableBase';
import { Text } from './Typography';

const CHIP_HEIGHT = 32;

export type ChipProps = {
  label: string;
  /** Selected chips get the brand tint AND a check icon — never colour alone. */
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Pill filter/tag. Pressable chips report `accessibilityRole="button"` with a
 * `selected` state; static chips are plain text (use `Badge` for status).
 */
export function Chip({ label, selected = false, onPress, disabled = false, icon, style, testID }: ChipProps) {
  const { colors, tokens } = useOptionalTheme();

  const fg = selected ? colors.onCta : colors.text;
  const base: ViewStyle = {
    minHeight: CHIP_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: tokens.radii.pill,
    borderWidth: 1,
    borderColor: selected ? colors.cta : colors.borderStrong,
    backgroundColor: selected ? colors.cta : 'transparent',
    opacity: disabled ? 0.45 : 1,
  };

  const content = (
    <>
      {icon ? <Icon name={icon} size={16} color={fg} /> : null}
      {selected && !icon ? <Icon name="check" size={16} color={fg} /> : null}
      <Text role="bodySmMedium" color={fg} numberOfLines={1}>
        {label}
      </Text>
    </>
  );

  if (!onPress) {
    return (
      <View testID={testID} accessible accessibilityRole="text" accessibilityLabel={label} style={[base, style]}>
        {content}
      </View>
    );
  }

  return (
    <PressableBase
      testID={testID}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      hitSlop={hitSlopFor(CHIP_HEIGHT, Platform.OS)}
      android_ripple={disabled ? undefined : { color: colors.bgSoft }}
      // Layout NEVER goes in a style callback — see `PressableBase`.
      pressFeedback={disabled ? 'none' : 'ds'}
      style={[base, style]}
    >
      {content}
    </PressableBase>
  );
}
