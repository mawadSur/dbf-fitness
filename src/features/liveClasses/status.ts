import { isStartingSoon } from './timing';

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

export const STATUS_BADGE_LABEL: Record<LiveClassDisplayState, string> = {
  live: 'Live',
  'starting-soon': 'Starting soon',
  scheduled: 'Scheduled',
  ended: 'Ended',
  cancelled: 'Cancelled',
};
