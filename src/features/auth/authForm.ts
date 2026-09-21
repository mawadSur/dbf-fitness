// Pure form logic for the sign-in / sign-up screens: field validation, submit
// gating and member-facing copy for a failed request. Kept out of the screens so
// every rule is unit-tested without a renderer.

import { classifyError, friendlyErrorMessage } from '../../components/friendlyError';

/** GoTrue's own floor; the server rejects anything shorter. */
export const PASSWORD_MIN_LENGTH = 6;

/**
 * Deliberately permissive: `something@something.tld` with no spaces. The server
 * is the real authority, this only catches the typo before a round trip.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 'Enter your email address.';
  if (!EMAIL_RE.test(trimmed)) return 'Enter a valid email address, like you@example.com.';
  return null;
}

/** Sign-in: any non-empty password; the server decides if it is right. */
export function validateCurrentPassword(value: string): string | null {
  if (value.length === 0) return 'Enter your password.';
  return null;
}

/** Sign-up: mirrors the server's minimum so the failure happens before the request. */
export function validateNewPassword(value: string): string | null {
  if (value.length === 0) return 'Choose a password.';
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  return null;
}

export function validateFullName(value: string): string | null {
  if (value.trim().length === 0) return 'Enter your name.';
  return null;
}

export type FieldErrors = Record<string, string | null>;

/** True when no field currently holds an error. */
export function isFormValid(errors: FieldErrors): boolean {
  return Object.values(errors).every((message) => message == null);
}

/**
 * Which fields to show an error under after a submit attempt: everything that
 * fails, so the person fixes them in one pass instead of one per tap.
 */
export function touchedAfterSubmit(errors: FieldErrors): Record<string, boolean> {
  const touched: Record<string, boolean> = {};
  for (const key of Object.keys(errors)) touched[key] = true;
  return touched;
}

export const SIGN_IN_GENERIC_ERROR = 'Could not sign you in. Please try again.';

const BAD_CREDENTIALS =
  /invalid login credentials|invalid email or password|invalid grant|bad_credentials/i;
const UNCONFIRMED = /email not confirmed|not confirmed/i;
const RATE_LIMITED = /too many requests|rate limit|\b429\b/i;

/**
 * Sign-in failures in the member's language.
 *
 * `friendlyErrorMessage` alone is wrong here: it classifies "Invalid login
 * credentials" as an auth error and answers "You are not signed in. Please sign
 * in again." on the sign-in screen itself. Credential, confirmation and
 * rate-limit cases are named first; everything else falls through to the shared
 * network/offline copy.
 */
export function describeSignInError(error: unknown): string {
  if (error == null) return SIGN_IN_GENERIC_ERROR;

  const text =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : typeof (error as { message?: unknown })?.message === 'string'
          ? ((error as { message: string }).message)
          : '';

  if (BAD_CREDENTIALS.test(text)) {
    return 'That email and password do not match. Check them and try again.';
  }
  if (UNCONFIRMED.test(text)) {
    return 'Confirm your email address first, then sign in.';
  }
  if (RATE_LIMITED.test(text)) {
    return 'Too many attempts. Wait a minute and try again.';
  }
  // Only the offline/timeout case has copy of its own; an "auth" classification
  // here would just tell the person to sign in on the sign-in screen.
  if (classifyError(error) === 'network') {
    return friendlyErrorMessage(error, SIGN_IN_GENERIC_ERROR);
  }
  return SIGN_IN_GENERIC_ERROR;
}

/** Title for the submit-level Banner; the detail goes in `message`. */
export function errorBannerTitle(error: unknown): string {
  return classifyError(error) === 'network' ? 'You appear to be offline' : 'That did not work';
}
