import { Platform } from 'react-native';

import { PUSH_DISABLED_NOTICE } from '../../config/env';
import { pushDisabledNotice } from './index';

const OLD_FLAG = process.env.EXPO_PUBLIC_REAL_PUSH;
const OLD_OS = Platform.OS;
const globals = globalThis as unknown as { __DEV__: boolean };
const OLD_DEV = globals.__DEV__;

afterEach(() => {
  if (OLD_FLAG === undefined) delete process.env.EXPO_PUBLIC_REAL_PUSH;
  else process.env.EXPO_PUBLIC_REAL_PUSH = OLD_FLAG;
  Platform.OS = OLD_OS;
  globals.__DEV__ = OLD_DEV;
});

describe('pushDisabledNotice', () => {
  it('warns in a release build on a phone with push turned off', () => {
    delete process.env.EXPO_PUBLIC_REAL_PUSH;
    Platform.OS = 'ios';
    globals.__DEV__ = false;

    expect(pushDisabledNotice()).toBe(PUSH_DISABLED_NOTICE);
  });

  it('says nothing when real push is on', () => {
    process.env.EXPO_PUBLIC_REAL_PUSH = 'true';
    Platform.OS = 'android';
    globals.__DEV__ = false;

    expect(pushDisabledNotice()).toBeNull();
  });

  it('says nothing in dev or on web, where the no-op adapter is expected', () => {
    delete process.env.EXPO_PUBLIC_REAL_PUSH;
    Platform.OS = 'android';
    globals.__DEV__ = true;
    expect(pushDisabledNotice()).toBeNull();

    globals.__DEV__ = false;
    Platform.OS = 'web';
    expect(pushDisabledNotice()).toBeNull();
  });
});
