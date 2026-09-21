import { formatCountdown, isStartingSoon } from './timing';

export type LiveClassStatus = 'scheduled' | 'live' | 'ended' | 'cancelled';

export type LiveClassDisplayState = 'live' | 'starting-soon' | 'scheduled' | 'ended' | 'cancelled';

/**
 * What the UI should show for a class. Status from the database wins for live/ended/cancelled; a
 * scheduled class becomes "starting-soon" once it is inside the reminder window.
 */
export function displayStateOf(
  status: LiveClassStatus,
  startsAt: Date | string | number,
  now: Date | string | number
): LiveClassDisplayState {
  if (status !== 'scheduled') return status;
  return isStartingSoon(startsAt, now) ? 'starting-soon' : 'scheduled';
}

/**
 * Join is deliberately NOT gated to the last 15 minutes: a member may open the class room ahead
 * of time (and the demo class is days out). Only finished or cancelled classes are closed.
 */
export function canJoin(status: LiveClassStatus): boolean {
  return status === 'scheduled' || status === 'live';
}

/** Why joining is closed, or null when the class can be joined. */
export function joinBlockedMessage(status: LiveClassStatus): string | null {
  if (status === 'ended') return 'This class has ended, so it can no longer be joined.';
  if (status === 'cancelled') return 'This class was cancelled, so it cannot be joined.';
  return null;
}

/**
 * The one timing line a class card shows — STATUS FIRST, clock second.
 *
 * `formatCountdown` only knows two timestamps, so a class that the coach
 * started early still read "Starts in 12 min", and a cancelled class kept
 * counting down to a lesson nobody would run. Both contradicted the badge
 * right above them. Status is a fact the server asserted; the countdown is an
 * inference from `starts_at`, so the fact wins and the inference is only
 * reached for a class that is still merely scheduled.
 *
 * "Live now" rather than "Started 5 min ago": once a class is running, how
 * long ago it began is not what a member is deciding on.
 */
export function formatClassTiming(
  status: LiveClassStatus,
  startsAt: Date | string | number,
  now: Date | string | number
): string {
  if (status === 'live') return 'Live now';
  if (status === 'cancelled') return 'Cancelled';
  if (status === 'ended') return 'Ended';
  return formatCountdown(startsAt, now);
}

export const STATUS_BADGE_LABEL: Record<LiveClassDisplayState, string> = {
  live: 'Live',
  'starting-soon': 'Starting soon',
  scheduled: 'Scheduled',
  ended: 'Ended',
  cancelled: 'Cancelled',
};
