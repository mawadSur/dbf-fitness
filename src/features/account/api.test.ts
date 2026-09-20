import { DeleteAccountError, codeFromStatus, deleteAccount, fetchMyMemberCount } from './api';
import { supabase } from '../../services/supabase/client';

jest.mock('../../services/supabase/client', () => ({
  supabase: {
    functions: { invoke: jest.fn() },
    auth: { getSession: jest.fn() },
    from: jest.fn(),
  },
}));

const invoke = supabase.functions.invoke as jest.Mock;
const getSession = supabase.auth.getSession as jest.Mock;
const from = supabase.from as jest.Mock;

/** The FunctionsHttpError shape supabase-js produces for a non-2xx. */
function httpError(status: number, body: unknown) {
  return Object.assign(new Error(`Edge Function returned a non-2xx status code`), {
    context: { status, json: async () => body },
  });
}

beforeEach(() => jest.clearAllMocks());

describe('codeFromStatus', () => {
  it('prefers a known body error over the status', () => {
    expect(codeFromStatus(403, 'admin_managed_by_operator')).toBe('admin_managed_by_operator');
    expect(codeFromStatus(403, 'invalid_password')).toBe('invalid_password');
  });

  it('falls back to the status when the body says nothing useful', () => {
    expect(codeFromStatus(400, undefined)).toBe('confirm_required');
    expect(codeFromStatus(401, null)).toBe('unauthorized');
    expect(codeFromStatus(403, {})).toBe('invalid_password');
    expect(codeFromStatus(418, 'teapot')).toBe('unknown');
    // 500 delete_failed / server_misconfigured have no distinct user copy.
    expect(codeFromStatus(500, 'delete_failed')).toBe('unknown');
  });

  // Regression (review 2026-09-20): the Edge Function's 413 and its storage refusal used to
  // collapse into 'unknown', i.e. "Try again in a moment".
  it('keeps the two refusals the UI has its own copy for', () => {
    expect(codeFromStatus(413, undefined)).toBe('payload_too_large');
    expect(codeFromStatus(413, 'payload_too_large')).toBe('payload_too_large');
    expect(codeFromStatus(500, 'storage_cleanup_failed')).toBe('storage_cleanup_failed');
  });

  it('calls a missing status a network failure', () => {
    expect(codeFromStatus(undefined, undefined)).toBe('network');
  });
});

describe('deleteAccount', () => {
  it('posts confirm DELETE with the password and resolves on { ok: true }', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await expect(deleteAccount('hunter2')).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledWith('delete-account', {
      body: { confirm: 'DELETE', password: 'hunter2' },
    });
  });

  it('never sends a user id, so the server cannot be pointed at another account', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await deleteAccount('pw');
    expect(Object.keys(invoke.mock.calls[0][1].body).sort()).toEqual(['confirm', 'password']);
  });

  it.each([
    [403, { error: 'invalid_password' }, 'invalid_password'],
    [403, { error: 'admin_managed_by_operator' }, 'admin_managed_by_operator'],
    [400, { error: 'confirm_required' }, 'confirm_required'],
    [401, { error: 'unauthorized' }, 'unauthorized'],
    [500, { error: 'storage_cleanup_failed' }, 'storage_cleanup_failed'],
    [413, { error: 'payload_too_large' }, 'payload_too_large'],
    [500, { error: 'delete_failed' }, 'unknown'],
  ])('maps %i %p to %s', async (status, body, expected) => {
    invoke.mockResolvedValue({ data: null, error: httpError(status, body) });
    await expect(deleteAccount('pw')).rejects.toMatchObject({ code: expected });
  });

  it('falls back to the status when the error body cannot be parsed', async () => {
    const error = Object.assign(new Error('boom'), {
      context: {
        status: 401,
        json: async () => {
          throw new Error('not json');
        },
      },
    });
    invoke.mockResolvedValue({ data: null, error });
    await expect(deleteAccount('pw')).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('reports a rejected invoke (no response at all) as a network failure', async () => {
    invoke.mockRejectedValue(new TypeError('Network request failed'));
    await expect(deleteAccount('pw')).rejects.toMatchObject({ code: 'network' });
  });

  it('reports an error with no context as a network failure', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('offline') });
    await expect(deleteAccount('pw')).rejects.toMatchObject({ code: 'network' });
  });

  it.each([null, {}, { ok: false }, { ok: 'true' }, 'ok'])(
    'refuses a malformed 200 body %p instead of pretending the account is gone',
    async (data) => {
      invoke.mockResolvedValue({ data, error: null });
      await expect(deleteAccount('pw')).rejects.toMatchObject({ code: 'unknown' });
    }
  );

  it('throws a DeleteAccountError, so callers can switch on .code', async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(403, { error: 'invalid_password' }) });
    await expect(deleteAccount('pw')).rejects.toBeInstanceOf(DeleteAccountError);
  });
});

describe('fetchMyMemberCount', () => {
  function mockCount(result: { count?: number | null; error?: unknown }) {
    from.mockReturnValue({ select: () => ({ eq: () => Promise.resolve(result) }) });
  }

  it('counts the profiles whose coach is the signed-in user', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'coach-1' } } } });
    const eq = jest.fn().mockResolvedValue({ count: 4, error: null });
    const select = jest.fn().mockReturnValue({ eq });
    from.mockReturnValue({ select });

    await expect(fetchMyMemberCount()).resolves.toBe(4);
    expect(from).toHaveBeenCalledWith('profiles');
    expect(select).toHaveBeenCalledWith('id', { count: 'exact', head: true });
    expect(eq).toHaveBeenCalledWith('coach_id', 'coach-1');
  });

  it('returns 0 for a coach with no members', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'coach-1' } } } });
    mockCount({ count: 0, error: null });
    await expect(fetchMyMemberCount()).resolves.toBe(0);
  });

  it('returns null when there is no session', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(fetchMyMemberCount()).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it('returns null on a query error rather than throwing into the panel', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'coach-1' } } } });
    mockCount({ count: null, error: { message: 'nope' } });
    await expect(fetchMyMemberCount()).resolves.toBeNull();
  });

  it('returns null when the count header is missing', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'coach-1' } } } });
    mockCount({ count: null, error: null });
    await expect(fetchMyMemberCount()).resolves.toBeNull();
  });
});
