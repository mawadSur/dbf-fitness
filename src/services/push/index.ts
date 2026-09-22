import { Platform } from 'react-native';

import { PUSH_DISABLED_NOTICE, shouldWarnPushDisabled } from '../../config/env';
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
/**
 * PRODUCTION GUARD (the visible half of the no-silent-mock rule).
 *
 * The mock push adapter is a no-op: it registers nobody and delivers nothing. That is correct
 * in dev and on web, but a release build that quietly uses it leaves a member believing their
 * "class starting soon" alert will arrive. Returns the notice a screen should show, or `null`
 * when reminders really are live (or when silence is expected: dev, web).
 */
export function pushDisabledNotice(): string | null {
  const input = {
    realPushFlag: process.env.EXPO_PUBLIC_REAL_PUSH,
    isDev: typeof __DEV__ !== 'undefined' && __DEV__,
    os: Platform.OS as string,
  };
  return shouldWarnPushDisabled(input) ? PUSH_DISABLED_NOTICE : null;
}

export function createPushService(): PushService {
  const flag = process.env.EXPO_PUBLIC_REAL_PUSH;
  // Only probe the device module when the flag is on (keeps it out of every other path).
  const isDevice = flag === 'true' && Platform.OS !== 'web' ? isPhysicalDevice() : false;
  return shouldUseRealPush({ flag, os: Platform.OS, isDevice })
    ? createRealPushService()
    : createMockPushService();
}
