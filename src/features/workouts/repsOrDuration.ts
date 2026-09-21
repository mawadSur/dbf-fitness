import type { IconName } from '../../components/ui/icons';

/**
 * A time on the clock ("1:30", "10:00") — minutes and seconds, never a score.
 */
const CLOCK_TIME = /\d+:[0-5]\d(?!\d)/;

/**
 * A number followed by a TIME unit. The unit may be attached ("30s") or spaced
 * ("45 sec", "2 minutes"), and the word boundary is what keeps "12 sets" from
 * reading as 12 seconds.
 *
 * `m` on its own is deliberately NOT a unit here: "400m" is a distance, and
 * calling it four hundred minutes would be worse than showing no clock.
 */
const TIMED = /\d+(?:\.\d+)?\s*(?:s|secs?|seconds?|mins?|minutes?|h|hrs?|hours?)\b/i;

/** True when `value` prescribes a DURATION rather than a number of repetitions. */
export function isDuration(value: string): boolean {
  return CLOCK_TIME.test(value) || TIMED.test(value);
}

/**
 * The icon that belongs on an exercise's "12 reps" / "30s" chip.
 *
 * One chip renders both kinds of prescription, and it used to badge both with
 * a CLOCK — so half the data was labelled with a symbol that contradicted it:
 * "12 reps" behind a clock says twelve of something temporal, and reps are not
 * a duration. The icon is therefore read off the value: the clock stays for
 * anything measured in time, and everything else gets the barbell that already
 * stands for a workout everywhere else in the app.
 */
export function repsOrDurationIcon(value: string): IconName {
  return isDuration(value) ? 'clock' : 'workout';
}
