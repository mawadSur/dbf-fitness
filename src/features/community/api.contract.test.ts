import { supabase } from '../../services/supabase/client';
import { blockUser, fetchGroups, fetchRoster, joinGroup, leaveGroup, reportUser } from './api';

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
  supabase: { auth: { getSession: jest.fn() }, from: jest.fn(), rpc: jest.fn() },
}));

const getSession = supabase.auth.getSession as unknown as jest.Mock;
const from = supabase.from as unknown as jest.Mock;
const rpc = supabase.rpc as unknown as jest.Mock;

const callsFor = (table: string) => recorders.filter((r) => r.table === table).flatMap((r) => r.calls);
const PRIVILEGED = ['role', 'coach_id'];

beforeEach(() => {
  jest.clearAllMocks();
  recorders.length = 0;
  for (const key of Object.keys(results)) delete results[key];
  getSession.mockResolvedValue({ data: { session: { user: { id: 'me' } } } });
  from.mockImplementation((table: string) => chain(table));
  rpc.mockResolvedValue({ data: null, error: null });
});

describe('fetchGroups', () => {
  it('reads groups(id,name,description) ordered by name and only MY group_members rows', async () => {
    results.groups = { data: [{ id: 'g1', name: 'A', description: null }] };
    results.group_members = { data: [{ group_id: 'g1' }] };

    await expect(fetchGroups()).resolves.toEqual({
      groups: [{ id: 'g1', name: 'A', description: null }],
      memberGroupIds: ['g1'],
    });
    expect(callsFor('groups')).toEqual([
      ['select', ['id, name, description']],
      ['order', ['name']],
    ]);
    expect(callsFor('group_members')).toEqual([
      ['select', ['group_id']],
      ['eq', ['member_id', 'me']],
    ]);
  });

  it('signed out: returns empty and never queries', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(fetchGroups()).resolves.toEqual({ groups: [], memberGroupIds: [] });
    expect(from).not.toHaveBeenCalled();
  });

  it('propagates a query error from either table', async () => {
    results.group_members = { error: { message: 'boom' } };
    await expect(fetchGroups()).rejects.toEqual({ message: 'boom' });
  });
});

describe('fetchRoster', () => {
  it('calls rpc get_group_roster with p_group_id and tolerates a null payload', async () => {
    await expect(fetchRoster('g1')).resolves.toEqual([]);
    expect(rpc).toHaveBeenCalledWith('get_group_roster', { p_group_id: 'g1' });
  });

  it('throws the rpc error', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('nope') });
    await expect(fetchRoster('g1')).rejects.toThrow('nope');
  });
});

describe('writes use the session id and never a privileged column', () => {
  it('joinGroup inserts exactly {group_id, member_id}', async () => {
    await joinGroup('g1');
    expect(callsFor('group_members')).toEqual([['insert', [{ group_id: 'g1', member_id: 'me' }]]]);
  });

  it('joinGroup treats a unique violation (double tap) as success but rethrows anything else', async () => {
    results.group_members = { error: { code: '23505' } };
    await expect(joinGroup('g1')).resolves.toBeUndefined();
    results.group_members = { error: { code: '42501' } };
    await expect(joinGroup('g1')).rejects.toEqual({ code: '42501' });
  });

  it('leaveGroup deletes scoped by BOTH group_id and my member_id', async () => {
    await leaveGroup('g1');
    expect(callsFor('group_members')).toEqual([
      ['delete', []],
      ['eq', ['group_id', 'g1']],
      ['eq', ['member_id', 'me']],
    ]);
  });

  it('blockUser inserts {blocker_id: me, blocked_id}; unique violation is success', async () => {
    results.user_blocks = { error: { code: '23505' } };
    await expect(blockUser('u2')).resolves.toBeUndefined();
    expect(callsFor('user_blocks')).toEqual([['insert', [{ blocker_id: 'me', blocked_id: 'u2' }]]]);
  });

  it('reportUser inserts reporter/reported/reason and surfaces errors (no unique swallow)', async () => {
    await reportUser('u2', 'spam');
    expect(callsFor('moderation_reports')).toEqual([
      ['insert', [{ reporter_id: 'me', reported_user_id: 'u2', reason: 'spam' }]],
    ]);
    results.moderation_reports = { error: { code: '23505' } };
    await expect(reportUser('u2', 'spam')).rejects.toEqual({ code: '23505' });
  });

  it.each([
    ['joinGroup', () => joinGroup('g1')],
    ['leaveGroup', () => leaveGroup('g1')],
    ['blockUser', () => blockUser('u2')],
    ['reportUser', () => reportUser('u2', 'spam')],
  ])('%s refuses when signed out and sends nothing', async (_name, run) => {
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(run()).rejects.toThrow('You need to be signed in.');
    expect(from).not.toHaveBeenCalled();
  });

  it('no write payload contains role or coach_id', async () => {
    await joinGroup('g1');
    await blockUser('u2');
    await reportUser('u2', 'x');
    const payloads = recorders
      .flatMap((r) => r.calls)
      .filter(([method]) => method === 'insert' || method === 'update' || method === 'upsert')
      .flatMap(([, args]) => args as Record<string, unknown>[]);
    expect(payloads.length).toBe(3);
    for (const payload of payloads) for (const key of PRIVILEGED) expect(payload).not.toHaveProperty(key);
  });
});
