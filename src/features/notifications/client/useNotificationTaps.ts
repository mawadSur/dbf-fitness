/**
 * Tapping a notification opens the screen it is about — in all three cases:
 * foreground, background, and cold start (the app was not running, so the
 * listener never fires and the response is only available from
 * `getLastNotificationResponseAsync`).
 *
 * The route comes out of a push payload, i.e. server-supplied input, so it is
 * validated against the allowlist before it ever reaches the router. Anything
 * else is dropped silently — a bad payload must not be able to navigate.
 */

import { useEffect } from 'react';
import { Platform } from 'react-native';

import { isAllowedRoute } from './allowedRoute';
import { loadNotifications } from './deviceToken';

type Subscription = { remove: () => void };

/** Narrow a notification response down to a route we are willing to navigate to. */
export function routeFromNotificationResponse(response: unknown): string | null {
  if (typeof response !== 'object' || response === null) return null;
  const notification = (response as { notification?: unknown }).notification;
  if (typeof notification !== 'object' || notification === null) return null;
  const request = (notification as { request?: unknown }).request;
  if (typeof request !== 'object' || request === null) return null;
  const content = (request as { content?: unknown }).content;
  if (typeof content !== 'object' || content === null) return null;
  const data = (content as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null) return null;
  const route = (data as { route?: unknown }).route;
  return isAllowedRoute(route) ? route : null;
}

export type NotificationTapDeps = {
  navigate: (route: string) => void;
  /** Injected in tests; defaults to the lazily-required native module. */
  notifications?: {
    addNotificationResponseReceivedListener: (cb: (response: unknown) => void) => Subscription;
    getLastNotificationResponseAsync: () => Promise<unknown>;
  } | null;
  platform?: string;
};

export function useNotificationTaps({ navigate, notifications, platform }: NotificationTapDeps): void {
  useEffect(() => {
    const os = platform ?? Platform.OS;
    if (os === 'web') return;

    const api = (notifications ?? loadNotifications()) as NotificationTapDeps['notifications'];
    if (!api?.addNotificationResponseReceivedListener) return;

    let cancelled = false;
    let subscription: Subscription | undefined;

    try {
      subscription = api.addNotificationResponseReceivedListener((response) => {
        const route = routeFromNotificationResponse(response);
        if (route) navigate(route);
      });
    } catch {
      // No listener is better than a crash at root level.
    }

    // Cold start: the tap that launched the app already happened.
    void (async () => {
      try {
        const last = await api.getLastNotificationResponseAsync?.();
        if (cancelled) return;
        const route = routeFromNotificationResponse(last);
        if (route) navigate(route);
      } catch {
        // Non-fatal.
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [navigate, notifications, platform]);
}
