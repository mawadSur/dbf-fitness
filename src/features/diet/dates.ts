/**
 * Which calendar day a diet check-in belongs to.
 *
 * The database defines a "day" in UTC: `member_workout_stats` groups completions by
 * `(completed_at at time zone 'utc')::date`, `diet_checkins.checkin_date` defaults to
 * `current_date` (UTC on Supabase), and the check-in RLS policy accepts dates within
 * `current_date - 7 .. current_date + 1`. The client therefore uses the UTC date by default so
 * a check-in lands on the same day the server (and the streak view) would assign it.
 *
 * Tradeoff: for members far from UTC the "day" rolls over at UTC midnight rather than local
 * midnight (e.g. 5pm in Los Angeles). Changing that needs a SQL change (a per-member timezone).
 * Pass `'local'` only if the schema is changed to match.
 */
export type DayBasis = 'utc' | 'local';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function todayDateString(now: Date = new Date(), basis: DayBasis = 'utc'): string {
  if (basis === 'local') {
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
}
