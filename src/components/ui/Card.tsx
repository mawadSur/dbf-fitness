import type { ReactNode } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import { PressableBase } from './PressableBase';

export type CardProps = {
  children: ReactNode;
  /** 16 (compact) or 24 (roomy) — design system §3. */
  padding?: 16 | 24;
  /** `raised` uses the raised surface + the md shadow in light mode. */
  tone?: 'surface' | 'raised' | 'soft';
  /** Makes the whole card one button; needs an accessibility label. */
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Card (design system §5): surface, radius 12, 1px border-soft, shadow-sm.
 * Dark mode separates surfaces with the border only — no heavy shadows (§7).
 */
export function Card({
  children,
  padding = 16,
  tone = 'surface',
  onPress,
  accessibilityLabel,
  style,
  testID,
}: CardProps) {
  const { colors, tokens, scheme } = useOptionalTheme();

  const background =
    tone === 'raised' ? colors.surfaceRaised : tone === 'soft' ? colors.bgSoft : colors.surface;

  const base: ViewStyle = {
    backgroundColor: background,
    borderRadius: tokens.radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding,
    ...(scheme === 'light' ? (tone === 'raised' ? tokens.shadows.md : tokens.shadows.sm) : null),
  };

  if (!onPress) {
    return (
      <View testID={testID} style={[base, style]}>
        {children}
      </View>
    );
  }

  return (
    <PressableBase
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      android_ripple={{ color: colors.bgSoft }}
      // Layout NEVER goes in a style callback — see `PressableBase`.
      style={[base, { minHeight: Platform.OS === 'android' ? 48 : 44 }, style]}
    >
      {children}
    </PressableBase>
  );
}
