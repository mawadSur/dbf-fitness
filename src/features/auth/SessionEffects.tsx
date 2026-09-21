/**
 * Everything that has to happen once per signed-in session, in one mount point.
 *
 * Kept out of `app/_layout.tsx` so the root layout stays a layout: it renders
 * nothing and owns no state, and the root layout's "never touches the router"
 * property survives (the tap subscriber is the only navigator here).
 */

import { NotificationTapSubscriber } from '../notifications/client/NotificationTapSubscriber';
import { PushRegistrar } from '../notifications/client/PushRegistrar';
import { useTimezoneSync } from './useTimezoneSync';

export function SessionEffects({ userId }: { userId: string | null }) {
  useTimezoneSync(userId);

  return (
    <>
      <PushRegistrar isSessionReady={!!userId} />
      <NotificationTapSubscriber />
    </>
  );
}
