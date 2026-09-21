/**
 * The push RPC wrappers. What is worth asserting here is the SHAPE OF THE CALL — the parameter
 * names are a contract with SECURITY DEFINER functions, and a typo produces "function does not
 * exist" at runtime on a real device, never in a type check — plus the error mapping, which is
 * the only place a Postgres SQLSTATE becomes a sentence a coach reads.
 */
import {
  NUDGE_TEMPLATES,
  classifyNudgeError,
  isNudgeTemplate,
  nudgeErrorMessage,
  registerPushToken,
  sendNudge,
  unregisterPushToken,
} from './api';

const mockRpc = jest.fn();

jest.mock('../../services/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

beforeEach(() => {
  mockRpc.mockReset();
  mockRpc.mockResolvedValue({ data: null, error: null });
});

describe('registerPushToken / unregisterPushToken', () => {
  it('calls register_push_token with the SQL parameter names', async () => {
    await registerPushToken('ExponentPushToken[abc]', 'ios');
    expect(mockRpc).toHaveBeenCalledWith('register_push_token', {
      p_token: 'ExponentPushToken[abc]',
      p_platform: 'ios',
    });
  });

  it('passes null rather than undefined when the platform is unknown', async () => {
    await registerPushToken('ExponentPushToken[abc]');
    expect(mockRpc.mock.calls[0][1]).toEqual({
      p_token: 'ExponentPushToken[abc]',
      p_platform: null,
    });
  });

  it('rejects when the RPC fails, so a caller cannot treat a failure as registered', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'invalid token' } });
    await expect(registerPushToken('nope', 'ios')).rejects.toMatchObject({ code: '22023' });
  });

  it('unregisters one token by name', async () => {
    await unregisterPushToken('ExponentPushToken[abc]');
    expect(mockRpc).toHaveBeenCalledWith('unregister_push_token', {
      p_token: 'ExponentPushToken[abc]',
    });
  });

  it('propagates an unregister failure (sign-out treats it as best effort itself)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'network' } });
    await expect(unregisterPushToken('t')).rejects.toBeTruthy();
  });
});

describe('sendNudge', () => {
  it('returns the outbox row id', async () => {
    mockRpc.mockResolvedValue({ data: 'b6f1a6c2-0000-4000-8000-000000000001', error: null });
    await expect(sendNudge('m1', 'check_in')).resolves.toBe('b6f1a6c2-0000-4000-8000-000000000001');
    expect(mockRpc).toHaveBeenCalledWith('send_nudge', { p_member: 'm1', p_template: 'check_in' });
  });

  it('throws when the RPC answers without an id', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await expect(sendNudge('m1', 'great_work')).rejects.toThrow(/no id/);
  });

  it('propagates the Postgres error unchanged for the caller to classify', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '23505', message: 'already' } });
    await expect(sendNudge('m1', 'check_in')).rejects.toMatchObject({ code: '23505' });
  });
});

describe('the nudge template allowlist', () => {
  it('matches the CHECK constraint in 20260921140000 exactly', () => {
    expect([...NUDGE_TEMPLATES]).toEqual(['check_in', 'missed_workout', 'great_work']);
  });

  it('rejects free text, which is the whole point of the allowlist', () => {
    expect(isNudgeTemplate('check_in')).toBe(true);
    expect(isNudgeTemplate('you owe me money')).toBe(false);
    expect(isNudgeTemplate(undefined)).toBe(false);
    expect(isNudgeTemplate(42)).toBe(false);
  });
});

describe('nudge error copy', () => {
  it('names the once-a-day limit instead of showing a unique-violation', () => {
    expect(classifyNudgeError({ code: '23505' })).toBe('already_today');
    expect(nudgeErrorMessage({ code: '23505', message: 'already_nudged_today' })).toMatch(
      /already nudged this member today/i
    );
  });

  it('covers both 42501 reasons (not your member, no live access) in one sentence', () => {
    expect(classifyNudgeError({ code: '42501' })).toBe('not_allowed');
    expect(nudgeErrorMessage({ code: '42501', message: 'not your member' })).toMatch(
      /own members.*access is active/i
    );
  });

  it('maps an unknown template', () => {
    expect(nudgeErrorMessage({ code: '22023' })).toMatch(/no longer available/i);
  });

  it('falls back to the shared friendly copy for anything else', () => {
    expect(classifyNudgeError({ message: 'boom' })).toBe('other');
    expect(nudgeErrorMessage(new Error('Failed to fetch'))).toMatch(/check your connection/i);
    expect(nudgeErrorMessage(new Error('boom'))).toBe('Could not send that nudge.');
  });
});
