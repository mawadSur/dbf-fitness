import { PermissionsAndroid, Platform } from 'react-native';

import { AgoraJoinError, createAgoraVideoService } from './agoraVideoService';

type Handler = Record<string, (...args: unknown[]) => void>;

const mockAgora = { current: null as unknown };
jest.mock('./agoraModule', () => ({ loadAgoraModule: () => mockAgora.current }));

function setup(joinReturn: number | (() => number) = 0) {
  const state: { handler: Handler | null } = { handler: null };
  const engine = {
    initialize: jest.fn(),
    registerEventHandler: jest.fn((h: Handler) => {
      state.handler = h;
    }),
    enableAudio: jest.fn(),
    enableVideo: jest.fn(),
    startPreview: jest.fn(),
    joinChannel: jest.fn(() => (typeof joinReturn === 'function' ? joinReturn() : joinReturn)),
    leaveChannel: jest.fn(),
    release: jest.fn(),
    renewToken: jest.fn(),
    muteLocalAudioStream: jest.fn(),
    muteLocalVideoStream: jest.fn(),
  };
  mockAgora.current = {
    createAgoraRtcEngine: () => engine,
    ChannelProfileType: { ChannelProfileCommunication: 0 },
    ClientRoleType: { ClientRoleBroadcaster: 1 },
  };
  return { engine, state };
}

const tick = () => new Promise((r) => setImmediate(r));

describe('agoraVideoService join outcome', () => {
  const originalOS = Platform.OS;
  afterEach(() => {
    Platform.OS = originalOS;
    jest.restoreAllMocks();
  });

  it('rejects when joinChannel returns a negative code and tears down', async () => {
    Platform.OS = 'ios';
    const { engine } = setup(-2);
    const service = createAgoraVideoService('app')!;
    await expect(service.join('c', 'Jo', { token: 't', uid: 1 })).rejects.toMatchObject({ name: 'AgoraJoinError', code: 'join_failed' });
    expect(engine.leaveChannel).toHaveBeenCalled();
    expect(engine.release).toHaveBeenCalled();
  });

  it('rejects when Agora reports an error before joining', async () => {
    Platform.OS = 'ios';
    const { state } = setup();
    const service = createAgoraVideoService('app')!;
    const promise = service.join('c', 'Jo', { token: 'bad', uid: 1 });
    await tick();
    state.handler!.onError(110, 'invalid token');
    const error = await promise.catch((e: Error) => e);
    expect(error).toBeInstanceOf(AgoraJoinError);
    expect(error).toMatchObject({ code: 'invalid_credentials' });
    // Sanitized: no raw SDK code or diagnostic text reaches the public error.
    expect((error as Error).message).not.toMatch(/110|invalid token/);
  });

  it('rejects when the connection state becomes failed before joining', async () => {
    Platform.OS = 'ios';
    const { state } = setup();
    const service = createAgoraVideoService('app')!;
    const promise = service.join('c', 'Jo', { token: 'bad', uid: 1 });
    await tick();
    state.handler!.onConnectionStateChanged({}, 5, 8);
    await expect(promise).rejects.toMatchObject({ code: 'connection_failed' });
  });

  it('ignores non-fatal device errors before joining and still joins', async () => {
    Platform.OS = 'ios';
    const { state } = setup(() => {
      queueMicrotask(() => {
        state.handler!.onError(1501, 'camera busy');
        state.handler!.onJoinChannelSuccess();
      });
      return 0;
    });
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const service = createAgoraVideoService('app')!;
    await expect(service.join('c', 'Jo', { token: 't', uid: 1 })).resolves.toBeTruthy();
  });

  it('tears down and clears tiles on a post-join failure', async () => {
    Platform.OS = 'ios';
    const { state, engine } = setup(() => {
      queueMicrotask(() => state.handler!.onJoinChannelSuccess());
      return 0;
    });
    const service = createAgoraVideoService('app')!;
    const seen: number[] = [];
    service.onParticipantsChanged((p) => seen.push(p.length));
    await service.join('c', 'Jo', { token: 't', uid: 1, onConnectionFailed: jest.fn() });
    state.handler!.onConnectionStateChanged({}, 5, 9);
    expect(engine.release).toHaveBeenCalled();
    expect(seen[seen.length - 1]).toBe(0);
  });

  it('times out when Agora never confirms the join', async () => {
    Platform.OS = 'ios';
    setup();
    jest.useFakeTimers();
    const service = createAgoraVideoService('app')!;
    const promise = service.join('c', 'Jo', { token: 't', uid: 1 });
    const assertion = expect(promise).rejects.toMatchObject({ code: 'timeout' });
    await jest.advanceTimersByTimeAsync(21000);
    await assertion;
    jest.useRealTimers();
  });

  it('reports a post-join connection failure through onConnectionFailed', async () => {
    Platform.OS = 'ios';
    const { state } = setup(() => {
      queueMicrotask(() => state.handler!.onJoinChannelSuccess());
      return 0;
    });
    const service = createAgoraVideoService('app')!;
    const onConnectionFailed = jest.fn();
    await service.join('c', 'Jo', { token: 't', uid: 1, onConnectionFailed });
    state.handler!.onConnectionStateChanged({}, 5, 9);
    expect(onConnectionFailed).toHaveBeenCalledWith(expect.stringMatching(/connection failed/i));
  });
});

