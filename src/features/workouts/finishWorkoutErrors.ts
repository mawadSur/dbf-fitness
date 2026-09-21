// Error copy for the "Finish Workout" action.
//
// 20260919152200 scopes workout_completions uniqueness to one row per member, per
// workout day, per UTC calendar date. Repeating a workout on a LATER date is fine, but
// tapping Finish twice on the same day now returns Postgres 23505. Without this mapping
// the screen printed the raw driver text ("duplicate key value violates unique
// constraint \"workout_completions_member_day_date_key\"") straight at the member.

export const ALREADY_LOGGED_TODAY_MESSAGE =
  "You've already logged this workout today. Come back tomorrow to keep your streak going.";

export const GENERIC_FINISH_ERROR_MESSAGE = 'Could not finish this workout. Please try again.';

// D1a's `finish_workout` raises two named errors instead of leaking RLS denials
// as an empty result. Both are "this is not your workout to log", phrased for a
// member who most likely opened a stale link or changed coach mid-plan.
export const NOT_YOUR_PLAN_MESSAGE =
  'This workout is not part of your plan any more. Pull to refresh to see your current plan.';

export const DAY_NOT_FOUND_MESSAGE =
  'This workout day is no longer available. Your coach may have changed your plan — pull to refresh.';

/** Postgres unique_violation. */
const UNIQUE_VIOLATION = '23505';
/**
 * `finish_workout`: caller does not own the day's plan.
 *
 * 42501 is `insufficient_privilege`, which a plain RLS denial ALSO raises, so
 * the named message is required too — otherwise a generic policy failure on
 * some other table would be explained to the member as "not your plan".
 */
const NOT_YOUR_PLAN = '42501';
const NOT_YOUR_PLAN_TOKEN = 'not_your_plan';
/** `finish_workout`: unknown or archived day. P0002 is not ambiguous here. */
const DAY_NOT_FOUND = 'P0002';

function codeOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function messageOf(error: unknown): string | null {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return null;
}

/** True when this error is "this member already completed this day today". */
export function isAlreadyLoggedTodayError(error: unknown): boolean {
  if (codeOf(error) === UNIQUE_VIOLATION) return true;
  // PostgREST occasionally surfaces the constraint name without a machine code
  // (e.g. when the error travels through an RPC wrapper).
  const message = messageOf(error);
  return message != null && message.includes('workout_completions_member_day_date_key');
}

/** True for `finish_workout`'s "the caller does not own this day's plan" error. */
export function isNotYourPlanError(error: unknown): boolean {
  if (codeOf(error) !== NOT_YOUR_PLAN) return false;
  return (messageOf(error) ?? '').includes(NOT_YOUR_PLAN_TOKEN);
}

/** Member-facing copy for a failed Finish Workout. Never leaks raw Postgres text. */
export function describeFinishWorkoutError(error: unknown): string {
  if (error == null) return GENERIC_FINISH_ERROR_MESSAGE;
  if (isAlreadyLoggedTodayError(error)) return ALREADY_LOGGED_TODAY_MESSAGE;
  if (isNotYourPlanError(error)) return NOT_YOUR_PLAN_MESSAGE;
  if (codeOf(error) === DAY_NOT_FOUND) return DAY_NOT_FOUND_MESSAGE;

  const message = messageOf(error);
  if (message === 'Not signed in.') return message;

  // Anything else is a server/driver string: show a stable sentence instead.
  return GENERIC_FINISH_ERROR_MESSAGE;
}
