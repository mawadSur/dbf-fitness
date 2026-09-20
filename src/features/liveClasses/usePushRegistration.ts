import { useEffect } from 'react';
import { Platform } from 'react-native';

import { createPushService } from '../../services/push';
import { fetchCurrentMember, upsertPushToken } from './api';

export const NO_PUSH_TOKEN_MESSAGE =
  '[liveClasses] No push token was returned: reminders will not be delivered to this device. ' +
  'Usual causes: missing EAS projectId (extra.eas.projectId / EXPO_PUBLIC_EAS_PROJECT_ID), ' +
  'notification permission denied, or a simulator.';

let warnedNoToken = false;

/** Test hook: the "no token" error is emitted once per app session. */
export function resetPushTokenWarning(): void {
  warnedNoToken = false;
}

/** A null token from a real adapter is a config problem worth a loud (one-time) error, not a quiet warn. */
function reportMissingToken(): void {
  if (warnedNoToken || Platform.OS === 'web') return;
  warnedNoToken = true;
  console.error(NO_PUSH_TOKEN_MESSAGE);
}

/**
 * Registers this device's push token for "starting soon" reminders. Members only (coaches host
 * the classes, they are not reminded), and every failure is non-fatal: no token, denied
 * permission or a failed upsert just means no push.
 */
export function usePushRegistration(): void {
  useEffect(() => {
    let cancelled = false;

    const register = async () => {
      try {
        const member = await fetchCurrentMember();
        if (cancelled || !member || member.role !== 'member') return;

        const service = createPushService();
        const token = await service.registerForPushAsync();
        if (cancelled) return;
        if (!token) {
          if (!service.isMock) reportMissingToken();
          return;
        }

        // The mock adapter hands out one fixed fake token for every device. Persisting it would
        // put an undeliverable, globally-shared row in push_tokens that the reminder function
        // then tries to send to, so registration stops here in dev/tests.
        if (service.isMock) return;

        await upsertPushToken(member.id, token);
      } catch (error) {
        console.warn('[liveClasses] push registration skipped', error);
      }
    };
    void register();

    return () => {
      cancelled = true;
    };
  }, []);
}
