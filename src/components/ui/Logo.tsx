import { Image, View, type StyleProp, type ViewStyle } from 'react-native';

import { lightTheme } from '../../theme/tokens';

// Metro resolves an image `require` to an asset reference; there is no ESM form.
const LOGO_SOURCE = require('../../../assets/logo.png');

/** Native aspect ratio of `assets/logo.png` (1505 × 1444). */
export const LOGO_ASPECT_RATIO = 1505 / 1444;

/** Design system §8: the badge keeps the black wordmark readable in dark mode. */
export const LOGO_BADGE_RADIUS = 24;
export const LOGO_BADGE_PADDING = 12;

export type LogoProps = {
  /** Rendered height of the artwork itself, in points. */
  height?: number;
  /**
   * `auto` (default) and `always` both put the mark on the light badge;
   * `never` disables it for a caller that has already guaranteed a light
   * surface and wants the artwork flush.
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
 * disappears on a dark background — hence the light rounded badge.
 *
 * WHY THE BADGE IS NOT THEME-DEPENDENT — `auto` used to mean "badge in dark
 * mode only", which made the brand mark two different objects: on sign-in it
 * was a flush 40pt mark in light and a 64pt round badge in dark, so the first
 * screen of the app changed shape, size and silhouette with the system theme.
 * A brand mark that is not the same mark in both themes is not a brand mark,
 * and the badge is the treatment the design system draws, so `auto` now means
 * the badge always — one size and one silhouette everywhere.
 */
export function Logo({
  height = 64,
  badge = 'auto',
  accessibilityLabel = 'DBF Fitness',
  style,
  testID,
}: LogoProps) {
  const onBadge = badge !== 'never';

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
          padding: LOGO_BADGE_PADDING,
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
