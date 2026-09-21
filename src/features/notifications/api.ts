// Typed wrappers for the push RPCs added in 20260921140000 / 20260921141000.
//
// Every one of these is a thin call plus an error map. The rules they encode live in SQL
// (`register_push_token` reassigns a shared device, `send_nudge` is once per day per coach and
// member, the outbox is service-write-only) — this file must never re-implement them, only give
// the screens a typed call and a sentence a member can read.
//
// Deliberately free of native modules: getting the Expo token is the client lane's job
// (`src/features/notifications/client/**`), which hands the string to `registerPushToken`. That
// keeps this module importable from Jest and from web.

import { friendlyErrorMessage } from '../../components/friendlyError';
import { supabase } from '../../services/supabase/client';

/** Platforms `push_tokens.platform` accepts; anything else is 22023 from the RPC. */
export type PushPlatform = 'ios' | 'android' | 'web';

/**
 * The only nudge texts that exist. The wording is chosen SERVER-side from this key: a coach can
 * never send free text to a member's lock screen, so this list is an enum, not a default.
 */
export const NUDGE_TEMPLATES = ['check_in', 'missed_workout', 'great_work'] as const;
export type NudgeTemplate = (typeof NUDGE_TEMPLATES)[number];

export function isNudgeTemplate(value: unknown): value is NudgeTemplate {
  return typeof value === 'string' && (NUDGE_TEMPLATES as readonly string[]).includes(value);
}

type PgError = { code?: string | null; message?: string | null };

function errorCode(error: unknown): string | null {
  if (error && typeof error === 'object') {
    const code = (error as PgError).code;
    if (typeof code === 'string') return code;
  }
  return null;
}

/**
 * Registers this device's Expo token for the signed-in user.
 *
 * Reassignment is the point: when a second person signs in on the same handset the row MOVES to
 * them, so the previous owner stops receiving pushes on a phone they no longer hold.
 */
export async function registerPushToken(token: string, platform?: PushPlatform): Promise<void> {
  const { error } = await supabase.rpc('register_push_token', {
    p_token: token,
    p_platform: platform ?? null,
  });
  if (error) throw error;
}

/**
 * Drops one of the caller's own tokens (sign-out). Scoped to the caller in SQL, so a stolen token
 * string cannot be used to silence someone else's device.
 */
export async function unregisterPushToken(token: string): Promise<void> {
  const { error } = await supabase.rpc('unregister_push_token', { p_token: token });
  if (error) throw error;
}

/** Thrown state a nudge UI needs to distinguish; anything else is a generic failure. */
export type NudgeFailure = 'already_today' | 'not_allowed' | 'bad_template' | 'other';

export function classifyNudgeError(error: unknown): NudgeFailure {
  switch (errorCode(error)) {
    case '23505':
      return 'already_today';
    case '42501':
      return 'not_allowed';
    case '22023':
      return 'bad_template';
    default:
      return 'other';
  }
}

const NUDGE_FALLBACK = 'Could not send that nudge.';

/** Copy for a failed nudge. The 42501 case covers both "not your member" and "no live access". */
export function nudgeErrorMessage(error: unknown): string {
  switch (classifyNudgeError(error)) {
    case 'already_today':
      return 'You already nudged this member today.';
    case 'not_allowed':
      return 'You can only nudge your own members while their access is active.';
    case 'bad_template':
      return 'That nudge is no longer available.';
    default:
      return friendlyErrorMessage(error, NUDGE_FALLBACK);
  }
}

/**
 * Sends one nudge and returns the outbox row id. Nothing is pushed inline: the row is delivered by
 * the `notification-drain` tick, so a slow Expo call can never block the coach's screen.
 */
export async function sendNudge(memberId: string, template: NudgeTemplate): Promise<string> {
  const { data, error } = await supabase.rpc('send_nudge', {
    p_member: memberId,
    p_template: template,
  });
  if (error) throw error;
  if (typeof data !== 'string') throw new Error('send_nudge returned no id');
  return data;
}
