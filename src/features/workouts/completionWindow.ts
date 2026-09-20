// The DB's uniqueness key for a workout completion is
//   (member_id, workout_day_id, (completed_at at time zone 'utc')::date)
// (migration 20260919152200). To disable "Finish Workout" for a day that has already
// been logged today, the client has to ask about the same window the server uses: the
// UTC calendar date, NOT the device's local date.

export type UtcDayRange = { startInclusive: string; endExclusive: string };

/** [00:00:00Z, next 00:00:00Z) for the UTC date containing `now`, as ISO strings. */
export function utcDayRange(now: Date = new Date()): UtcDayRange {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const end = start + 24 * 60 * 60 * 1000;
  return {
    startInclusive: new Date(start).toISOString(),
    endExclusive: new Date(end).toISOString(),
  };
}
