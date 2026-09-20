import { supabase } from '../../services/supabase/client';
import {
  createLiveClass,
  fetchClassAttendees,
  fetchCurrentMember,
  fetchLiveClass,
  fetchUpcomingLiveClasses,
  recordJoin,
  recordLeave,
  updateLiveClassStatus,
  upsertPushToken,
} from './api';

type Call = [string, unknown[]];
type Recorder = { calls: Call[]; table: string };

const recorders: Recorder[] = [];
const results: Record<string, { data?: unknown; error?: unknown }> = {};

function chain(table: string) {
  const recorder: Recorder = { calls: [], table };
  recorders.push(recorder);
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
            Promise.resolve({ data: null, error: null, ...results[table] }).then(resolve, reject);
        }
        return (...args: unknown[]) => {
          recorder.calls.push([prop, args]);
          return proxy;
        };
      },
    }
  );
  return proxy;
}

jest.mock('../../services/supabase/client', () => ({
  supabase: { auth: { getSession: jest.fn() }, from: jest.fn() },
}));

const getSession = supabase.auth.getSession as unknown as jest.Mock;
const from = supabase.from as unknown as jest.Mock;

const callsFor = (table: string) => recorders.filter((r) => r.table === table).flatMap((r) => r.calls);
const COLUMNS = 'id, title, starts_at, status, agora_channel_name, coach_id';

beforeEach(() => {
  jest.clearAllMocks();
  recorders.length = 0;
  for (const key of Object.keys(results)) delete results[key];
  getSession.mockResolvedValue({ data: { session: { user: { id: 'me' } } } });
  from.mockImplementation((table: string) => chain(table));
});

describe('class reads', () => {
  it('upcoming = status in (scheduled, live), soonest first, exact columns', async () => {
    results.live_classes = { data: [{ id: 'c1' }] };
    await expect(fetchUpcomingLiveClasses()).resolves.toEqual([{ id: 'c1' }]);
    expect(callsFor('live_classes')).toEqual([
      ['select', [COLUMNS]],
      ['in', ['status', ['scheduled', 'live']]],
      ['order', ['starts_at', { ascending: true }]],
    ]);
  });

  it('upcoming: null data -> [] and errors are thrown', async () => {
    await expect(fetchUpcomingLiveClasses()).resolves.toEqual([]);
    results.live_classes = { error: new Error('rls') };
    await expect(fetchUpcomingLiveClasses()).rejects.toThrow('rls');
  });

  it('fetchLiveClass filters by id; malformed uuid (22P02) and missing row both -> null; other errors throw', async () => {
    results.live_classes = { data: { id: 'c1' } };
    await expect(fetchLiveClass('c1')).resolves.toEqual({ id: 'c1' });
    expect(callsFor('live_classes')).toEqual([
      ['select', [COLUMNS]],
      ['eq', ['id', 'c1']],
      ['maybeSingle', []],
    ]);
    results.live_classes = { error: { code: '22P02' } };
    await expect(fetchLiveClass('bad')).resolves.toBeNull();
    results.live_classes = { data: null };
    await expect(fetchLiveClass('c2')).resolves.toBeNull();
    results.live_classes = { error: { code: '42501' } };
    await expect(fetchLiveClass('c3')).rejects.toEqual({ code: '42501' });
  });
});

describe('fetchCurrentMember', () => {
  it('reads (id, full_name, role) of the SESSION user and maps to camelCase', async () => {
    results.profiles = { data: { id: 'me', full_name: 'Jo', role: 'member' } };
    await expect(fetchCurrentMember()).resolves.toEqual({ id: 'me', fullName: 'Jo', role: 'member' });
    expect(callsFor('profiles')).toEqual([
      ['select', ['id, full_name, role']],
      ['eq', ['id', 'me']],
      ['maybeSingle', []],
    ]);
  });

  it('null when signed out (no query) or no profile row', async () => {
    results.profiles = { data: null };
    await expect(fetchCurrentMember()).resolves.toBeNull();
    from.mockClear();
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(fetchCurrentMember()).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });
});

