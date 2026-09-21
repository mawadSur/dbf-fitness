/**
 * Pure month-grid maths for the calendar screen.
 *
 * EVERYTHING HERE IS UTC-DAY BASED, on purpose: the DB's uniqueness key for a
 * completion is `(member_id, workout_day_id, (completed_at at time zone
 * 'utc')::date)` and `src/features/workouts/completionWindow.ts` already asks
 * the server about the UTC day. A local-date grid would disagree with the
 * "Logged for today" state on the workout screen either side of midnight UTC.
 *
 * WEEK START: Monday, fixed. The device default would have to come from
 * `Intl.Locale.prototype.getWeekInfo`, which Hermes does not ship (and the
 * `weekInfo` accessor is not in the Hermes Intl subset either), so asking for
 * it means a `undefined` read on device and a different grid on web — worse
 * than one documented choice. Month and weekday names are spelled out here for
 * the same reason, and because the product is English-only (owner decision).
 */

export type MonthKey = { year: number; month: number };

export type DayCompletion = {
  id: string;
  status: 'completed' | 'missed';
  effortScore: number | null;
  completedAt: string;
};

export type DayCell = {
  day: number;
  /** `YYYY-MM-DD`, UTC. */
  dateKey: string;
  isToday: boolean;
  /** At least one `completed` row on that UTC day. */
  isCompleted: boolean;
  completions: DayCompletion[];
};

/** `null` is a padding cell before the 1st / after the last of the month. */
export type GridCell = DayCell | null;

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** Monday first — see the note at the top of the file. */
export const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;
export const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export function utcDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** `YYYY-MM-DD` for the UTC day an ISO timestamp falls in; `null` if unparseable. */
export function utcDayKeyOf(iso: string): string | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : utcDateKey(date);
}

export function monthKeyOf(date: Date): MonthKey {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
}

export function addMonths(key: MonthKey, delta: number): MonthKey {
  const total = key.year * 12 + key.month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/** Negative when `a` is earlier, 0 when equal, positive when later. */
export function compareMonths(a: MonthKey, b: MonthKey): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month);
}

export function sameMonth(a: MonthKey, b: MonthKey): boolean {
  return compareMonths(a, b) === 0;
}

export function monthTitle(key: MonthKey): string {
  return `${MONTH_NAMES[key.month]} ${key.year}`;
}

export function daysInMonth(key: MonthKey): number {
  return new Date(Date.UTC(key.year, key.month + 1, 0)).getUTCDate();
}

/** Monday-first column (0-6) of the 1st of the month. */
export function firstWeekdayIndex(key: MonthKey): number {
  return (new Date(Date.UTC(key.year, key.month, 1)).getUTCDay() + 6) % 7;
}

export function groupByUtcDay(rows: readonly DayCompletion[]): Map<string, DayCompletion[]> {
  const byDay = new Map<string, DayCompletion[]>();
  for (const row of rows) {
    const key = utcDayKeyOf(row.completedAt);
    if (!key) continue;
    const bucket = byDay.get(key);
    if (bucket) bucket.push(row);
    else byDay.set(key, [row]);
  }
  return byDay;
}

/**
 * The padded grid for one month: leading `null`s so the 1st lands under its
 * weekday, then every day, then trailing `null`s so the length is a whole
 * number of weeks (the rows never reflow when a month starts on a Sunday).
 */
export function buildMonthCells(
  key: MonthKey,
  byDay: Map<string, DayCompletion[]>,
  todayKey: string,
): GridCell[] {
  const lead = firstWeekdayIndex(key);
  const total = daysInMonth(key);
  const cells: GridCell[] = new Array(lead).fill(null);

  for (let day = 1; day <= total; day += 1) {
    const dateKey = `${key.year}-${`${key.month + 1}`.padStart(2, '0')}-${`${day}`.padStart(2, '0')}`;
    const completions = byDay.get(dateKey) ?? [];
    cells.push({
      day,
      dateKey,
      isToday: dateKey === todayKey,
      isCompleted: completions.some((row) => row.status === 'completed'),
      completions,
    });
  }

  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/**
 * Which months the prev/next buttons may reach.
 *
 * The data months bound it, and the month being viewed today is always inside
 * it — otherwise a member with no history at all would open onto a month the
 * header calls out of range.
 */
export function monthRange(
  dayKeys: readonly string[],
  currentMonth: MonthKey,
): { first: MonthKey; last: MonthKey } {
  let first = currentMonth;
  let last = currentMonth;
  for (const dayKey of dayKeys) {
    const [year, month] = dayKey.split('-').map(Number);
    if (!Number.isFinite(year) || !Number.isFinite(month)) continue;
    const key = { year, month: month - 1 };
    if (compareMonths(key, first) < 0) first = key;
    if (compareMonths(key, last) > 0) last = key;
  }
  return { first, last };
}

export function countCompletedInMonth(
  byDay: Map<string, DayCompletion[]>,
  key: MonthKey,
): number {
  const prefix = `${key.year}-${`${key.month + 1}`.padStart(2, '0')}-`;
  let count = 0;
  for (const [dayKey, rows] of byDay) {
    if (!dayKey.startsWith(prefix)) continue;
    if (rows.some((row) => row.status === 'completed')) count += 1;
  }
  return count;
}

/** The text summary under the grid — the same fact the cells carry, in words. */
export function monthSummary(count: number, key: MonthKey): string {
  const month = MONTH_NAMES[key.month];
  if (count === 0) return `No workouts in ${month}`;
  if (count === 1) return `1 workout in ${month}`;
  return `${count} workouts in ${month}`;
}

export function effortLabel(score: number | null): string {
  return score != null ? `effort ${score} out of 10` : 'no effort score yet';
}

/**
 * "Tuesday 8 September" for a `YYYY-MM-DD` key.
 *
 * Derived from the date itself rather than from the cell's column, so it stays
 * right even if the grid's week start ever changes.
 */
export function dayTitle(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const weekday = WEEKDAY_NAMES[(new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7];
  return `${weekday} ${day} ${MONTH_NAMES[month - 1]}`;
}

/** Every cell says its own date and state out loud — the grid is not a picture. */
export function dayCellLabel(cell: DayCell): string {
  const parts = [dayTitle(cell.dateKey)];
  if (cell.isToday) parts.push('today');
  if (cell.isCompleted) {
    const scored = cell.completions.find((row) => row.effortScore != null);
    parts.push('workout completed');
    parts.push(effortLabel(scored ? scored.effortScore : null));
  } else {
    parts.push('no workout logged');
  }
  return parts.join(', ');
}