describe('agoraVideoService token renewal', () => {
  beforeEach(() => {
    Platform.OS = 'ios';
  });

  async function joined(refreshToken?: () => Promise<string | null>, onConnectionFailed?: (r: string) => void) {
    const ctx = setup(() => {
      queueMicrotask(() => ctx.state.handler!.onJoinChannelSuccess());
      return 0;
    });
    const service = createAgoraVideoService('app')!;
    await service.join('c', 'Jo', { token: 't', uid: 1, refreshToken, onConnectionFailed });
    return ctx;
  }

  it('renews the token with a fresh one when it is about to expire', async () => {
    const { engine, state } = await joined(async () => 'fresh');
    state.handler!.onTokenPrivilegeWillExpire({}, 't');
    await tick();
    expect(engine.renewToken).toHaveBeenCalledWith('fresh');
  });

  it('does not throw or renew when no refresh callback was supplied', async () => {
    const { engine, state } = await joined();
    expect(() => state.handler!.onTokenPrivilegeWillExpire({}, 't')).not.toThrow();
    expect(engine.renewToken).not.toHaveBeenCalled();
  });

  it('surfaces a failure when an expired token cannot be refreshed', async () => {
    const onConnectionFailed = jest.fn();
    const { state } = await joined(async () => null, onConnectionFailed);
    state.handler!.onRequestToken({});
    await tick();
    expect(onConnectionFailed).toHaveBeenCalledWith(expect.stringMatching(/expired/i));
  });
});

describe('agoraVideoService Android permissions', () => {
  const originalOS = Platform.OS;
  afterEach(() => {
    Platform.OS = originalOS;
    jest.restoreAllMocks();
  });

  it('requests camera + mic before joining and proceeds when granted', async () => {
    Platform.OS = 'android';
    const ctx = setup(() => {
      queueMicrotask(() => ctx.state.handler!.onJoinChannelSuccess());
      return 0;
    });
    const request = jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue({
      [PermissionsAndroid.PERMISSIONS.CAMERA]: 'granted',
      [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO]: 'granted',
    } as never);
    await createAgoraVideoService('app')!.join('c', 'Jo', { token: 't', uid: 1 });
    expect(request).toHaveBeenCalledWith([
      PermissionsAndroid.PERMISSIONS.CAMERA,
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    ]);
    expect(ctx.engine.joinChannel).toHaveBeenCalled();
  });

  it('refuses to join when a permission is denied', async () => {
    Platform.OS = 'android';
    const { engine } = setup();
    jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue({
      [PermissionsAndroid.PERMISSIONS.CAMERA]: 'granted',
      [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO]: 'denied',
    } as never);
    await expect(createAgoraVideoService('app')!.join('c', 'Jo')).rejects.toMatchObject({ code: 'permission_denied' });
    expect(engine.joinChannel).not.toHaveBeenCalled();
  });

  it('clears stale tiles and releases the old engine when a rejoin is denied permission', async () => {
    Platform.OS = 'android';
    const ctx = setup(() => {
      queueMicrotask(() => ctx.state.handler!.onJoinChannelSuccess());
      return 0;
    });
    const request = jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue({
      [PermissionsAndroid.PERMISSIONS.CAMERA]: 'granted',
      [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO]: 'granted',
    } as never);
    const service = createAgoraVideoService('app')!;
    const seen: number[] = [];
    service.onParticipantsChanged((p) => seen.push(p.length));
    await service.join('c', 'Jo', { token: 't', uid: 1 });
    expect(seen[seen.length - 1]).toBe(1);

    request.mockResolvedValue({
      [PermissionsAndroid.PERMISSIONS.CAMERA]: 'denied',
      [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO]: 'granted',
    } as never);
    await expect(service.join('c', 'Jo', { token: 't', uid: 1 })).rejects.toMatchObject({
      code: 'permission_denied',
    });
    expect(ctx.engine.release).toHaveBeenCalledTimes(1);
    expect(seen[seen.length - 1]).toBe(0);
    // A later mute toggle must not act on the dead call.
    await expect(service.toggleMute()).resolves.toBe(false);
    expect(ctx.engine.muteLocalAudioStream).not.toHaveBeenCalled();
  });

  it('does not request permissions on iOS', async () => {
    Platform.OS = 'ios';
    const ctx = setup(() => {
      queueMicrotask(() => ctx.state.handler!.onJoinChannelSuccess());
      return 0;
    });
    const request = jest.spyOn(PermissionsAndroid, 'requestMultiple');
    await createAgoraVideoService('app')!.join('c', 'Jo', { token: 't', uid: 1 });
    expect(request).not.toHaveBeenCalled();
  });
});
