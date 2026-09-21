/**
 * The one place the root tree navigates imperatively, and it is on purpose: a
 * notification tap is a user action that arrives from outside React, so there
 * is no declarative guard that could express it.
 *
 * It lives in its own component (rather than in `app/_layout.tsx`) so the root
 * layout keeps its "never touches the router" property — the property that
 * caught the old redirect-in-an-effect bug.
 */

import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { useNotificationTaps } from './useNotificationTaps';

export function NotificationTapSubscriber() {
  const router = useRouter();
  // `push`, not `replace`: the member can still get back to where they were.
  //
  // Guarded because a cold-start tap resolves asynchronously and can land in
  // the same commit that first mounts the navigator. Losing the deep link is a
  // disappointment; throwing at the root is a white screen.
  const navigate = useCallback(
    (route: string) => {
      try {
        router.push(route as never);
      } catch (error) {
        console.warn('[notifications] could not open route from notification', error);
      }
    },
    [router],
  );
  useNotificationTaps({ navigate });
  return null;
}
