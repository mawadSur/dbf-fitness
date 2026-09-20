import { Image, View, type StyleProp, type ViewStyle } from 'react-native';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import { lightTheme } from '../../theme/tokens';

// Metro resolves an image `require` to an asset reference; there is no ESM form.
const LOGO_SOURCE = require('../../../assets/logo.png');

/** Native aspect ratio of `assets/logo.png` (1505 × 1444). */
export const LOGO_ASPECT_RATIO = 1505 / 1444;

/** Design system §8: the badge keeps the black wordmark readable in dark mode. */
export const LOGO_BADGE_RADIUS = 24;
const BADGE_PADDING = 12;

export type LogoProps = {
  /** Rendered height of the artwork itself, in points. */
  height?: number;
  /**
   * `auto` (default) adds the light badge only in dark mode, `always` forces it
   * (for a logo sitting on a photo or a coloured hero), `never` disables it.
   */
  badge?: 'auto' | 'always' | 'never';
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The DBF logo (design system §8).
 *
 * The artwork has black outlines and a black wordmark on transparency, so it
 * disappears on a dark background — it is therefore always placed on a light
 * rounded badge whenever the surface behind it is dark.
 */
export function Logo({
  height = 64,
  badge = 'auto',
  accessibilityLabel = 'DBF Fitness',
  style,
  testID,
}: LogoProps) {
  const { scheme } = useOptionalTheme();
  const onBadge = badge === 'always' || (badge === 'auto' && scheme === 'dark');

  const image = (
    <Image
      testID={testID ?? 'logo-image'}
      source={LOGO_SOURCE}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      resizeMode="contain"
      style={{ height, width: height * LOGO_ASPECT_RATIO }}
    />
  );

  if (!onBadge) {
    return <View style={[{ alignSelf: 'flex-start' }, style]}>{image}</View>;
  }

  return (
    <View
      testID="logo-badge"
      style={[
        {
          alignSelf: 'flex-start',
          padding: BADGE_PADDING,
          borderRadius: LOGO_BADGE_RADIUS,
          // Always the LIGHT theme's tinted surface: that is the point of the badge.
          backgroundColor: lightTheme.bgSoft,
        },
        style,
      ]}
    >
      {image}
    </View>
  );
}
