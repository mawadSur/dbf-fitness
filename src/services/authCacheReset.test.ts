import { QueryClient } from '@tanstack/react-query';

import { bindAuthCacheReset, createAuthIdentityWatcher } from './authCacheReset';

// Must match `AuthStateSource`'s callback exactly: a looser `unknown` session
// makes the fake unassignable to the real parameter type (contravariance).
type FakeSession = { user?: { id?: string | null } | null } | null | undefined;
type Listener = (event: string, session: FakeSession) => void;

function fakeAuth() {
  const listeners: Listener[] = [];
  const unsubscribe = jest.fn();
  return {
    unsubscribe,
    emit: (event: string, session: FakeSession) => listeners.forEach((l) => l(event, session)),
    onAuthStateChange: (callback: Listener) => {
      listeners.push(callback);
      return { data: { subscription: { unsubscribe } } };
    },
  };
}

const session = (id: string) => ({ user: { id } });

describe('createAuthIdentityWatcher', () => {
  it('adopts the first identity it sees instead of clearing on app start', () => {
    const shouldClear = createAuthIdentityWatcher();
    expect(shouldClear('INITIAL_SESSION', session('a'))).toBe(false);
  });

  it('does not clear while the same user refreshes their token or updates their profile', () => {
    const shouldClear = createAuthIdentityWatcher();
    shouldClear('INITIAL_SESSION', session('a'));
    expect(shouldClear('TOKEN_REFRESHED', session('a'))).toBe(false);
    expect(shouldClear('USER_UPDATED', session('a'))).toBe(false);
    expect(shouldClear('SIGNED_IN', session('a'))).toBe(false);
  });

  it('clears when a DIFFERENT account signs in', () => {
    const shouldClear = createAuthIdentityWatcher();
    shouldClear('INITIAL_SESSION', session('a'));
    expect(shouldClear('SIGNED_IN', session('b'))).toBe(true);
  });

  it('clears on sign-out, including the sign-out a failed token refresh produces', () => {
    const shouldClear = createAuthIdentityWatcher();
    shouldClear('INITIAL_SESSION', session('a'));
    expect(shouldClear('SIGNED_OUT', null)).toBe(true);
    // Already empty: a repeated SIGNED_OUT is not another wipe.
    expect(shouldClear('SIGNED_OUT', null)).toBe(false);
  });

  it('clears when the app starts signed out and someone then signs in', () => {
    const shouldClear = createAuthIdentityWatcher();
    expect(shouldClear('INITIAL_SESSION', null)).toBe(false);
    expect(shouldClear('SIGNED_IN', session('a'))).toBe(true);
  });
});

describe('bindAuthCacheReset', () => {
  it("account A's cached data is gone for account B", () => {
    const auth = fakeAuth();
    const client = new QueryClient();
    bindAuthCacheReset(auth, client);

    auth.emit('INITIAL_SESSION', session('a'));
    client.setQueryData(['workout', 'today', 'a'], { blockName: 'Push day' });
    expect(client.getQueryData(['workout', 'today', 'a'])).toEqual({ blockName: 'Push day' });

    auth.emit('SIGNED_OUT', null);
    auth.emit('SIGNED_IN', session('b'));

    expect(client.getQueryData(['workout', 'today', 'a'])).toBeUndefined();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });

  it('keeps the cache across a token refresh for the same user', () => {
    const auth = fakeAuth();
    const client = new QueryClient();
    bindAuthCacheReset(auth, client);

    auth.emit('INITIAL_SESSION', session('a'));
    client.setQueryData(['subscription', 'state'], { state: 'active' });
    auth.emit('TOKEN_REFRESHED', session('a'));

    expect(client.getQueryData(['subscription', 'state'])).toEqual({ state: 'active' });
  });

  it('unsubscribes when the root layout unmounts', () => {
    const auth = fakeAuth();
    const unbind = bindAuthCacheReset(auth, { clear: jest.fn() });
    unbind();
    expect(auth.unsubscribe).toHaveBeenCalled();
  });
});
