import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import { rippleFor } from '../../theme/tokens';
import { Icon } from './Icon';
import type { IconName } from './icons';
import { hitSlopFor } from './layout';
import { PressableBase } from './PressableBase';
import { Text } from './Typography';

const CHIP_HEIGHT = 32;

/**
 * What kind of choice this chip is part of, which is the only thing that
 * decides its ARIA role on web.
 * - `'checkbox'` (default) — an independent toggle: a filter that can be on
 *   with others on.
 * - `'radio'` — one of a mutually exclusive set, e.g. the Appearance choice
 *   (System / Light / Dark). The chips of such a set should sit inside a
 *   container with `accessibilityRole="radiogroup"`.
 */
export type ChipSelectionRole = 'checkbox' | 'radio';

export type ChipProps = {
  label: string;
  /** Selected chips get the brand tint AND a check icon — never colour alone. */
  selected?: boolean;
  /** Single-select groups (Appearance) pass 'radio'; independent filters keep the default. */
  selectionRole?: ChipSelectionRole;
  onPress?: () => void;
  disabled?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The accessibility props for a PRESSABLE chip, split by platform.
 *
 * WHY THIS IS SPLIT — on iOS and Android `accessibilityRole="button"` plus
 * `accessibilityState.selected` is exactly right: VoiceOver says "Dark,
 * selected, button" and TalkBack says "Dark, selected". On WEB it is not.
 * react-native-web renders `accessibilityRole="button"` as `role="button"`,
 * and `aria-selected` is not allowed on `role="button"` — browsers and
 * screen readers DROP it, so every Appearance chip announced simply as
 * "System / Light / Dark, button" with no hint that one of them was the
 * current choice. The member could hear the options but never the answer.
 *
 * So web gets the role that can actually carry the state: `radio` for a
 * mutually exclusive set, `checkbox` for an independent toggle, both with
 * `aria-checked`. Native keeps the button role it already had, so nothing
 * changes there — hence two branches rather than one shared role.
 *
 * Exported so `Chip.test.tsx` can assert both platforms without rendering
 * twice under a mocked `Platform.OS`.
 */
export function chipAccessibilityProps(
  os: string,
  { label, selected, disabled, selectionRole }: Required<Pick<ChipProps, 'label' | 'selected' | 'disabled'>> & {
    selectionRole: ChipSelectionRole;
  },
): Record<string, unknown> {
  if (os === 'web') {
    return {
      role: selectionRole,
      'aria-checked': selected,
      'aria-disabled': disabled,
      'aria-label': label,
      // Kept as well: RNTL and any native-flavoured assertion still see it,
      // and react-native-web ignores what it cannot map.
      accessibilityState: { selected, disabled, checked: selected },
    };
  }
  return {
    accessibilityRole: 'button' as const,
    accessibilityLabel: label,
    accessibilityState: { selected, disabled, checked: selected },
  };
}

/**
 * Pill filter/tag. Pressable chips report a selected/checked state on every
 * platform (see `chipAccessibilityProps`); static chips are plain text (use
 * `Badge` for status).
 */
export function Chip({
  label,
  selected = false,
  selectionRole = 'checkbox',
  onPress,
  disabled = false,
  icon,
  style,
  testID,
}: ChipProps) {
  const { colors, tokens } = useOptionalTheme();

  // A DISABLED chip takes the disabled pair rather than a blanket alpha, for
  // the same reason `Button` does: fading the whole pill faded the fill and the
  // label together, so a disabled SELECTED chip stayed a recognisable (just
  // paler) brand pill. See `src/theme/tokens.ts`.
  const fg = disabled ? colors.disabledFg : selected ? colors.onCta : colors.text;
  const background = disabled ? colors.disabledBg : selected ? colors.cta : 'transparent';
  const borderColor = disabled ? colors.disabledFg : selected ? colors.cta : colors.borderStrong;

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
    borderColor,
    backgroundColor: background,
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
      {...chipAccessibilityProps(Platform.OS, { label, selected, disabled, selectionRole })}
      hitSlop={hitSlopFor(CHIP_HEIGHT, Platform.OS)}
      android_ripple={disabled ? undefined : { color: rippleFor(colors.text) }}
      // Layout NEVER goes in a style callback — see `PressableBase`.
      pressFeedback={disabled ? 'none' : 'ds'}
      style={[base, style]}
    >
      {content}
    </PressableBase>
  );
}
