import { useEffect, useState } from 'react';
import { Animated, Easing, View, type StyleProp, type ViewStyle } from 'react-native';
import { Circle, Svg } from 'react-native-svg';

import { useOptionalTheme, useReducedMotion } from '../../theme/ThemeProvider';
import { motion, type ThemeColors } from '../../theme/tokens';
import { svgAccessibilityProps } from './a11y';
import { clampProgress, duration, progressFraction } from './layout';
import { Text } from './Typography';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type ProgressRingProps = {
  value: number;
  max: number;
  /** Used for the accessible summary and the caption under the ring. */
  label: string;
  size?: number;
  strokeWidth?: number;
  /** Replaces the default `/ max` under the big number. */
  valueCaption?: string;
  /** Hide the label under the ring (it stays in the accessible name). */
  showLabel?: boolean;
  animate?: boolean;
  /**
   * Overrides the active theme for this ring only.
   *
   * The ring draws its own number and caption but NOT its own background, so it
   * inherits whatever the screen behind it paints. A screen that has not been
   * migrated to the theme yet still paints a hard-coded white page, and in dark
   * mode that put near-white text on white (1.05:1 — the number was invisible).
   * Such a screen passes the light palette here until it is migrated.
   */
  palette?: ThemeColors;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Progress ring (design system §5): brand arc on a sage track with a big Manrope
 * number in the middle. Fills once over 600ms, instantly under reduced motion.
 */
export function ProgressRing({
  value,
  max,
  label,
  size = 120,
  strokeWidth = 10,
  valueCaption,
  showLabel = true,
  animate = true,
  palette,
  style,
  testID,
}: ProgressRingProps) {
  const { colors: themeColors } = useOptionalTheme();
  const colors = palette ?? themeColors;
  const reducedMotion = useReducedMotion();

  const clamped = clampProgress(value, max);
  const fraction = progressFraction(value, max);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // A lazy `useState` initialiser rather than a ref: the value is read during
  // render (`interpolate`), which is exactly what `react-hooks/refs` forbids on
  // a ref, and it must survive re-renders, which a plain `new` would not.
  const [progress] = useState(() => new Animated.Value(animate ? 0 : fraction));

  useEffect(() => {
    const ms = animate ? duration(motion.progressRing, reducedMotion) : 0;
    if (ms === 0) {
      progress.setValue(fraction);
      return;
    }
    // useNativeDriver:false — strokeDashoffset is an SVG prop, not a transform.
    // Animated writes it straight to the node, so no React state update happens.
    const animation = Animated.timing(progress, {
      toValue: fraction,
      duration: ms,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [animate, fraction, progress, reducedMotion]);

  const strokeDashoffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${label} ${clamped} of ${max}`}
      accessibilityValue={{ min: 0, max, now: clamped }}
      style={[{ alignItems: 'center', gap: 8 }, style]}
    >
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size} {...svgAccessibilityProps()}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colors.progressTrack}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colors.progressArc}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={strokeDashoffset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Colours are passed explicitly, not via `tone`, so a `palette`
              override reaches the text as well as the arc. */}
          <Text role="h1" tabularNums color={colors.text}>
            {clamped}
          </Text>
          <Text role="caption" tabularNums color={colors.textMuted}>
            {valueCaption ?? `/ ${max}`}
          </Text>
        </View>
      </View>
      {showLabel ? (
        <Text role="bodySmMedium" color={colors.textSecondary}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}
