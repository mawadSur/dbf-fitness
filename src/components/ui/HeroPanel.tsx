import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Pattern, Rect, Stop } from 'react-native-svg';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import { svgAccessibilityProps } from './a11y';

/** Design system §5: the sage dot texture sits at 6%. */
export const HERO_DOT_OPACITY = 0.06;
export const HERO_DOT_SPACING = 24;
export const HERO_DOT_RADIUS = 2;

export type HeroPanelProps = {
  children: ReactNode;
  /** 16 (compact) or 24 (roomy) — design system §3. */
  padding?: 16 | 24;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** The panel box as `onLayout` reports it; `null` until the first layout pass. */
export type HeroPanelSize = { width: number; height: number };

/**
 * The size to draw the backdrop at, or `null` when there is nothing to draw yet.
 *
 * Exported so the sizing rule can be tested without a renderer: a degenerate
 * box (either axis at or below zero, which is what a not-yet-measured or
 * collapsed panel reports) must not produce an `<Svg>` at all, because a
 * zero-sized canvas is exactly the half-painted state this guards against.
 */
export function heroBackdropSize(layout: HeroPanelSize | null): HeroPanelSize | null {
  if (!layout) return null;
  if (!(layout.width > 0) || !(layout.height > 0)) return null;
  return layout;
}

/**
 * The signature surface (design system §5): a vertical `bg` → `bg-soft`
 * gradient with a sage dot texture at 6%, radius 16.
 *
 * Both layers are drawn with `react-native-svg` rather than a gradient
 * dependency, so the same code renders on iOS, Android and web.
 *
 * WHY THE `onLayout` MEASUREMENT — the backdrop used to be an absolutely
 * positioned `<Svg width="100%" height="100%">` with two `<Rect width="100%"
 * height="100%">`. On Android react-native-svg resolved those percentages
 * against something other than the laid-out box, so the gradient and the dots
 * painted only the top-left region of the panel (~82% of its width and ~48% of
 * its height on a real emulator) and the rest of the card stayed bare. iOS and
 * web took a different path and looked right, which is how it shipped. So the
 * panel measures itself and the canvas is given NUMERIC `width`/`height` plus a
 * matching `viewBox`; the two rects are sized in those same user units.
 * `heroBackdropSize` + the HeroPanel tests fail if percentages come back.
 */
export function HeroPanel({ children, padding = 24, style, testID }: HeroPanelProps) {
  const { colors, tokens } = useOptionalTheme();
  const [layout, setLayout] = useState<HeroPanelSize | null>(null);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setLayout((current) =>
      current && current.width === width && current.height === height ? current : { width, height },
    );
  };

  const size = heroBackdropSize(layout);

  return (
    <View
      testID={testID ?? 'hero-panel'}
      onLayout={onLayout}
      style={[
        {
          borderRadius: tokens.radii.xl,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: colors.borderSoft,
          padding,
        },
        style,
      ]}
    >
      {size ? (
        <Svg
          testID="hero-panel-background"
          style={StyleSheet.absoluteFill}
          width={size.width}
          height={size.height}
          viewBox={`0 0 ${size.width} ${size.height}`}
          {...svgAccessibilityProps()}
        >
          <Defs>
            <LinearGradient id="heroFade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.bg} stopOpacity="1" />
              <Stop offset="1" stopColor={colors.bgSoft} stopOpacity="1" />
            </LinearGradient>
            <Pattern
              id="heroDots"
              patternUnits="userSpaceOnUse"
              width={HERO_DOT_SPACING}
              height={HERO_DOT_SPACING}
            >
              <Circle
                cx={HERO_DOT_SPACING / 2}
                cy={HERO_DOT_SPACING / 2}
                r={HERO_DOT_RADIUS}
                fill={colors.sage}
                fillOpacity={HERO_DOT_OPACITY}
              />
            </Pattern>
          </Defs>
          <Rect x="0" y="0" width={size.width} height={size.height} fill="url(#heroFade)" />
          <Rect x="0" y="0" width={size.width} height={size.height} fill="url(#heroDots)" />
        </Svg>
      ) : null}
      {children}
    </View>
  );
}