describe('participation writes', () => {
  it('upsertPushToken upserts {user_id, expo_push_token, platform} on the composite key', async () => {
    await upsertPushToken('u1', 'ExponentPushToken[x]');
    const [[method, [row, options]]] = callsFor('push_tokens');
    expect(method).toBe('upsert');
    expect(row).toEqual({ user_id: 'u1', expo_push_token: 'ExponentPushToken[x]', platform: expect.any(String) });
    expect(options).toEqual({ onConflict: 'user_id,expo_push_token' });
  });

  it('recordJoin upserts a fresh join (left_at cleared) on (live_class_id, member_id)', async () => {
    await recordJoin('c1', 'm1');
    const [[method, [row, options]]] = callsFor('live_class_participants');
    expect(method).toBe('upsert');
    expect(row).toEqual({ live_class_id: 'c1', member_id: 'm1', joined_at: expect.any(String), left_at: null });
    expect(options).toEqual({ onConflict: 'live_class_id,member_id' });
  });

  it('recordLeave stamps left_at scoped to BOTH class and member', async () => {
    await recordLeave('c1', 'm1');
    const calls = callsFor('live_class_participants');
    expect(calls[0][0]).toBe('update');
    expect(Object.keys(calls[0][1][0] as object)).toEqual(['left_at']);
    expect(calls.slice(1)).toEqual([
      ['eq', ['live_class_id', 'c1']],
      ['eq', ['member_id', 'm1']],
    ]);
  });

  it.each([
    ['upsertPushToken', () => upsertPushToken('u', 't')],
    ['recordJoin', () => recordJoin('c', 'm')],
    ['recordLeave', () => recordLeave('c', 'm')],
  ])('%s throws the database error (an RLS refusal must surface, not be swallowed)', async (_n, run) => {
    results.push_tokens = { error: new Error('denied') };
    results.live_class_participants = { error: new Error('denied') };
    await expect(run()).rejects.toThrow('denied');
  });
});

describe('createLiveClass', () => {
  const START = new Date('2026-10-01T09:00:00.000Z');

  it('inserts status scheduled with ISO start and a dbf-<coach8>-<token> channel, then reads the columns back', async () => {
    results.live_classes = { data: { id: 'c1' } };
    await expect(createLiveClass({ coachId: '11111111-2222-3333-4444-555555555555', title: 'HIIT', startsAt: START })).resolves.toEqual({ id: 'c1' });
    const [[method, [row]], select, single] = callsFor('live_classes');
    expect(method).toBe('insert');
    expect(row).toEqual({
      coach_id: '11111111-2222-3333-4444-555555555555',
      title: 'HIIT',
      starts_at: '2026-10-01T09:00:00.000Z',
      status: 'scheduled',
      agora_channel_name: expect.stringMatching(/^dbf-11111111-[a-z0-9]{8}$/),
    });
    expect(select).toEqual(['select', [COLUMNS]]);
    expect(single).toEqual(['single', []]);
  });

  it('retries a channel-name collision (23505) up to 3 attempts with a NEW channel name, then throws the last error', async () => {
    results.live_classes = { error: { code: '23505' } };
    await expect(createLiveClass({ coachId: 'c', title: 't', startsAt: START })).rejects.toEqual({ code: '23505' });
    const inserts = callsFor('live_classes').filter(([m]) => m === 'insert');
    expect(inserts).toHaveLength(3);
    const names = inserts.map(([, [row]]) => (row as { agora_channel_name: string }).agora_channel_name);
    expect(new Set(names).size).toBe(3);
  });

  it('a non-unique error is thrown immediately without retrying', async () => {
    results.live_classes = { error: { code: '42501' } };
    await expect(createLiveClass({ coachId: 'c', title: 't', startsAt: START })).rejects.toEqual({ code: '42501' });
    expect(callsFor('live_classes').filter(([m]) => m === 'insert')).toHaveLength(1);
  });
});

