// Sign-up name normalisation and error copy.
//
// 20260919152000 added the CHECK constraint `profiles_text_bounds`
// (`length(full_name) between 1 and 120`). The server-side trigger
// public.handle_new_auth_user (20260919152100) truncates with `left(btrim(name), 120)`
// before it inserts, so the ACCOUNT and the PROFILE are always created — but the
// reconciling upsert in app/(auth)/sign-up.tsx still sent the untruncated string and
// came back
//   400 {"code":"23514","message":"new row for relation \"profiles\" violates check
//        constraint \"profiles_text_bounds\""}
// which the screen printed verbatim and then refused to navigate. Retrying then gave
// "User already registered": onboarding was permanently stuck for that person.
//
// This module mirrors the trigger's truncation on the client so the constraint is never
// reached, and maps any constraint text that still arrives to member-facing copy, the
// way src/features/workouts/finishWorkoutErrors.ts maps 23505.

/** Mirrors the profiles_text_bounds upper bound. */
export const FULL_NAME_MAX_LENGTH = 120;

export const NAME_TOO_LONG_MESSAGE = `Please use a name of ${FULL_NAME_MAX_LENGTH} characters or fewer.`;

export const GENERIC_SIGN_UP_ERROR_MESSAGE = 'Could not create your account. Please try again.';

/** Postgres check_violation. */
const CHECK_VIOLATION = '23514';

/** SQLSTATE: five alphanumerics, e.g. 23514 / 42501 / P0001. */
const SQLSTATE_RE = /^[0-9A-Z]{5}$/;

/** Raw driver text that must never reach a member. */
const RAW_POSTGRES_RE = /violates .*constraint|new row for relation|duplicate key value/i;

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

/**
 * The exact value the server would have stored: `left(btrim(name), 120)`.
 *
 * Counts CODE POINTS, not UTF-16 code units, so it agrees with Postgres `length()` for
 * astral characters (emoji) and can never cut a surrogate pair in half and emit an
 * unpaired surrogate onto the wire.
 */
export function normalizeFullName(raw: string): string {
  const trimmed = raw.trim();
  const codePoints = Array.from(trimmed);
  if (codePoints.length <= FULL_NAME_MAX_LENGTH) return trimmed;
  return codePoints.slice(0, FULL_NAME_MAX_LENGTH).join('');
}

/** True when this error is "the profile text bounds rejected this value". */
export function isNameTooLongError(error: unknown): boolean {
  if (codeOf(error) === CHECK_VIOLATION) return true;
  const message = messageOf(error);
  return message != null && message.includes('profiles_text_bounds');
}

/**
 * Member-facing copy for a failed sign-up. GoTrue's own messages ("User already
 * registered", "Password should be at least 6 characters") are already written for
 * people and pass through; anything carrying a SQLSTATE or raw constraint text does not.
 */
export function describeSignUpError(error: unknown): string {
  if (error == null) return GENERIC_SIGN_UP_ERROR_MESSAGE;
  if (isNameTooLongError(error)) return NAME_TOO_LONG_MESSAGE;

  const message = messageOf(error);
  if (message == null || message.length === 0) return GENERIC_SIGN_UP_ERROR_MESSAGE;

  const code = codeOf(error);
  if (code != null && SQLSTATE_RE.test(code)) return GENERIC_SIGN_UP_ERROR_MESSAGE;
  if (RAW_POSTGRES_RE.test(message)) return GENERIC_SIGN_UP_ERROR_MESSAGE;

  return message;
}
