import { useEffect, useState } from 'react';

/**
 * How long a fetch has to run before it is worth showing a placeholder
 * (design system §5).
 *
 * ONE definition. Three byte-identical copies of this hook had grown up in
 * parallel — `src/components/community/useDelayedVisible.ts`,
 * `src/features/workouts/useDelayedVisible.ts` and
 * `src/components/progress/useSkeletonDelay.ts` — each exporting its own
 * `SKELETON_DELAY_MS = 300`, so changing the skeleton grace period meant
 * changing it in three places and any miss silently desynchronised the workout
 * screens from the calendar.
 */
export const SKELETON_DELAY_MS = 300;

/**
 * True once `active` has been true for `delayMs` without interruption.
 *
 * Loading placeholders exist to stop a screen looking broken, not to flash on a
 * cached 40 ms response: a skeleton that appears instantly makes a cache hit
 * read as jank, and one that never appears makes a 3 s load read as frozen.
 * Waiting 300 ms gets both right, and going inactive clears the flag at once —
 * so a pull-to-refresh of already-loaded data never swaps content for
 * placeholders.
 *
 * The elapsed flag is only ever RAISED by the timer and lowered in the effect's
 * CLEANUP, never in the effect body: a synchronous `setState` in the body costs
 * an extra render pass on every flip (and trips
 * `react-hooks/set-state-in-effect`). The cleanup already runs at exactly the
 * moment the wait ends, and it re-arms the next load with its own 300 ms grace.
 */
export function useDelayedVisible(active: boolean, delayMs: number = SKELETON_DELAY_MS): boolean {
  const [elapsed, setElapsed] = useState(false);

  useEffect(() => {
    if (!active) return undefined;
    const timer = setTimeout(() => setElapsed(true), delayMs);
    return () => {
      clearTimeout(timer);
      setElapsed(false);
    };
  }, [active, delayMs]);

  return active && elapsed;
}
