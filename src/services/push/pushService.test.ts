import { Platform } from 'react-native';

import { createPushService, shouldUseRealPush } from './index';
import { MOCK_PUSH_TOKEN } from './mockPushService';

jest.mock('./realPushService', () => ({
  createRealPushService: () => ({
    isMock: false,
    registerForPushAsync: async () => null,
    registerForPushNotifications: async () => null,
    scheduleLocalNotification: async () => 'id',
  }),
  isPhysicalDevice: jest.fn(() => true),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { isPhysicalDevice } = require('./realPushService') as { isPhysicalDevice: jest.Mock };

describe('shouldUseRealPush matrix', () => {
  it.each([
    ['true', 'ios', true, true],
    ['true', 'android', true, true],
    ['true', 'web', true, false],
    ['true', 'ios', false, false],
    ['false', 'ios', true, false],
    [undefined, 'android', true, false],
  ])('flag=%s os=%s device=%s -> real=%s', (flag, os, isDevice, expected) => {
    expect(shouldUseRealPush({ flag, os, isDevice })).toBe(expected);
  });
});

describe('createPushService', () => {
  const originalFlag = process.env.EXPO_PUBLIC_REAL_PUSH;
  const originalOS = Platform.OS;
  afterEach(() => {
    if (originalFlag === undefined) delete process.env.EXPO_PUBLIC_REAL_PUSH;
    else process.env.EXPO_PUBLIC_REAL_PUSH = originalFlag;
    Platform.OS = originalOS;
    isPhysicalDevice.mockReturnValue(true);
  });

  it('uses the mock by default with a deterministic Expo-shaped token', async () => {
    delete process.env.EXPO_PUBLIC_REAL_PUSH;
    const service = createPushService();
    expect(service.isMock).toBe(true);
    expect(await service.registerForPushAsync()).toBe(MOCK_PUSH_TOKEN);
    expect(MOCK_PUSH_TOKEN).toMatch(/^ExponentPushToken\[.+\]$/);
  });

  it('selects the real adapter (isMock=false) with the flag on a native physical device', () => {
    process.env.EXPO_PUBLIC_REAL_PUSH = 'true';
    Platform.OS = 'android';
    expect(createPushService().isMock).toBe(false);
  });

  it('falls back to the mock on web or on a simulator even with the flag', () => {
    process.env.EXPO_PUBLIC_REAL_PUSH = 'true';
    Platform.OS = 'web';
    expect(createPushService().isMock).toBe(true);
    Platform.OS = 'ios';
    isPhysicalDevice.mockReturnValue(false);
    expect(createPushService().isMock).toBe(true);
  });
});
