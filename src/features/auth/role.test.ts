import { fakeSupabase, resetFake, setSession, setTable } from '../diet/fakeSupabase';
import { fetchRole, isAdmin, isCoach, isStaff, normalizeRole } from './role';

jest.mock('../../services/supabase/client', () => ({
  supabase: jest.requireActual('../diet/fakeSupabase').fakeSupabase,
}));

const ok = (data: unknown) => ({ data, error: null });

beforeEach(() => resetFake());

describe('normalizeRole', () => {
  it('passes the two privileged roles through', () => {
    expect(normalizeRole('coach')).toBe('coach');
    expect(normalizeRole('admin')).toBe('admin');
  });

  // The role decides what the UI offers, so an unreadable value must fail
  // CLOSED. A typo or a future role name must never read as staff.
  it.each([['member'], ['Coach'], ['ADMIN'], ['superuser'], [''], [null], [undefined], [42], [{}]])(
    'degrades %p to member',
    (value) => {
      expect(normalizeRole(value)).toBe('member');
    },
  );
});

describe('role predicates', () => {
  it('treats coaches and admins as staff, nobody else', () => {
    expect(isStaff('coach')).toBe(true);
    expect(isStaff('admin')).toBe(true);
    expect(isStaff('member')).toBe(false);
    expect(isStaff(null)).toBe(false);
  });

  it('separates coach from admin', () => {
    expect(isCoach('coach')).toBe(true);
    expect(isCoach('admin')).toBe(false);
    expect(isAdmin('admin')).toBe(true);
    expect(isAdmin('coach')).toBe(false);
  });
});

describe('fetchRole', () => {
  it('returns null without a session and never asks the server', async () => {
    setSession(null);
    const asked = jest.fn();
    setTable('profiles', () => {
      asked();
      return ok({ role: 'admin' });
    });
    await expect(fetchRole()).resolves.toBeNull();
    expect(asked).not.toHaveBeenCalled();
  });

  it('reads the caller own profile row', async () => {
    setSession({ user: { id: 'u1' } });
    setTable('profiles', (ops) => {
      expect(ops.filters).toEqual([['id', 'u1']]);
      return ok({ role: 'coach' });
    });
    await expect(fetchRole()).resolves.toBe('coach');
  });

  it('is null (not an error) while the profile row does not exist yet', async () => {
    setSession({ user: { id: 'u1' } });
    setTable('profiles', () => ok(null));
    await expect(fetchRole()).resolves.toBeNull();
  });

  it('throws on a real read failure so the caller can offer a retry', async () => {
    setSession({ user: { id: 'u1' } });
    setTable('profiles', () => ({ data: null, error: new Error('Network request failed') }));
    await expect(fetchRole()).rejects.toThrow('Network request failed');
  });

  it('never trusts a garbage role coming back from the server', async () => {
    setSession({ user: { id: 'u1' } });
    setTable('profiles', () => ok({ role: 'owner' }));
    await expect(fetchRole()).resolves.toBe('member');
  });
});

// Guard: the fake is the client the app code sees in these tests.
it('uses the fake client', () => expect(fakeSupabase.from).toBeDefined());
