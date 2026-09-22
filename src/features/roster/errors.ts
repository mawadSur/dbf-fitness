// Friendly copy for the errors the D1c roster RPCs raise
// (supabase/migrations/20260921120000_roster_attention.sql).
//
// The server messages are stable identifiers, not copy: everything a coach
// actually reads is written here. Anything unrecognised falls through to
// friendlyErrorMessage(), so a new server error can never render raw SQL text.

import { friendlyErrorMessage } from '../../components/friendlyError';

/** Every identifier a roster RPC can raise, as the `message` of a Postgres error. */
export type RosterErrorCode = 'not_entitled' | 'member_not_found' | 'member_has_no_coach' | 'snooze_too_long';

const COPY: Record<RosterErrorCode, string> = {
  not_entitled: 'Only this member’s coach or an admin can see this.',
  member_not_found: 'That member no longer exists.',
  member_has_no_coach: 'That member has no coach yet, so there is nothing to snooze.',
  snooze_too_long: 'You can snooze a member for at most 14 days.',
};

function codeOf(error: unknown): RosterErrorCode | null {
  if (!error || typeof error !== 'object') return null;
  const message = (error as { message?: unknown }).message;
  if (typeof message !== 'string') return null;
  const codes = Object.keys(COPY) as RosterErrorCode[];
  const exact = codes.find((c) => message === c);
  if (exact) return exact;
  // Longest match, never the first: 'member_not_found' and 'member_has_no_coach'
  // share a prefix, so insertion order could otherwise pick the wrong copy.
  let best: RosterErrorCode | null = null;
  for (const c of codes) {
    if (message.includes(c) && (best === null || c.length > best.length)) best = c;
  }
  return best;
}

/** True when the failure is the roster gate (not this coach's member, or not a coach at all). */
export function isRosterGateError(error: unknown): boolean {
  return codeOf(error) === 'not_entitled';
}

/** Coach-facing sentence for any error a roster RPC can produce. */
export function rosterErrorMessage(error: unknown, fallback: string): string {
  const code = codeOf(error);
  return code ? COPY[code] : friendlyErrorMessage(error, fallback);
}

export const ROSTER_FALLBACK = 'Could not load your roster. Please try again.';
export const ATTENTION_FALLBACK = 'Could not load what needs your attention. Please try again.';
export const EFFORT_QUEUE_FALLBACK = 'Could not load sessions waiting for a score. Please try again.';
export const MEMBER_HISTORY_FALLBACK = 'Could not load this member’s history. Please try again.';
export const SNOOZE_FALLBACK = 'Could not snooze this member. Please try again.';
