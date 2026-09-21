import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import { rippleFor, type ThemeColors } from '../../theme/tokens';
import { Icon } from './Icon';
import type { IconName } from './icons';
import { hitSlopFor } from './layout';
import { PressableBase } from './PressableBase';
import { Text } from './Typography';

export type BannerTone = 'success' | 'warning' | 'danger' | 'info';

type ToneSkin = { fg: keyof ThemeColors; bg: keyof ThemeColors; icon: IconName };

/** Colour is never the only signal (§9): every tone owns a distinct icon. */
export const BANNER_TONES: Record<BannerTone, ToneSkin> = {
  success: { fg: 'success', bg: 'successBg', icon: 'check-circle' },
  warning: { fg: 'warning', bg: 'warningBg', icon: 'alert-triangle' },
  danger: { fg: 'danger', bg: 'dangerBg', icon: 'alert-triangle' },
  info: { fg: 'info', bg: 'infoBg', icon: 'info' },
};

export type BannerProps = {
  title: string;
  message?: string;
  tone?: BannerTone;
  /** Overrides the tone's icon; the icon itself is never removed. */
  icon?: IconName;
  /** Renders the dismiss button. Without it the banner cannot be dismissed. */
  onDismiss?: () => void;
  dismissAccessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Inline status message (design system §5). Announced as an alert so a screen
 * reader picks it up when it appears, with the tone carried by an icon as well
 * as the tint.
 */
export function Banner({
  title,
  message,
  tone = 'info',
  icon,
  onDismiss,
  dismissAccessibilityLabel = 'Dismiss',
  style,
  testID,
}: BannerProps) {
  const { colors, tokens } = useOptionalTheme();
  const skin = BANNER_TONES[tone];
  const fg = colors[skin.fg] as string;

  return (
    <View
      testID={testID ?? 'banner'}
      accessible
      accessibilityRole="alert"
      accessibilityLabel={message ? `${title}. ${message}` : title}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: tokens.space.md,
          padding: tokens.space.md,
          borderRadius: tokens.radii.lg,
          borderWidth: 1,
          borderColor: fg,
          backgroundColor: colors[skin.bg] as string,
        },
        style,
      ]}
    >
      <Icon name={icon ?? skin.icon} size={20} color={fg} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text role="labelSm" color={fg}>
          {title}
        </Text>
        {message ? (
          <Text role="bodySm" color={fg}>
            {message}
          </Text>
        ) : null}
      </View>
      {onDismiss ? (
        <PressableBase
          testID="banner-dismiss"
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel={dismissAccessibilityLabel}
          hitSlop={hitSlopFor(24, Platform.OS)}
          android_ripple={{ color: rippleFor(colors.text), borderless: true }}
          // Layout NEVER goes in a style callback — see `PressableBase`.
          style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="x" size={20} color={fg} />
        </PressableBase>
      ) : null}
    </View>
  );
}
