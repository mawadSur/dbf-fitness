/**
 * Registration + sign-out release, around the in-memory token store.
 *
 * The behaviour that matters on a SHARED phone: the previous member's token is
 * released before their session ends, so the next person does not inherit
 * their reminders.
 */

import { registerDeviceTokenIfPermitted } from './PushRegistrar';
import { releasePushTokenBeforeSignOut } from './signOutCleanup';
import { forgetPushToken, getRememberedPushToken, rememberPushToken } from './tokenStore';

jest.mock('./deviceToken', () => ({ getExistingPushToken: jest.fn() }));
jest.mock('./pushTokenApi', () => ({ unregisterPushToken: jest.fn() }));

const { getExistingPushToken } = jest.requireMock('./deviceToken');
const { unregisterPushToken } = jest.requireMock('./pushTokenApi');

const TOKEN = 'ExponentPushToken[abc123]';
const OTHER = 'ExponentPushToken[zzz999]';

beforeEach(() => {
  jest.clearAllMocks();
  forgetPushToken();
});

describe('registerDeviceTokenIfPermitted', () => {
  const deps = (over: Partial<Parameters<typeof registerDeviceTokenIfPermitted>[0]> = {}) => ({
    getToken: jest.fn().mockResolvedValue(TOKEN),
    register: jest.fn().mockResolvedValue(true),
    platform: 'ios',
    ...over,
  });

  it('registers the token and remembers it', async () => {
    const d = deps();
    await expect(registerDeviceTokenIfPermitted(d)).resolves.toBe(TOKEN);
    expect(d.register).toHaveBeenCalledWith(TOKEN, 'ios');
    expect(getRememberedPushToken()).toBe(TOKEN);
  });

  it('does nothing at all on web', async () => {
    const d = deps({ platform: 'web' });
    await expect(registerDeviceTokenIfPermitted(d)).resolves.toBeNull();
    expect(d.getToken).not.toHaveBeenCalled();
    expect(d.register).not.toHaveBeenCalled();
  });

  it('stays silent when permission was never granted (no token)', async () => {
    const d = deps({ getToken: jest.fn().mockResolvedValue(null) });
    await expect(registerDeviceTokenIfPermitted(d)).resolves.toBeNull();
    expect(d.register).not.toHaveBeenCalled();
  });

  it('does not re-register the identical token twice in one app run', async () => {
    const d = deps();
    await registerDeviceTokenIfPermitted(d);
    await registerDeviceTokenIfPermitted(d);
    expect(d.register).toHaveBeenCalledTimes(1);
  });

  it('DOES register when the device token changed', async () => {
    await registerDeviceTokenIfPermitted(deps());
    const d = deps({ getToken: jest.fn().mockResolvedValue(OTHER) });
    await expect(registerDeviceTokenIfPermitted(d)).resolves.toBe(OTHER);
    expect(d.register).toHaveBeenCalledWith(OTHER, 'ios');
    expect(getRememberedPushToken()).toBe(OTHER);
  });

  it('does not remember a token the server refused', async () => {
    const d = deps({ register: jest.fn().mockResolvedValue(false) });
    await expect(registerDeviceTokenIfPermitted(d)).resolves.toBeNull();
    expect(getRememberedPushToken()).toBeNull();
  });
});

describe('releasePushTokenBeforeSignOut', () => {
  it('releases the remembered token without touching native', async () => {
    rememberPushToken(TOKEN);
    unregisterPushToken.mockResolvedValue(true);

    await expect(releasePushTokenBeforeSignOut()).resolves.toBe(true);
    expect(unregisterPushToken).toHaveBeenCalledWith(TOKEN);
    expect(getExistingPushToken).not.toHaveBeenCalled();
    expect(getRememberedPushToken()).toBeNull();
  });

  it('falls back to reading the token back when this run never registered one', async () => {
    getExistingPushToken.mockResolvedValue(OTHER);
    unregisterPushToken.mockResolvedValue(true);

    await expect(releasePushTokenBeforeSignOut()).resolves.toBe(true);
    expect(unregisterPushToken).toHaveBeenCalledWith(OTHER);
  });

  it('resolves false when there is no token at all', async () => {
    getExistingPushToken.mockResolvedValue(null);
    await expect(releasePushTokenBeforeSignOut()).resolves.toBe(false);
    expect(unregisterPushToken).not.toHaveBeenCalled();
  });

  // Sign-out must proceed even if the release fails; and the stale token must
  // not be reused for the NEXT account on this device.
  it('forgets the token even when the server call fails', async () => {
    rememberPushToken(TOKEN);
    unregisterPushToken.mockResolvedValue(false);

    await expect(releasePushTokenBeforeSignOut()).resolves.toBe(false);
    expect(getRememberedPushToken()).toBeNull();
  });

  it('never throws, and still forgets, when the token lookup blows up', async () => {
    getExistingPushToken.mockRejectedValue(new Error('native bridge gone'));
    await expect(releasePushTokenBeforeSignOut()).resolves.toBe(false);
    expect(getRememberedPushToken()).toBeNull();
  });
});
