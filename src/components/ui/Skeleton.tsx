import { useEffect, useState } from 'react';
import { Animated, Easing, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';

import { useOptionalTheme, useReducedMotion } from '../../theme/ThemeProvider';
import { motion } from '../../theme/tokens';

/** Opacity the shimmer travels between; the low end is still visible. */
export const SKELETON_MIN_OPACITY = 0.45;
export const SKELETON_MAX_OPACITY = 1;
const SHIMMER_DURATION = motion.slow * 2;

export type SkeletonProps = {
  width?: DimensionValue;
  height?: number;
  /** Defaults to `radii.sm`; pass `radii.pill` for an avatar. */
  radius?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Loading placeholder (design system §5). Hidden from screen readers — the
 * screen announces its own busy state — and completely still when the member
 * asked the OS to reduce motion (§9).
 */
export function Skeleton({ width = '100%', height = 16, radius, style, testID }: SkeletonProps) {
  const { colors, tokens } = useOptionalTheme();
  const reducedMotion = useReducedMotion();
  // Lazy `useState`, not a ref: the value is read during render (it is handed
  // to a style), which `react-hooks/refs` forbids for refs.
  const [shimmer] = useState(() => new Animated.Value(SKELETON_MAX_OPACITY));

  useEffect(() => {
    if (reducedMotion) {
      shimmer.setValue(SKELETON_MIN_OPACITY);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: SKELETON_MIN_OPACITY,
          duration: SHIMMER_DURATION,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: SKELETON_MAX_OPACITY,
          duration: SHIMMER_DURATION,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reducedMotion, shimmer]);

  return (
    <View
      testID={testID ?? 'skeleton'}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={style}
    >
      <Animated.View
        style={{
          width,
          height,
          borderRadius: radius ?? tokens.radii.sm,
          backgroundColor: colors.bgSoft,
          opacity: shimmer,
        }}
      />
    </View>
  );
}
