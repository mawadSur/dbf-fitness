import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Skeleton } from './Skeleton';
import { SKELETON_DELAY_MS } from './useDelayedVisible';

/**
 * How long a fetch may take before the placeholder is painted.
 *
 * The bars are MOUNTED immediately (so the box reserves its space and nothing jumps when the data
 * lands, and so a screen reader hears the busy state at once) but stay invisible until the fetch
 * has been slow enough to be worth explaining. A fast cache hit therefore shows nothing at all
 * instead of a 40 ms flash of grey.
 *
 * It is the SAME grace period `useDelayedVisible` waits — an alias, not a second copy of 300, so
 * the two ways this app defers a placeholder can never drift apart.
 */
export const SKELETON_REVEAL_MS = SKELETON_DELAY_MS;

export function useDelayedReveal(delayMs: number = SKELETON_REVEAL_MS): boolean {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setRevealed(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);
  return revealed;
}

export type LoadingSkeletonProps = {
  /** How many body bars to reserve. */
  lines?: number;
  /** Reserve a taller first bar for a heading. */
  heading?: boolean;
  /** Announced while the screen is busy. */
  label?: string;
  testID?: string;
};

/**
 * The one loading placeholder for this stream's screens (design system §5): never a bare
 * full-screen spinner, always the shape of the content that is coming.
 */
export function LoadingSkeleton({
  lines = 3,
  heading = true,
  label = 'Loading',
  testID = 'loading-skeleton',
}: LoadingSkeletonProps) {
  const revealed = useDelayedReveal();

  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      style={{ gap: 12, paddingVertical: 8, opacity: revealed ? 1 : 0 }}
    >
      {heading ? <Skeleton height={28} width="60%" /> : null}
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} height={16} width={index === lines - 1 ? '70%' : '100%'} />
      ))}
    </View>
  );
}

/** Card-shaped placeholders for a list that is still loading. */
export function ListSkeleton({ rows = 3, label = 'Loading' }: { rows?: number; label?: string }) {
  const revealed = useDelayedReveal();

  return (
    <View
      testID="list-skeleton"
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      style={{ gap: 12, opacity: revealed ? 1 : 0 }}
    >
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} height={88} radius={12} />
      ))}
    </View>
  );
}
