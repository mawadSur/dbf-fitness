/**
 * Keep `profiles.timezone` equal to the device's IANA zone.
 *
 * Streaks and the one-completion-per-day rule are computed in the MEMBER's
 * timezone (D1b), so a stale zone silently moves the day boundary: someone who
 * flies from Dubai to Berlin would lose or double-count a day. The device is
 * the only thing that knows the truth, so it pushes it after sign-in and every
 * time the app comes back to the foreground.
 *
 * Every failure is silent on purpose. In particular, until the D1b migration
 * lands the column does not exist and the update returns 42703 — the app must
 * not surface that to a member, and must not retry-storm on it.
 */

import { supabase } from '../../services/supabase/client';

/** The device's IANA zone, or null when the runtime cannot tell us. */
export function deviceTimezone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof zone === 'string' && zone.length > 0 ? zone : null;
  } catch {
    return null;
  }
}

/** Remembers the value last written so a foreground event is not a round trip. */
let lastSyncedFor: { userId: string; timezone: string } | null = null;

export function resetTimezoneSyncCache(): void {
  lastSyncedFor = null;
}

export type TimezoneSyncOutcome = 'skipped' | 'unchanged' | 'updated' | 'failed';

export async function syncProfileTimezone(userId: string | null): Promise<TimezoneSyncOutcome> {
  const timezone = deviceTimezone();
  if (!userId || !timezone) return 'skipped';
  if (lastSyncedFor && lastSyncedFor.userId === userId && lastSyncedFor.timezone === timezone) {
    return 'unchanged';
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('timezone')
      .eq('id', userId)
      .maybeSingle();
    // Column missing (pre-D1b) or read denied: nothing to do, and remember it so
    // we do not ask again for this user/zone pair this session.
    if (error) {
      lastSyncedFor = { userId, timezone };
      return 'failed';
    }

    const current = (data as { timezone?: unknown } | null)?.timezone;
    if (current === timezone) {
      lastSyncedFor = { userId, timezone };
      return 'unchanged';
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ timezone })
      .eq('id', userId);
    lastSyncedFor = { userId, timezone };
    return updateError ? 'failed' : 'updated';
  } catch {
    lastSyncedFor = { userId, timezone };
    return 'failed';
  }
}
