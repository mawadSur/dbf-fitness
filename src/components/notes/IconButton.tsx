import { Platform } from 'react-native';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import { hitSlopFor, Icon, minTouchTarget, PressableBase, type IconName } from '../ui';

export type IconButtonProps = {
  /** The accessible name — mandatory, because there is no visible text. */
  label: string;
  icon: IconName;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
  testID?: string;
};

/**
 * A square, icon-only control sized to the platform's minimum touch target.
 *
 * The checklist editor's reorder buttons: an arrow is the whole point (a word would double the row's
 * width), so the icon carries the meaning on screen and `label` carries it to a screen reader.
 *
 * It is drawn as a filled, outlined square rather than a bare glyph. A floating chevron on a card
 * does not look pressable, and the reorder controls are the one part of the editor a coach has to
 * find unaided, so the button needs an edge of its own.
 *
 * Listed under `uiRequests`: `Button` has no icon-only form yet.
 */
export function IconButton({ label, icon, onPress, disabled = false, tone = 'default', testID }: IconButtonProps) {
  const { colors, tokens } = useOptionalTheme();
  const target = minTouchTarget(Platform.OS);

  return (
    <PressableBase
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={hitSlopFor(target, Platform.OS)}
      android_ripple={{ color: colors.bgSoft }}
      pressFeedback={disabled ? 'none' : 0.6}
      // Layout NEVER goes in a style callback — see `PressableBase`.
      style={{
        width: target,
        height: target,
        borderRadius: tokens.radii.md,
        backgroundColor: colors.bgSoft,
        borderWidth: 1,
        borderColor: colors.borderSoft,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.35 : 1,
      }}
    >
      <Icon name={icon} size={20} color={tone === 'danger' ? colors.danger : colors.textSecondary} />
    </PressableBase>
  );
}
