import type { DeleteAccountErrorCode } from './api';

/**
 * Pure logic behind the "Delete account" danger-zone panel: what the user is told, and when the
 * destructive button is allowed to fire. Kept out of the component so every branch is testable
 * without rendering, and so the confirm rule lives in exactly one place.
 */

export type AccountRole = 'member' | 'coach' | 'admin';

/** The word the user must type, matching CONFIRM_WORD in the Edge Function's logic.ts. */
export const CONFIRM_WORD = 'DELETE';

/**
 * Whitespace is forgiven (phone keyboards add a trailing space on autocorrect) but case is not:
 * the whole point of the typed confirmation is that it cannot be produced by accident.
 */
export function isConfirmed(typed: string): boolean {
  return typed.trim() === CONFIRM_WORD;
}

/** The delete button fires only with the typed confirmation, a password, and no request in flight. */
export function canSubmit(input: { confirmText: string; password: string; busy: boolean }): boolean {
  return !input.busy && isConfirmed(input.confirmText) && input.password.length > 0;
}

/**
 * What this specific account loses, in plain language.
 *
 * A coach is told how many people they cut off, because that is the consequence they cannot undo
 * for anyone but themselves. When the count could not be read we say "your members" rather than
 * guessing a number — a wrong "0 members" would be worse than vague.
 *
 * The second coach bullet is the one added on 2026-09-20 after review: workout_plans.coach_id and
 * diet_plans.coach_id are ON DELETE CASCADE (migrations 20260919114448 / 114449), so deleting a
 * coach also deletes every plan they wrote AND the members' own logged workouts and diet check-ins
 * hanging off those plans. That is other people's history, it is irreversible, and the panel used
 * to describe the whole thing as merely losing "access" — the one consequence a coach is least
 * likely to guess is the one they must be told before they type DELETE.
 */
export function deletionConsequences(role: AccountRole, memberCount: number | null): string[] {
  if (role === 'coach' || role === 'admin') {
    const who =
      memberCount === null
        ? 'Your members'
        : memberCount === 1
          ? '1 member'
          : `${memberCount} members`;
    const their = memberCount === 1 ? 'That member also loses' : 'They also lose';
    return [
      `${who} will lose access to your classes and notes, and will be asked to choose a new coach.`,
      // Skipped only when the count is a confirmed zero: with nobody to lose anything the bullet is
      // noise. A null count is NOT zero, so the warning still shows when we could not read it.
      ...(memberCount === 0
        ? []
        : [
            `${their} the workout and diet plans you wrote for them — including the workouts they logged, their diet check-ins and their notes progress on those plans. That history cannot be recovered.`,
          ]),
      'Groups you created are deleted along with every membership in them, including members who belong to other coaches.',
      'Your coach profile, live classes, recordings, transcripts and workout notes are permanently erased.',
      'Your own progress, check-ins and account details are permanently erased.',
    ];
  }
  return [
    'Your workout and diet progress, check-ins, milestones and notes progress are permanently erased.',
    'Your coach relationship is removed — your coach will no longer see you.',
    'Your account details and sign-in are permanently erased.',
  ];
}

/**
 * Deleting the account does not touch a store subscription: Apple and Google own that billing
 * relationship, and an erased account keeps renewing if the user does not cancel it themselves.
 */
export const STORE_SUBSCRIPTION_NOTE =
  'Deleting your account does not cancel a paid subscription. Cancel it in your App Store or Google Play settings, or you will keep being charged.';

export const DELETED_MESSAGE = 'Your account was deleted';

/** Shown instead of the delete form for admins: the Edge Function always refuses them. */
export const ADMIN_MANAGED_NOTE =
  'Admin accounts are managed by your operator. Contact them if this account needs to be removed.';

/** Copy for every refusal the Edge Function can return, plus the two the client can produce. */
export function deleteAccountErrorMessage(code: DeleteAccountErrorCode): string {
  switch (code) {
    case 'invalid_password':
      return 'That password is not right. Try again.';
    case 'confirm_required':
      return `Type ${CONFIRM_WORD} to confirm before deleting.`;
    case 'admin_managed_by_operator':
      return 'Admin accounts are deleted by an operator. Contact support and we will remove yours.';
    case 'unauthorized':
      return 'Your session expired. Sign in again and retry.';
    case 'payload_too_large':
      // The only field the user controls is the password, and it is the only thing that can push
      // the body over 4 KiB. Retrying the same input cannot help, so say what to change.
      return 'That password is too long to send. Reset it to something shorter, or contact support.';
    case 'storage_cleanup_failed':
      // The Edge Function lists the bucket BEFORE it deletes the account, so this refusal always
      // means nothing was deleted — but it is a server-side failure, not a hiccup, and the user
      // should not be left retrying forever.
      return 'We could not reach your uploaded recordings, so your account was NOT deleted. Try again, and contact support if it keeps failing.';
    case 'network':
      return 'Could not reach the server. Check your connection and try again.';
    default:
      return 'Could not delete your account. Try again in a moment.';
  }
}

/**
 * Whether retrying makes sense, or the panel should only offer a way out.
 *
 * payload_too_large joins the non-retryable set: the body is built from the same password every
 * time, so the form would only invite the user to fail again. storage_cleanup_failed stays
 * retryable — it is a transient server-side failure and the account is still there.
 */
export function isRetryable(code: DeleteAccountErrorCode): boolean {
  return (
    code !== 'admin_managed_by_operator' &&
    code !== 'unauthorized' &&
    code !== 'payload_too_large'
  );
}
