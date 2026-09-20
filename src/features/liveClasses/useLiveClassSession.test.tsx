import { act, renderHook } from '@testing-library/react-native';

import { fetchRtcCredentials, RtcCredentialsError } from '../../services/video/credentials';
import { recordJoin, recordLeave } from './api';
import { CONNECTION_LOST_COPY } from './joinErrors';
import { useLiveClassSession } from './useLiveClassSession';

jest.mock('./api', () => ({
  recordJoin: jest.fn().mockResolvedValue(undefined),
  recordLeave: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/supabase/client', () => ({ supabase: {} }));
jest.mock('../../services/video/credentials', () => ({
  ...jest.requireActual('../../services/video/credentials'),
  fetchRtcCredentials: jest.fn(),
}));

const videoOverride: { current: unknown } = { current: null };
jest.mock('../../services/video', () => {
  const actual = jest.requireActual('../../services/video');
  return { ...actual, createVideoService: () => videoOverride.current ?? actual.createVideoService() };
});

const CLASS_ID = '88888888-8888-8888-8888-888888888888';
const CHANNEL = 'dbf-demo-saturday-conditioning';
const MEMBER = { id: 'u-jordan', fullName: 'Jordan Lee' };

// Lets the queued attendance writes (a promise chain) run.
const flush = () => act(async () => {});

describe('useLiveClassSession (mock video adapter)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetchRtcCredentials as jest.Mock).mockResolvedValue({
      mode: 'mock',
      app_id: null,
      channel: CHANNEL,
      uid: 7,
      token: null,
      expires_at: null,
      subscription: { state: 'active', days_overdue: 0, grace_days_left: 0 },
    });
  });

  const GRACE = { state: 'grace', days_overdue: 3, grace_days_left: 7 };
  const graceCredentials = () => ({
    mode: 'mock', app_id: null, channel: CHANNEL, uid: 7, token: null, expires_at: null, subscription: GRACE,
  });

  it('asks the server for credentials before joining and exposes the subscription it reports', async () => {
    const { result } = await renderHook(() => useLiveClassSession(CLASS_ID, CHANNEL, MEMBER));
    await act(async () => {
      await result.current.join();
    });
    expect(fetchRtcCredentials).toHaveBeenCalledWith(CLASS_ID);
    expect(result.current.phase).toBe('joined');
    expect(result.current.graceNotice).toBeNull();
    expect(result.current.joinSubscription).toEqual({ state: 'active', days_overdue: 0, grace_days_left: 0 });
  });

  it('holds the join and surfaces the server-reported grace notice until it is acknowledged', async () => {
    (fetchRtcCredentials as jest.Mock).mockResolvedValue(graceCredentials());
    const { result } = await renderHook(() => useLiveClassSession(CLASS_ID, CHANNEL, MEMBER));
    await act(async () => {
      await result.current.join();
    });
    await flush();
    expect(result.current.phase).toBe('idle');
    expect(result.current.graceNotice).toEqual(GRACE);
    expect(result.current.joinSubscription).toEqual(GRACE);
    expect(recordJoin).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.join({ graceAcknowledged: true });
    });
    await flush();
    expect(result.current.phase).toBe('joined');
    expect(result.current.graceNotice).toBeNull();
    expect(result.current.joinSubscription).toEqual(GRACE);
    expect(recordJoin).toHaveBeenCalledTimes(1);
  });

  it.each(['subscription_required', 'not_entitled', 'class_not_joinable', 'unauthorized'] as const)(
    'stays out of the call and records the %s denial without attendance',
    async (code) => {
      (fetchRtcCredentials as jest.Mock).mockRejectedValue(new RtcCredentialsError(code));
      const { result } = await renderHook(() => useLiveClassSession(CLASS_ID, CHANNEL, MEMBER));
      await act(async () => {
        await result.current.join();
      });
      await flush();
      expect(result.current.phase).toBe('idle');
      expect(result.current.denial).toBe(code);
      expect(result.current.error).toBeNull();
      expect(recordJoin).not.toHaveBeenCalled();

      // A later retry is allowed and clears the denial once it works.
      (fetchRtcCredentials as jest.Mock).mockResolvedValue({
        mode: 'mock', app_id: null, channel: CHANNEL, uid: 1, token: null, expires_at: null,
        subscription: { state: 'active', days_overdue: 0, grace_days_left: 0 },
      });
      await act(async () => {
        await result.current.join();
      });
      expect(result.current.phase).toBe('joined');
      expect(result.current.denial).toBeNull();
    }
  );

  it('reports a retryable network error without a denial', async () => {
    (fetchRtcCredentials as jest.Mock).mockRejectedValue(new RtcCredentialsError('unknown', 'boom'));
    const { result } = await renderHook(() => useLiveClassSession(CLASS_ID, CHANNEL, MEMBER));
    await act(async () => {
      await result.current.join();
    });
    expect(result.current.phase).toBe('idle');
    expect(result.current.denial).toBeNull();
    expect(result.current.error).toMatch(/Could not reach the server/);
  });

  it('joins once, shows the labelled local placeholder tile, and records attendance', async () => {
    const { result } = await renderHook(() => useLiveClassSession(CLASS_ID, CHANNEL, MEMBER));
    expect(result.current.phase).toBe('idle');

    await act(async () => {
      await result.current.join();
    });
    await flush();

    expect(result.current.phase).toBe('joined');
    expect(result.current.tiles).toHaveLength(1);
    expect(result.current.tiles[0]).toMatchObject({
      displayName: 'Jordan Lee',
      isLocal: true,
      placeholderLabel: 'Camera preview (mock)',
    });
    expect(recordJoin).toHaveBeenCalledTimes(1);
    expect(recordJoin).toHaveBeenCalledWith(CLASS_ID, MEMBER.id);
  });

  it('does not double-join when join is triggered twice in the same tick', async () => {
    const { result } = await renderHook(() => useLiveClassSession(CLASS_ID, CHANNEL, MEMBER));

    await act(async () => {
      await Promise.all([result.current.join(), result.current.join()]);
    });
    await flush();

    expect(recordJoin).toHaveBeenCalledTimes(1);
  });

  it('does nothing until the channel and member are known', async () => {
    const { result } = await renderHook(() => useLiveClassSession(CLASS_ID, null, MEMBER));

    await act(async () => {
      await result.current.join();
    });

    expect(result.current.phase).toBe('idle');
    expect(recordJoin).not.toHaveBeenCalled();
  });

  it('leaves: clears the tiles and stamps left_at after the join was recorded', async () => {
    const { result } = await renderHook(() => useLiveClassSession(CLASS_ID, CHANNEL, MEMBER));
    await act(async () => {
      await result.current.join();
    });
    await act(async () => {
      await result.current.leave();
    });
    await flush();

    expect(result.current.phase).toBe('idle');
    expect(result.current.tiles).toEqual([]);
    expect(recordLeave).toHaveBeenCalledTimes(1);
    expect(recordLeave).toHaveBeenCalledWith(CLASS_ID, MEMBER.id);
    expect((recordJoin as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (recordLeave as jest.Mock).mock.invocationCallOrder[0]
    );
  });

  it('stamps left_at when the screen unmounts while still in the class', async () => {
    const { result, unmount } = await renderHook(() => useLiveClassSession(CLASS_ID, CHANNEL, MEMBER));
    await act(async () => {
      await result.current.join();
    });

    await unmount();
    await flush();

    expect(recordLeave).toHaveBeenCalledTimes(1);
  });

  it('records nothing on unmount if the user never joined, or already left', async () => {
    const never = await renderHook(() => useLiveClassSession(CLASS_ID, CHANNEL, MEMBER));
    await never.unmount();

    const left = await renderHook(() => useLiveClassSession(CLASS_ID, CHANNEL, MEMBER));
    await act(async () => {
      await left.result.current.join();
    });
    await act(async () => {
      await left.result.current.leave();
    });
    (recordLeave as jest.Mock).mockClear();
    await left.unmount();
    await flush();

    expect(recordLeave).not.toHaveBeenCalled();
  });
});

