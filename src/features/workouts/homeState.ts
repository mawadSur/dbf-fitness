/**
 * What Home leads with, decided in one pure place.
 *
 * Home has to pick ONE primary card out of five mutually exclusive situations
 * (still loading, no coach, coach but no plan, a day to start, plan finished)
 * and it must never show member content to staff. Doing that inline produced
 * the bug this replaces: a member with no plan at all was congratulated with
 * "Plan complete!".
 */

import type { PlanDay, PlanSnapshot } from './planSummary';

export type ProfileRole = 'member' | 'coach' | 'admin';

export function isStaffRole(role: ProfileRole | null | undefined): boolean {
  return role === 'coach' || role === 'admin';
}

/** The one card at the top of a member's Home. */
export type HomePrimary =
  /** Nothing is decided yet — render the skeleton, never a half-answer. */
  | { kind: 'loading' }
  /** A member who has not chosen a coach: the only next step is picking one. */
  | { kind: 'needs-coach' }
  /** Coach assigned, plan not written yet. Calm, and NO dead button. */
  | { kind: 'awaiting-plan' }
  /** The normal case. */
  | { kind: 'next-day'; day: PlanDay; completedCount: number; totalDays: number }
  /** Every day done. */
  | { kind: 'plan-complete'; totalDays: number };

export type HomePrimaryInput = {
  role: ProfileRole | null | undefined;
  /** `null` = the member has no coach, `undefined` = not answered yet. */
  hasCoach: boolean | undefined;
  /** `undefined` while the plan query is still in flight. */
  plan: PlanSnapshot | undefined;
};

/**
 * Only ever called for members — `isStaffRole` decides the branch before this,
 * because staff have neither a coach nor a plan and must not be told so.
 */
export function memberHomePrimary(input: HomePrimaryInput): HomePrimary {
  if (input.role !== 'member') return { kind: 'loading' };

  // The coach answer gates everything: showing "your coach is preparing your
  // plan" to somebody who has no coach would be a lie, and flashing the coach
  // nudge at a member who has one is the flicker the old screen guarded against.
  if (input.hasCoach === undefined) return { kind: 'loading' };
  if (input.hasCoach === false) return { kind: 'needs-coach' };

  if (input.plan === undefined) return { kind: 'loading' };

  switch (input.plan.kind) {
    case 'no-plan':
      return { kind: 'awaiting-plan' };
    case 'complete':
      return { kind: 'plan-complete', totalDays: input.plan.totalDays };
    case 'next-day':
      return {
        kind: 'next-day',
        day: input.plan.day,
        completedCount: input.plan.completedCount,
        totalDays: input.plan.totalDays,
      };
  }
}

/** The greeting. Second person, sentence case, and it survives a missing name. */
export function greeting(fullName: string | null | undefined, role: ProfileRole | null): string {
  const first = firstName(fullName);
  if (isStaffRole(role)) {
    return first ? `Welcome back, Coach ${first}` : 'Welcome back, Coach';
  }
  return first ? `Hi, ${first}` : 'Hi there';
}

/**
 * Titles that coaches put in `profiles.full_name` ("Coach Dana Reyes"). Left in,
 * the staff greeting read "Welcome back, Coach Coach" on the seeded account.
 */
const NAME_TITLES = new Set(['coach', 'dr', 'mr', 'mrs', 'ms', 'mx', 'prof']);

/** First real word of the name; blank/whitespace-only names fall back to nothing. */
export function firstName(fullName: string | null | undefined): string | null {
  const words = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  const name = words.find((word) => !NAME_TITLES.has(word.toLowerCase().replace(/[.,]+$/, '')));
  return name ?? null;
}

/** The staff rows on Home. Effort review is coach-only (admins do not score). */
export type StaffLink = { label: string; href: string; icon: 'video' | 'file-text' | 'trophy' };

export function staffLinks(role: ProfileRole): StaffLink[] {
  const links: StaffLink[] = [
    { label: 'Live classes', href: '/community/live', icon: 'video' },
    { label: 'Recordings', href: '/notes', icon: 'file-text' },
  ];
  if (role === 'coach') {
    links.push({ label: 'Effort review', href: '/effort-review', icon: 'trophy' });
  }
  return links;
}