describe('updateLiveClassStatus', () => {
  it('updates only status, for that id, and asks for the row back', async () => {
    results.live_classes = { data: [{ id: 'c1' }] };
    await updateLiveClassStatus('c1', 'live');
    expect(callsFor('live_classes')).toEqual([
      ['update', [{ status: 'live' }]],
      ['eq', ['id', 'c1']],
      ['select', ['id']],
    ]);
  });

  it('zero rows updated (RLS filtered it) is an error, not a silent success', async () => {
    results.live_classes = { data: [] };
    await expect(updateLiveClassStatus('c1', 'ended')).rejects.toThrow('Could not update this class.');
    results.live_classes = { data: null };
    await expect(updateLiveClassStatus('c1', 'ended')).rejects.toThrow('Could not update this class.');
    results.live_classes = { error: new Error('db') };
    await expect(updateLiveClassStatus('c1', 'ended')).rejects.toThrow('db');
  });
});

describe('fetchClassAttendees', () => {
  it('joins participants with profile names, ordered by join time, defaulting a missing name to Member', async () => {
    results.live_class_participants = {
      data: [
        { member_id: 'a', joined_at: 'j1', left_at: null },
        { member_id: 'b', joined_at: 'j2', left_at: 'l2' },
      ],
    };
    results.profiles = { data: [{ id: 'a', full_name: 'Ann' }] };
    await expect(fetchClassAttendees('c1')).resolves.toEqual([
      { memberId: 'a', fullName: 'Ann', joinedAt: 'j1', leftAt: null },
      { memberId: 'b', fullName: 'Member', joinedAt: 'j2', leftAt: 'l2' },
    ]);
    expect(callsFor('live_class_participants')).toEqual([
      ['select', ['member_id, joined_at, left_at']],
      ['eq', ['live_class_id', 'c1']],
      ['order', ['joined_at', { ascending: true }]],
    ]);
    expect(callsFor('profiles')).toEqual([
      ['select', ['id, full_name']],
      ['in', ['id', ['a', 'b']]],
    ]);
  });

  it('no participants -> [] without querying profiles; errors from either query throw', async () => {
    results.live_class_participants = { data: [] };
    await expect(fetchClassAttendees('c1')).resolves.toEqual([]);
    expect(from).not.toHaveBeenCalledWith('profiles');
    results.live_class_participants = { data: [{ member_id: 'a', joined_at: null, left_at: null }] };
    results.profiles = { error: new Error('p') };
    await expect(fetchClassAttendees('c1')).rejects.toThrow('p');
    results.live_class_participants = { error: new Error('q') };
    await expect(fetchClassAttendees('c1')).rejects.toThrow('q');
  });
});

describe('privileged columns', () => {
  it('no participation/push/status write sends role or coach_id, and profiles is never written', async () => {
    results.live_classes = { data: [{ id: 'c1' }] };
    await upsertPushToken('u', 't');
    await recordJoin('c', 'm');
    await recordLeave('c', 'm');
    await updateLiveClassStatus('c1', 'live');
    const writes = recorders.flatMap((r) => r.calls.filter(([m]) => ['insert', 'update', 'upsert', 'delete'].includes(m)).map(([, a]) => ({ table: r.table, payload: a[0] as Record<string, unknown> | undefined })));
    expect(writes).toHaveLength(4);
    for (const { payload } of writes) {
      expect(payload).not.toHaveProperty('role');
      expect(payload).not.toHaveProperty('coach_id');
    }
    expect(writes.some((w) => w.table === 'profiles')).toBe(false);
  });

  it('createLiveClass writes coach_id only as the caller-supplied owner and never role', async () => {
    results.live_classes = { data: { id: 'c1' } };
    await createLiveClass({ coachId: 'me', title: 't', startsAt: new Date(0) });
    const [, [row]] = callsFor('live_classes')[0];
    expect(row).not.toHaveProperty('role');
    expect((row as { coach_id: string }).coach_id).toBe('me');
  });
});