describe('useLiveClassSession live-mode credentials', () => {
  it('hands the adapter refreshToken and onConnectionFailed, and surfaces a post-join failure', async () => {
    const join = jest.fn().mockResolvedValue({ channelName: 'c', participants: [] });
    const fake = {
      join,
      leave: jest.fn().mockResolvedValue(undefined),
      toggleMute: jest.fn(),
      toggleCamera: jest.fn(),
      onParticipantsChanged: jest.fn(() => () => undefined),
    };
    videoOverride.current = fake;
    const creds = { fetchRtcCredentials };
    (creds.fetchRtcCredentials as jest.Mock).mockResolvedValue({
      mode: 'live', app_id: 'app', channel: CHANNEL, uid: 9, token: 'tok1', expires_at: null,
      subscription: { state: 'active', days_overdue: 0, grace_days_left: 0 },
    });
    const { result } = await renderHook(() => useLiveClassSession(CLASS_ID, CHANNEL, MEMBER));
    await act(async () => {
      await result.current.join();
    });
    const rtc = join.mock.calls[0][2];
    expect(typeof rtc.refreshToken).toBe('function');
    expect(typeof rtc.onConnectionFailed).toBe('function');

    (creds.fetchRtcCredentials as jest.Mock).mockResolvedValue({ token: 'tok2', channel: CHANNEL });
    await expect(rtc.refreshToken()).resolves.toBe('tok2');

    expect(result.current.phase).toBe('joined');
    await act(async () => {
      rtc.onConnectionFailed('Agora connection failed (reason 9)');
    });
    expect(result.current.phase).toBe('idle');
    expect(result.current.error).toBe(CONNECTION_LOST_COPY);
    // Raw Agora diagnostics never reach the member.
    expect(result.current.error).not.toMatch(/Agora|reason 9/);
    videoOverride.current = null;
  });
});
