import { Platform } from 'react-native';

import { createMockPushService } from './mockPushService';
import { createRealPushService, isPhysicalDevice } from './realPushService';
import type { PushService } from './types';

export * from './types';

/** Pure selection rule: real push only when opted in, on a native platform, on a physical device. */
export function shouldUseRealPush(input: { flag: string | undefined; os: string; isDevice: boolean }): boolean {
  return input.flag === 'true' && input.os !== 'web' && input.isDevice;
}

/**
 * Returns the push adapter for live-class "starting soon" alerts: the real Expo Notifications
 * adapter only when EXPO_PUBLIC_REAL_PUSH=true on a physical iOS/Android device; otherwise the mock.
 */
export function createPushService(): PushService {
  const flag = process.env.EXPO_PUBLIC_REAL_PUSH;
  // Only probe the device module when the flag is on (keeps it out of every other path).
  const isDevice = flag === 'true' && Platform.OS !== 'web' ? isPhysicalDevice() : false;
  return shouldUseRealPush({ flag, os: Platform.OS, isDevice })
    ? createRealPushService()
    : createMockPushService();
}
