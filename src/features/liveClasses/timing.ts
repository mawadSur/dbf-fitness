export const STARTING_SOON_WINDOW_MINUTES = 15;

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

type TimeInput = Date | string | number;

function toMs(value: TimeInput): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/**
 * True when the class has not begun yet and starts within `windowMinutes` of `now` (inclusive at
 * both ends: exactly now and exactly `windowMinutes` away both count). A class that has already
 * started is not "starting soon" — the caller shows it as live/in progress instead.
 */
export function isStartingSoon(
  startsAt: TimeInput,
  now: TimeInput,
  windowMinutes = STARTING_SOON_WINDOW_MINUTES
): boolean {
  const diffMs = toMs(startsAt) - toMs(now);
  return diffMs >= 0 && diffMs <= windowMinutes * MS_PER_MINUTE;
}

function formatMinutes(totalMinutes: number): string {
  if (totalMinutes < MINUTES_PER_HOUR) return `${totalMinutes} min`;
  if (totalMinutes < MINUTES_PER_DAY) {
    const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
    const minutes = totalMinutes % MINUTES_PER_HOUR;
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
  }
  const days = Math.floor(totalMinutes / MINUTES_PER_DAY);
  const hours = Math.floor((totalMinutes % MINUTES_PER_DAY) / MINUTES_PER_HOUR);
  return hours === 0 ? `${days}d` : `${days}d ${hours}h`;
}

/**
 * Human countdown to `startsAt`: "Starts in 2d 3h", "Starts in 14 min", "Starting now" (within a
 * minute either side), or "Started 5 min ago". Whole units are floored, so it never rounds up
 * past the real remaining time.
 */
export function formatCountdown(startsAt: TimeInput, now: TimeInput): string {
  const startMs = toMs(startsAt);
  const nowMs = toMs(now);
  if (Number.isNaN(startMs) || Number.isNaN(nowMs)) return '';

  const diffMs = startMs - nowMs;
  if (Math.abs(diffMs) < MS_PER_MINUTE) return 'Starting now';

  const minutes = Math.floor(Math.abs(diffMs) / MS_PER_MINUTE);
  return diffMs > 0 ? `Starts in ${formatMinutes(minutes)}` : `Started ${formatMinutes(minutes)} ago`;
}

/** Local, locale-aware start time, e.g. "Sat, Sep 21, 6:00 PM". */
export function formatStartTime(startsAt: TimeInput): string {
  const date = new Date(toMs(startsAt));
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
