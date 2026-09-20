import type { PushService } from './types';

/** Deterministic fake token in Expo's `ExponentPushToken[...]` shape, identical on every call. */
export const MOCK_PUSH_TOKEN = 'ExponentPushToken[mock-dbf-device]';

/**
 * Console-logging stand-in for the real Expo Notifications adapter. Used in
 * local dev / tests so "starting soon" scheduling can be exercised without
 * device push credentials.
 */
export function createMockPushService(): PushService {
  const registerForPushAsync = async () => MOCK_PUSH_TOKEN;

  return {
    isMock: true,
    registerForPushAsync,
    registerForPushNotifications: registerForPushAsync,

    async scheduleLocalNotification(title, body, triggerSeconds = 0) {
      const id = `mock-notification-${Date.now()}`;
      console.log(
        `[push:mock] scheduled "${title}" (${body}) in ${triggerSeconds}s [id=${id}]`
      );
      return id;
    },
  };
}
