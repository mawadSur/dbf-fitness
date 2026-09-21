/**
 * Push is an enhancement: no failure here may ever surface to a member or hold
 * up sign-out. These tests pin that "best effort" promise, including the
 * pre-D3 world where the RPCs do not exist yet (PGRST202).
 */

import { fakeRpcCalls, resetFake, setRpc } from '../../diet/fakeSupabase';
import { isExpoPushToken, registerPushToken, unregisterPushToken } from './pushTokenApi';

jest.mock('../../../services/supabase/client', () => ({
  supabase: jest.requireActual('../../diet/fakeSupabase').fakeSupabase,
}));

const TOKEN = 'ExponentPushToken[abc123DEF]';
const ok = () => ({ data: null, error: null });
/** PostgrestError carries a `code`; the fake types `error` as `Error`, so carry both. */
const fail = (code: string, message = code) => ({
  data: null,
  error: Object.assign(new Error(message), { code }),
});

let warn: jest.SpyInstance;

beforeEach(() => {
  resetFake();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => warn.mockRestore());

describe('isExpoPushToken', () => {
  it.each(['ExponentPushToken[abc123]', 'ExpoPushToken[xyz-_9]'])('accepts %s', (token) => {
    expect(isExpoPushToken(token)).toBe(true);
  });

  it.each([
    ['a bare string', 'abc123'],
    ['a FCM-looking token', 'fcm:APA91bH...'],
    ['an unclosed bracket', 'ExponentPushToken[abc'],
    ['whitespace inside', 'ExponentPushToken[ab c]'],
    ['an empty body', 'ExponentPushToken[]'],
    ['the empty string', ''],
  ])('rejects %s', (_label, token) => {
    expect(isExpoPushToken(token)).toBe(false);
  });

  it.each([null, undefined, 42, {}])('rejects the non-string %p', (value) => {
    expect(isExpoPushToken(value)).toBe(false);
  });
});

describe('registerPushToken', () => {
  it('sends the token and platform to register_push_token', async () => {
    setRpc('register_push_token', ok);
    await expect(registerPushToken(TOKEN, 'ios')).resolves.toBe(true);
    expect(fakeRpcCalls).toEqual([
      { name: 'register_push_token', args: { p_token: TOKEN, p_platform: 'ios' } },
    ]);
  });

  it('never calls the server with a malformed token', async () => {
    setRpc('register_push_token', ok);
    await expect(registerPushToken('not-a-token', 'android')).resolves.toBe(false);
    expect(fakeRpcCalls).toHaveLength(0);
  });

  it('resolves false — not throws — when the RPC does not exist yet (pre-D3)', async () => {
    setRpc('register_push_token', () => fail('PGRST202', 'function does not exist'));
    await expect(registerPushToken(TOKEN, 'ios')).resolves.toBe(false);
  });

  it('resolves false when the client throws outright', async () => {
    setRpc('register_push_token', () => {
      throw new Error('Network request failed');
    });
    await expect(registerPushToken(TOKEN, 'ios')).resolves.toBe(false);
  });

  it('never logs the token itself', async () => {
    setRpc('register_push_token', () => fail('PGRST202', 'function does not exist'));
    await registerPushToken(TOKEN, 'ios');
    const logged = warn.mock.calls.flat().map(String).join(' ');
    expect(logged).not.toContain('abc123DEF');
  });
});

describe('unregisterPushToken', () => {
  it('releases the token', async () => {
    setRpc('unregister_push_token', ok);
    await expect(unregisterPushToken(TOKEN)).resolves.toBe(true);
    expect(fakeRpcCalls).toEqual([
      { name: 'unregister_push_token', args: { p_token: TOKEN } },
    ]);
  });

  it('gives up after the timeout so sign-out is never blocked', async () => {
    jest.useFakeTimers();
    try {
      setRpc('unregister_push_token', () => new Promise(() => {})); // never settles
      const pending = unregisterPushToken(TOKEN, 50);
      jest.advanceTimersByTime(50);
      await expect(pending).resolves.toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('resolves false on a server error rather than rejecting', async () => {
    setRpc('unregister_push_token', () => fail('42501', 'permission denied'));
    await expect(unregisterPushToken(TOKEN)).resolves.toBe(false);
  });

  it('skips a malformed token without a round trip', async () => {
    setRpc('unregister_push_token', ok);
    await expect(unregisterPushToken('garbage')).resolves.toBe(false);
    expect(fakeRpcCalls).toHaveLength(0);
  });
});
