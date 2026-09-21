import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import { rippleFor } from '../../theme/tokens';
import { Icon } from './Icon';
import type { IconName } from './icons';
import { PressableBase } from './PressableBase';
import { Text } from './Typography';

export const LIST_ROW_MIN_HEIGHT = 56;

export type ListRowProps = {
  title: string;
  subtitle?: string;
  /** Leading icon; use `leading` for an avatar or anything richer. */
  icon?: IconName;
  leading?: ReactNode;
  /** Trailing content (a Badge, a value). The chevron is added by `onPress`. */
  trailing?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  /** Hide the chevron on a pressable row that is not navigation. */
  showChevron?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Design system §5: min-h 56, chevron, ripple. */
export function ListRow({
  title,
  subtitle,
  icon,
  leading,
  trailing,
  onPress,
  disabled = false,
  showChevron = true,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: ListRowProps) {
  const { colors, tokens } = useOptionalTheme();

  const base: ViewStyle = {
    minHeight: LIST_ROW_MIN_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.md,
    paddingHorizontal: tokens.space.lg,
    paddingVertical: tokens.space.md,
    backgroundColor: colors.surface,
    opacity: disabled ? 0.45 : 1,
  };

  const body = (
    <>
      {leading ?? (icon ? <Icon name={icon} size={20} color={colors.brand} /> : null)}
      <View style={{ flex: 1, gap: 2 }}>
        <Text role="label" numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text role="bodySm" tone="muted" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
      {onPress && showChevron ? <Icon name="chevron-right" size={20} color={colors.textMuted} /> : null}
    </>
  );

  if (!onPress) {
    return (
      <View testID={testID} style={[base, style]}>
        {body}
      </View>
    );
  }

  return (
    <PressableBase
      testID={testID}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      android_ripple={disabled ? undefined : { color: rippleFor(colors.text) }}
      // Layout NEVER goes in a style callback — see `PressableBase`.
      pressFeedback={disabled ? 'none' : 'ds'}
      style={[base, style]}
    >
      {body}
    </PressableBase>
  );
}
