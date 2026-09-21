/**
 * Tapping a notification must open the right screen in all three cases
 * (foreground, background, cold start) and must NEVER navigate anywhere the
 * allowlist rejects — the route comes from the server.
 */

import { render, waitFor } from '@testing-library/react-native';
import React from 'react';

import { routeFromNotificationResponse, useNotificationTaps } from './useNotificationTaps';

const UUID = '88888888-8888-8888-8888-888888888888';

/** The shape expo-notifications actually hands us. */
const response = (data: unknown) => ({
  notification: { request: { content: { data } } },
});

function fakeNotifications(last: unknown = null) {
  const remove = jest.fn();
  let listener: ((r: unknown) => void) | undefined;
  return {
    remove,
    fire: (r: unknown) => listener?.(r),
    api: {
      addNotificationResponseReceivedListener: jest.fn((cb: (r: unknown) => void) => {
        listener = cb;
        return { remove };
      }),
      getLastNotificationResponseAsync: jest.fn().mockResolvedValue(last),
    },
  };
}

function Harness(props: { navigate: (route: string) => void; notifications?: unknown; platform?: string }) {
  useNotificationTaps(props as Parameters<typeof useNotificationTaps>[0]);
  return null;
}

describe('routeFromNotificationResponse', () => {
  it('extracts an allowed route from a well-formed response', () => {
    expect(routeFromNotificationResponse(response({ route: '/calendar' }))).toBe('/calendar');
    expect(routeFromNotificationResponse(response({ route: `/community/live/${UUID}` }))).toBe(
      `/community/live/${UUID}`,
    );
  });

  it('drops a route the allowlist rejects', () => {
    expect(routeFromNotificationResponse(response({ route: 'https://evil.example' }))).toBeNull();
    expect(routeFromNotificationResponse(response({ route: '/admin/secrets' }))).toBeNull();
  });

  it.each([
    ['null', null],
    ['a string', 'calendar'],
    ['an empty object', {}],
    ['a missing request', { notification: {} }],
    ['a missing content', { notification: { request: {} } }],
    ['a missing data', { notification: { request: { content: {} } } }],
    ['data without a route', response({ kind: 'nudge' })],
    ['a non-object data', response('calendar')],
  ])('returns null for %s', (_label, value) => {
    expect(routeFromNotificationResponse(value)).toBeNull();
  });
});

describe('useNotificationTaps', () => {
  it('navigates when a tap arrives while the app is running', async () => {
    const navigate = jest.fn();
    const n = fakeNotifications();
    await render(<Harness navigate={navigate} notifications={n.api} platform="ios" />);

    n.fire(response({ route: '/effort' }));
    expect(navigate).toHaveBeenCalledWith('/effort');
  });

  it('navigates for the tap that cold-started the app', async () => {
    const navigate = jest.fn();
    const n = fakeNotifications(response({ route: `/(tabs)/workout/${UUID}` }));
    await render(<Harness navigate={navigate} notifications={n.api} platform="android" />);

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(`/(tabs)/workout/${UUID}`));
  });

  it('ignores a disallowed route from a live tap', async () => {
    const navigate = jest.fn();
    const n = fakeNotifications();
    await render(<Harness navigate={navigate} notifications={n.api} platform="ios" />);

    n.fire(response({ route: 'https://evil.example/steal' }));
    n.fire(response({ route: '/(tabs)/../admin' }));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('ignores a disallowed route from a cold start', async () => {
    const navigate = jest.fn();
    const n = fakeNotifications(response({ route: 'javascript:alert(1)' }));
    await render(<Harness navigate={navigate} notifications={n.api} platform="ios" />);

    await waitFor(() => expect(n.api.getLastNotificationResponseAsync).toHaveBeenCalled());
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does nothing on web, where there is no native module', async () => {
    const navigate = jest.fn();
    const n = fakeNotifications(response({ route: '/calendar' }));
    await render(<Harness navigate={navigate} notifications={n.api} platform="web" />);

    expect(n.api.addNotificationResponseReceivedListener).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('is a no-op when the native module is absent (Expo Go / Jest)', async () => {
    const navigate = jest.fn();
    await expect(
      render(<Harness navigate={navigate} notifications={null} platform="ios" />),
    ).resolves.toBeDefined();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('removes the listener on unmount', async () => {
    const n = fakeNotifications();
    const view = await render(<Harness navigate={jest.fn()} notifications={n.api} platform="ios" />);
    await view.unmount();
    expect(n.remove).toHaveBeenCalled();
  });

  it('does not navigate from a cold-start response that resolves after unmount', async () => {
    const navigate = jest.fn();
    let resolveLast: ((v: unknown) => void) | undefined;
    const n = fakeNotifications();
    n.api.getLastNotificationResponseAsync = jest
      .fn()
      .mockReturnValue(new Promise((r) => (resolveLast = r)));

    const view = await render(<Harness navigate={navigate} notifications={n.api} platform="ios" />);
    await view.unmount();
    resolveLast?.(response({ route: '/calendar' }));

    await Promise.resolve();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('survives a native module that throws when subscribing', async () => {
    const navigate = jest.fn();
    const api = {
      addNotificationResponseReceivedListener: jest.fn(() => {
        throw new Error('native bridge gone');
      }),
      getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
    };
    await expect(
      render(<Harness navigate={navigate} notifications={api} platform="ios" />),
    ).resolves.toBeDefined();
  });
});
