import { act, renderHook } from '@testing-library/react-native';

import { supabase } from '../../services/supabase/client';
import { useGroupPresence } from './useGroupPresence';

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

const GROUP_ID = '77777777-7777-7777-7777-777777777777';
const JORDAN = 'u-jordan';

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

const render = () => renderHook(() => useGroupPresence(GROUP_ID, JORDAN));

describe('useGroupPresence', () => {
  it('subscribes to the group topic as a PRIVATE channel keyed by user id', async () => {
    await act(async () => {
      render();
    });

    expect(supabase.channel).toHaveBeenCalledWith(`group:${GROUP_ID}`, {
      config: { private: true, presence: { key: JORDAN } },
    });
  });

  it('tracks the user and reports who is online', async () => {
    const { result } = await act(async () => render());

    await act(async () => {
      created[0].emit('SUBSCRIBED');
    });
    expect(created[0].track).toHaveBeenCalledWith({ user_id: JORDAN });

    await act(async () => {
      created[0].sync({
        'u-jordan': [{ user_id: 'u-jordan' }],
        'u-sam': [{ user_id: 'u-sam' }],
      });
    });

    expect([...result.current].sort()).toEqual(['u-jordan', 'u-sam']);
  });

  // Realtime refuses a private topic the user is not entitled to with CHANNEL_ERROR. The roster
  // must degrade to "everyone Offline" rather than crashing.
  it.each(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'])(
    'reports nobody online (and never throws) on %s',
    async (status) => {
      const { result } = await act(async () => render());

      await act(async () => {
        created[0].emit(status);
      });

      expect(result.current.size).toBe(0);
      expect(created[0].track).not.toHaveBeenCalled();
    }
  );

  it('clears an already-populated online set when the channel later fails', async () => {
    const { result } = await act(async () => render());

    await act(async () => {
      created[0].emit('SUBSCRIBED');
      created[0].sync({ 'u-sam': [{ user_id: 'u-sam' }] });
    });
    expect(result.current.size).toBe(1);

    await act(async () => {
      created[0].emit('CHANNEL_ERROR');
    });

    expect(result.current.size).toBe(0);
  });

  it('removes a stale channel for the same topic before subscribing a new one', async () => {
    const stale = { topic: `realtime:group:${GROUP_ID}` };
    (supabase.getChannels as jest.Mock).mockReturnValue([stale]);

    await act(async () => {
      render();
    });

    expect(supabase.removeChannel).toHaveBeenCalledWith(stale);
  });

  it('removes the channel on unmount', async () => {
    const { unmount } = await act(async () => render());

    await act(async () => {
      unmount();
    });

    expect(supabase.removeChannel).toHaveBeenCalledWith(created[0]);
  });

  it('does not subscribe until the user id is known', async () => {
    await act(async () => {
      renderHook(() => useGroupPresence(GROUP_ID, null));
    });

    expect(supabase.channel).not.toHaveBeenCalled();
  });
});
