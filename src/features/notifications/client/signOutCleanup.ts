/**
 * Release this device's push token before signing out.
 *
 * Order matters: `unregister_push_token` needs the caller's JWT, so it has to
 * run BEFORE `auth.signOut()`. It must also never be able to keep someone
 * signed in — it is raced against a 3 s timeout inside `unregisterPushToken`
 * and every failure resolves rather than throws.
 *
 * Without it, the next person to sign in on a shared phone keeps receiving the
 * previous member's reminders until the row is reassigned.
 */

import { getExistingPushToken } from './deviceToken';
import { unregisterPushToken } from './pushTokenApi';
import { forgetPushToken, getRememberedPushToken } from './tokenStore';

export async function releasePushTokenBeforeSignOut(): Promise<boolean> {
  try {
    // Prefer the remembered token (cheap, no native call). Fall back to reading
    // it back only when this run never registered one — e.g. after a reload.
    const token = getRememberedPushToken() ?? (await getExistingPushToken());
    if (!token) return false;
    const released = await unregisterPushToken(token);
    forgetPushToken();
    return released;
  } catch {
    forgetPushToken();
    return false;
  }
}
