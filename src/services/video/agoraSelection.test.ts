import { Platform } from 'react-native';

import { createVideoService, shouldUseAgora } from './index';
import { resetAgoraModuleCache } from './agoraModule';

describe('shouldUseAgora matrix', () => {
  it.each([
    ['app', 'ios', true],
    ['app', 'android', true],
    ['app', 'web', false],
    [undefined, 'ios', false],
    ['', 'android', false],
  ])('appId=%s os=%s -> %s', (appId, os, expected) => {
    expect(shouldUseAgora({ appId, os })).toBe(expected);
  });
});

describe('createVideoService', () => {
  const originalId = process.env.EXPO_PUBLIC_AGORA_APP_ID;
  const originalOS = Platform.OS;
  afterEach(() => {
    if (originalId === undefined) delete process.env.EXPO_PUBLIC_AGORA_APP_ID;
    else process.env.EXPO_PUBLIC_AGORA_APP_ID = originalId;
    Platform.OS = originalOS;
    resetAgoraModuleCache();
    jest.resetModules();
  });

  it('uses the mock (placeholder tile) when no app id is set', async () => {
    delete process.env.EXPO_PUBLIC_AGORA_APP_ID;
    const session = await createVideoService().join('c', 'Jo');
    expect(session.participants[0].placeholderLabel).toBe('Camera preview (mock)');
  });

  it('uses the mock on web even with an app id', async () => {
    process.env.EXPO_PUBLIC_AGORA_APP_ID = 'app';
    Platform.OS = 'web';
    const session = await createVideoService().join('c', 'Jo');
    expect(session.participants[0].placeholderLabel).toBe('Camera preview (mock)');
  });

  it('falls back to the mock and warns once when the native module is unavailable', async () => {
    process.env.EXPO_PUBLIC_AGORA_APP_ID = 'app';
    Platform.OS = 'android';
    jest.doMock('react-native-agora', () => {
      throw new Error('native module missing');
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const first = await createVideoService().join('c', 'Jo');
    await createVideoService().join('c', 'Jo');
    expect(first.participants[0].placeholderLabel).toBe('Camera preview (mock)');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
    jest.dontMock('react-native-agora');
  });

  it('selects the real Agora adapter when the module is available on native', async () => {
    process.env.EXPO_PUBLIC_AGORA_APP_ID = 'app';
    Platform.OS = 'ios';
    const handlerRef: { current: any } = { current: null };
    const engine = {
      initialize: jest.fn(),
      registerEventHandler: jest.fn((h) => {
        handlerRef.current = h;
      }),
      enableAudio: jest.fn(),
      enableVideo: jest.fn(),
      startPreview: jest.fn(),
      joinChannel: jest.fn(() => {
        handlerRef.current?.onJoinChannelSuccess?.();
        return 0;
      }),
      leaveChannel: jest.fn(),
      release: jest.fn(),
      muteLocalAudioStream: jest.fn(),
      muteLocalVideoStream: jest.fn(),
    };
    jest.doMock('react-native-agora', () => ({
      createAgoraRtcEngine: () => engine,
      ChannelProfileType: { ChannelProfileCommunication: 0 },
      ClientRoleType: { ClientRoleBroadcaster: 1 },
    }));
    const service = createVideoService();
    const session = await service.join('room', 'Jo', { appId: 'x', token: 'tok', uid: 42 });
    expect(session.participants[0].placeholderLabel).toBeUndefined();
    expect(engine.initialize).toHaveBeenCalledWith(expect.objectContaining({ appId: 'x' }));
    expect(engine.joinChannel).toHaveBeenCalledWith('tok', 'room', 42, expect.any(Object));
    expect(await service.toggleMute()).toBe(true);
    expect(engine.muteLocalAudioStream).toHaveBeenCalledWith(true);
    await service.leave();
    expect(engine.release).toHaveBeenCalled();
    jest.dontMock('react-native-agora');
  });
});
