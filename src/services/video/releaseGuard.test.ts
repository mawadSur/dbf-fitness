import { Platform } from 'react-native';

import { VIDEO_UNAVAILABLE_TITLE } from '../../config/env';
import { MOCK_PLACEHOLDER_LABEL } from './mockVideoService';
import { createVideoService, resetVideoServiceWarnings } from './index';

/**
 * The release-build guard: no Agora app id on a phone must NOT look like a working call.
 * `__DEV__` is true under Jest, so each release case redefines it for the duration of the test.
 */
const OLD_ID = process.env.EXPO_PUBLIC_AGORA_APP_ID;
const OLD_OS = Platform.OS;
const globals = globalThis as unknown as { __DEV__: boolean };
const OLD_DEV = globals.__DEV__;

afterEach(() => {
  if (OLD_ID === undefined) delete process.env.EXPO_PUBLIC_AGORA_APP_ID;
  else process.env.EXPO_PUBLIC_AGORA_APP_ID = OLD_ID;
  Platform.OS = OLD_OS;
  globals.__DEV__ = OLD_DEV;
  resetVideoServiceWarnings();
  jest.restoreAllMocks();
});

async function localTileLabel() {
  const session = await createVideoService().join('channel', 'Jordan');
  return session.participants[0].placeholderLabel;
}

describe('release build without an Agora app id', () => {
  it.each(['ios', 'android'] as const)('%s: the tile says live video is unavailable', async (os) => {
    delete process.env.EXPO_PUBLIC_AGORA_APP_ID;
    Platform.OS = os;
    globals.__DEV__ = false;
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(await localTileLabel()).toBe(VIDEO_UNAVAILABLE_TITLE);
  });

  it('warns once, not on every join', async () => {
    delete process.env.EXPO_PUBLIC_AGORA_APP_ID;
    Platform.OS = 'ios';
    globals.__DEV__ = false;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    createVideoService();
    createVideoService();

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('a placeholder app id counts as no app id', async () => {
    process.env.EXPO_PUBLIC_AGORA_APP_ID = 'REPLACE_WITH_AGORA_APP_ID';
    Platform.OS = 'android';
    globals.__DEV__ = false;
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(await localTileLabel()).toBe(VIDEO_UNAVAILABLE_TITLE);
  });
});

describe('cases the guard must leave alone', () => {
  it('dev on a phone keeps the mock preview', async () => {
    delete process.env.EXPO_PUBLIC_AGORA_APP_ID;
    Platform.OS = 'ios';
    globals.__DEV__ = true;

    expect(await localTileLabel()).toBe(MOCK_PLACEHOLDER_LABEL);
  });

  it('web keeps the mock preview even in a release build', async () => {
    delete process.env.EXPO_PUBLIC_AGORA_APP_ID;
    Platform.OS = 'web';
    globals.__DEV__ = false;

    expect(await localTileLabel()).toBe(MOCK_PLACEHOLDER_LABEL);
  });
});
