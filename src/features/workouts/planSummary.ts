/**
 * Pure shaping of a member's workout plan into what Home and the day list show.
 *
 * Kept free of React and of Supabase so every branch (no plan, mid-plan, plan
 * finished, coach not picked yet) is a table test rather than a rendered screen.
 */

/** One day as the plan list needs it. */
export type PlanDay = {
  id: string;
  dayNumber: number;
  blockName: string;
  durationMinutes: number | null;
};

/**
 * What the member's plan currently is.
 *
 * `no-plan` and `complete` used to be the same value, which is why Home told a
 * member with no plan at all that their "Plan complete!" — the two now differ.
 */
export type PlanSnapshot =
  | { kind: 'no-plan' }
  | { kind: 'next-day'; day: PlanDay; completedCount: number; totalDays: number }
  | { kind: 'complete'; totalDays: number };

/**
 * The single next thing to do, given every day in the plan and the ones already
 * completed. Days are expected in `day_number` order (the query orders them).
 */
export function planSnapshot(days: PlanDay[], completedDayIds: Iterable<string>): PlanSnapshot {
  if (days.length === 0) return { kind: 'no-plan' };

  const completed = new Set(completedDayIds);
  // Only days that are actually in this plan count towards its progress.
  const completedInPlan = days.filter((day) => completed.has(day.id)).length;
  const next = days.find((day) => !completed.has(day.id));

  if (!next) return { kind: 'complete', totalDays: days.length };

  return { kind: 'next-day', day: next, completedCount: completedInPlan, totalDays: days.length };
}

/** "Start Day 3" — the button names the action, never "Submit" (§9 copy). */
export function startDayLabel(dayNumber: number): string {
  return `Start Day ${dayNumber}`;
}

/**
 * "about 40 min", or null when the coach left the duration empty.
 *
 * "about" is deliberate: the number is the coach's estimate, and promising an
 * exact length for a workout nobody has timed reads as a lie.
 */
export function durationCopy(durationMinutes: number | null | undefined): string | null {
  if (durationMinutes == null) return null;
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;
  return `about ${Math.round(durationMinutes)} min`;
}

/**
 * The one supporting line under Home's heading.
 *
 * The heading above it is already the block name, so repeating it here read as
 * a stutter on the real screen — this line carries only the time commitment.
 */
export function nextDaySummary(day: PlanDay): string {
  return durationCopy(day.durationMinutes) ?? 'Your next workout is ready.';
}

/** Status of one day in the list. Never colour alone: each has an icon + word. */
export type DayStatus = 'today' | 'done' | 'upcoming';

export function dayStatus(input: { isCompleted: boolean; isToday: boolean }): DayStatus {
  if (input.isToday) return 'today';
  return input.isCompleted ? 'done' : 'upcoming';
}

/** Word + icon per status, so the badge never leans on its tint (§4). */
export const DAY_STATUS_META: Record<
  DayStatus,
  { label: string; icon: 'play' | 'check-circle' | 'clock'; tone: 'brand' | 'success' | 'neutral' }
> = {
  today: { label: 'Today', icon: 'play', tone: 'brand' },
  done: { label: 'Done', icon: 'check-circle', tone: 'success' },
  upcoming: { label: 'Upcoming', icon: 'clock', tone: 'neutral' },
};

/**
 * The accessible name of a day row. Kept byte-identical to the pre-redesign
 * label ("Day 2, Pull, Upcoming, today") would have been wrong — the old label
 * said both "Upcoming" and "today" for the same row. One status word now.
 */
export function dayRowLabel(day: PlanDay, status: DayStatus): string {
  const duration = durationCopy(day.durationMinutes);
  const parts = [`Day ${day.dayNumber}`, day.blockName, DAY_STATUS_META[status].label];
  if (duration) parts.push(duration);
  return parts.join(', ');
}

/** "3 of 6 done" for the day detail's progress line. */
export function checklistProgress(checked: number, total: number): string {
  return `${checked} of ${total} done`;
}
