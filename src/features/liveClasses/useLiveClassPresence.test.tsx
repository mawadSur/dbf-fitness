import { act, renderHook } from '@testing-library/react-native';

import { supabase } from '../../services/supabase/client';
import { useLiveClassPresence } from './useLiveClassPresence';

jest.mock('../../services/supabase/client', () => ({
  supabase: {
    channel: jest.fn(),
    getChannels: jest.fn(() => []),
    removeChannel: jest.fn().mockResolvedValue('ok'),
  },
}));

type SubscribeCallback = (status: string, error?: Error) => void;

/** Minimal stand-in for a supabase-js RealtimeChannel, driven by the test. */
function fakeChannel(topic: string, config: unknown) {
  let syncHandler: (() => void) | undefined;
  let subscribeCallback: SubscribeCallback | undefined;
  let state: Record<string, unknown[]> = {};

  const channel = {
    topic: `realtime:${topic}`,
    config,
    on(type: string, filter: { event: string }, handler: () => void) {
      if (type === 'presence' && filter.event === 'sync') syncHandler = handler;
      return channel;
    },
    subscribe(callback: SubscribeCallback) {
      subscribeCallback = callback;
      return channel;
    },
    track: jest.fn().mockResolvedValue('ok'),
    presenceState: () => state,
    // test drivers
    emit: (status: string) => subscribeCallback?.(status),
    sync: (next: Record<string, unknown[]>) => {
      state = next;
      syncHandler?.();
    },
  };
  return channel;
}

const CLASS_ID = '88888888-8888-8888-8888-888888888888';
const JORDAN = { id: 'u-jordan', fullName: 'Jordan Lee' };

let created: ReturnType<typeof fakeChannel>[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  created = [];
  (supabase.getChannels as jest.Mock).mockReturnValue([]);
  (supabase.removeChannel as jest.Mock).mockResolvedValue('ok');
  (supabase.channel as jest.Mock).mockImplementation((topic: string, config: unknown) => {
    const channel = fakeChannel(topic, config);
    created.push(channel);
    return channel;
  });
});

const render = () => renderHook(() => useLiveClassPresence(CLASS_ID, JORDAN, true));

describe('useLiveClassPresence', () => {
  it('subscribes to the class topic as a PRIVATE channel keyed by user id', async () => {
    await act(async () => {
      render();
    });

    expect(supabase.channel).toHaveBeenCalledWith(`live:${CLASS_ID}`, {
      config: { private: true, presence: { key: JORDAN.id } },
    });
  });

  it('tracks the user and lists everyone present once subscribed', async () => {
    const { result } = await act(async () => render());

    await act(async () => {
      created[0].emit('SUBSCRIBED');
    });
    expect(created[0].track).toHaveBeenCalledWith({ user_id: JORDAN.id, full_name: JORDAN.fullName });

    await act(async () => {
      created[0].sync({
        'u-jordan': [{ user_id: 'u-jordan', full_name: 'Jordan Lee' }],
        'u-sam': [{ user_id: 'u-sam', full_name: 'Sam Rivera' }],
      });
    });

    expect(result.current.unavailable).toBe(false);
    expect(result.current.participants).toEqual([
      { userId: 'u-jordan', fullName: 'Jordan Lee' },
      { userId: 'u-sam', fullName: 'Sam Rivera' },
    ]);
  });

  // Realtime refuses a private topic the user is not entitled to with CHANNEL_ERROR. The screen
  // must stay usable, so the hook reports `unavailable` instead of throwing or claiming the class
  // is empty.
  it.each(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'])(
    'reports the list as unavailable (and never throws) on %s',
    async (status) => {
      const { result } = await act(async () => render());

      await act(async () => {
        created[0].emit(status);
      });

      expect(result.current.unavailable).toBe(true);
      expect(result.current.participants).toEqual([]);
      expect(created[0].track).not.toHaveBeenCalled();
    }
  );

  it('drops an already-populated list when the channel later fails', async () => {
    const { result } = await act(async () => render());

    await act(async () => {
      created[0].emit('SUBSCRIBED');
      created[0].sync({ 'u-sam': [{ user_id: 'u-sam', full_name: 'Sam Rivera' }] });
    });
    expect(result.current.participants).toHaveLength(1);

    await act(async () => {
      created[0].emit('CHANNEL_ERROR');
    });

    expect(result.current.participants).toEqual([]);
    expect(result.current.unavailable).toBe(true);
  });

  it('removes a stale channel for the same topic before subscribing a new one', async () => {
    const stale = { topic: `realtime:live:${CLASS_ID}` };
    (supabase.getChannels as jest.Mock).mockReturnValue([stale]);

    await act(async () => {
      render();
    });

    expect(supabase.removeChannel).toHaveBeenCalledWith(stale);
    expect(supabase.channel).toHaveBeenCalled();
  });

  it('removes the channel on unmount', async () => {
    const { unmount } = await act(async () => render());

    await act(async () => {
      unmount();
    });

    expect(supabase.removeChannel).toHaveBeenCalledWith(created[0]);
  });

  it('does not subscribe at all while disabled', async () => {
    await act(async () => {
      renderHook(() => useLiveClassPresence(CLASS_ID, JORDAN, false));
    });

    expect(supabase.channel).not.toHaveBeenCalled();
  });
});
