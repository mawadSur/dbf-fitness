// Friendly copy for the error codes the admin RPCs raise (see
// supabase/migrations/20260921130000_admin_payments.sql and 20260921131000_moderation_admin.sql).
//
// The server messages are stable identifiers, not copy: everything an admin
// actually reads is written here. Anything unrecognised falls through to
// friendlyErrorMessage(), so a new server error can never render raw SQL text.

import { friendlyErrorMessage } from '../../components/friendlyError';

/** Every identifier an admin RPC can raise, as the `message` of a Postgres error. */
export type AdminErrorCode =
  | 'admin_required'
  | 'mfa_required'
  | 'member_not_found'
  | 'subscription_not_found'
  | 'report_not_found'
  | 'group_not_found'
  | 'stale_subscription'
  | 'period_backwards'
  | 'period_out_of_bounds'
  | 'invalid_currency'
  | 'invalid_amount'
  | 'invalid_status'
  | 'invalid_status_filter'
  | 'invalid_state_filter'
  | 'accused_cannot_review'
  | 'member_and_period_end_required'
  | 'member_required'
  | 'report_required'
  | 'group_and_member_required'
  | 'subscription_events_append_only'
  | 'moderation_actions_append_only';

const COPY: Record<AdminErrorCode, string> = {
  admin_required: 'Only an admin can do this.',
  mfa_required: 'Confirm your authenticator code first, then try again.',
  member_not_found: 'That member no longer exists.',
  subscription_not_found: 'That member has no subscription yet, so there is nothing to cancel.',
  report_not_found: 'That report no longer exists.',
  group_not_found: 'That group no longer exists.',
  stale_subscription:
    'Someone else changed this subscription while you were editing. Reload and try again.',
  period_backwards:
    'That date is earlier than the current period end. Tick "allow an earlier date" if you meant to correct it.',
  period_out_of_bounds: 'Pick a date between today and about a year from now.',
  invalid_currency: 'Use a three-letter currency code, like USD.',
  invalid_amount: 'Enter a valid amount.',
  invalid_status: 'Pick one of: reviewed, dismissed, actioned.',
  invalid_status_filter: 'That report filter is not valid.',
  invalid_state_filter: 'That subscription filter is not valid.',
  accused_cannot_review: 'You cannot resolve a report that was filed about you.',
  member_and_period_end_required: 'Choose a member and a date.',
  member_required: 'Choose a member.',
  report_required: 'Choose a report.',
  group_and_member_required: 'Choose a group and a member.',
  subscription_events_append_only: 'The billing ledger cannot be edited.',
  moderation_actions_append_only: 'The moderation audit cannot be edited.',
};

function codeOf(error: unknown): AdminErrorCode | null {
  if (!error || typeof error !== 'object') return null;
  const message = (error as { message?: unknown }).message;
  if (typeof message !== 'string') return null;
  // PostgREST forwards the raised message verbatim; some transports prefix it.
  const codes = Object.keys(COPY) as AdminErrorCode[];
  // Exact match wins outright.
  const exact = codes.find((c) => message === c);
  if (exact) return exact;
  // Otherwise take the LONGEST substring match, never the first: several codes
  // are prefixes of others ('invalid_status' of 'invalid_status_filter',
  // 'member_required' of 'group_and_member_required'), so insertion order would
  // otherwise resolve the wrong, more generic copy.
  let best: AdminErrorCode | null = null;
  for (const c of codes) {
    if (message.includes(c) && (best === null || c.length > best.length)) best = c;
  }
  return best;
}

/** True when the failure is the admin gate (wrong role or missing step-up). */
export function isAdminGateError(error: unknown): boolean {
  const code = codeOf(error);
  return code === 'admin_required' || code === 'mfa_required';
}

/** Admin-facing sentence for any error an admin RPC can produce. */
export function adminErrorMessage(error: unknown, fallback: string): string {
  const code = codeOf(error);
  return code ? COPY[code] : friendlyErrorMessage(error, fallback);
}
