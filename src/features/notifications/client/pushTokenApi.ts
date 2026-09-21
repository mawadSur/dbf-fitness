/**
 * Client side of the push-token lifecycle RPCs (D3 contract).
 *
 *   register_push_token(p_token text, p_platform text) -> void
 *   unregister_push_token(p_token text)                -> void
 *
 * Both land in a parallel branch, so every call here is BEST EFFORT: until the
 * functions exist the RPC returns PGRST202 ("function not found") and we
 * swallow it. Push is an enhancement; nothing in the app may fail because of it.
 */

import { supabase } from '../../../services/supabase/client';

/** Timeout for the sign-out path: a slow network must never hold a user in the app. */
export const UNREGISTER_TIMEOUT_MS = 3000;

/** Expo tokens are `ExponentPushToken[...]` or `ExpoPushToken[...]`. */
const EXPO_TOKEN = /^Expo(nent)?PushToken\[[^\]\s]+\]$/;

export function isExpoPushToken(token: unknown): token is string {
  return typeof token === 'string' && EXPO_TOKEN.test(token);
}

/** Resolves to true when the row was written, false for every non-fatal failure. */
export async function registerPushToken(token: string, platform: string): Promise<boolean> {
  if (!isExpoPushToken(token)) return false;
  try {
    const { error } = await supabase.rpc('register_push_token', {
      p_token: token,
      p_platform: platform,
    });
    if (error) {
      console.warn('[push] register_push_token skipped:', error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('[push] register_push_token skipped:', error);
    return false;
  }
}

/** Races the RPC against a timeout: sign-out continues either way. */
export async function unregisterPushToken(
  token: string,
  timeoutMs: number = UNREGISTER_TIMEOUT_MS,
): Promise<boolean> {
  if (!isExpoPushToken(token)) return false;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });

  try {
    const call = (async () => {
      const { error } = await supabase.rpc('unregister_push_token', { p_token: token });
      return !error;
    })();
    return await Promise.race([call, timeout]);
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
