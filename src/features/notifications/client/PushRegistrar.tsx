/**
 * Root-level, silent push-token registration.
 *
 * Runs once the session is ready and ONLY when notification permission has
 * already been granted — it never prompts (the live-class screen does that, in
 * context). Renders nothing; every failure is swallowed, because push is an
 * enhancement and a device that cannot register must still work normally.
 */

import { useEffect } from 'react';
import { Platform } from 'react-native';

import { getExistingPushToken } from './deviceToken';
import { registerPushToken } from './pushTokenApi';
import { getRememberedPushToken, rememberPushToken } from './tokenStore';

/** Testable core: resolves to the token it registered, or null. */
export async function registerDeviceTokenIfPermitted(deps: {
  getToken: () => Promise<string | null>;
  register: (token: string, platform: string) => Promise<boolean>;
  platform: string;
}): Promise<string | null> {
  if (deps.platform === 'web') return null;
  const token = await deps.getToken();
  if (!token) return null;
  // Re-registering the identical token on every mount is pointless write
  // traffic; the RPC is an upsert, so one call per token per app run is enough.
  if (getRememberedPushToken() === token) return token;
  const ok = await deps.register(token, deps.platform);
  if (!ok) return null;
  rememberPushToken(token);
  return token;
}

export function usePushRegistrar(isSessionReady: boolean): void {
  useEffect(() => {
    if (!isSessionReady) return;
    let cancelled = false;

    void (async () => {
      try {
        const token = await registerDeviceTokenIfPermitted({
          getToken: getExistingPushToken,
          register: registerPushToken,
          platform: Platform.OS,
        });
        if (cancelled && token) rememberPushToken(token);
      } catch {
        // Non-fatal by design.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isSessionReady]);
}

export function PushRegistrar({ isSessionReady }: { isSessionReady: boolean }) {
  usePushRegistrar(isSessionReady);
  return null;
}
