// Subscription entitlement, as the app sees it.
//
// The state machine itself lives in SQL (public.subscription_state_row) and is mirrored once in
// portable TypeScript at supabase/functions/_shared/subscriptionState.ts. This module re-exports
// that single definition — GRACE_DAYS is declared in exactly one place on the TS side — and adds
// the UI copy on top. The app NEVER derives the state from a raw subscriptions row; it asks the
// database (see api.ts / useSubscriptionState.ts), because the client is not trusted with
// entitlement.
import type { SubscriptionInfo } from '../../../supabase/functions/_shared/subscriptionState';

export {
  canJoinLive,
  GRACE_DAYS,
  type SubscriptionInfo,
  type SubscriptionState,
} from '../../../supabase/functions/_shared/subscriptionState';

export type ReminderCopy = { title: string; body: string };

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * What to tell the member about their subscription, shown when they open or join a live class.
 *
 * The grace case is the one the product asked for by name: a late payer keeps access for
 * GRACE_DAYS days and is reminded every time they join the call, with the countdown spelled out
 * so the deadline is never a surprise. The other states are here so a caller never has to
 * special-case them; `active` and `staff` are reassurance, not a nag.
 */
export function graceReminderCopy(info: SubscriptionInfo): ReminderCopy {
  switch (info.state) {
    case 'grace': {
      const ending =
        info.graceDaysLeft <= 0
          ? 'Live-class access ends today'
          : `Live-class access ends in ${plural(info.graceDaysLeft, 'day')}`;
      return {
        title: 'Payment overdue',
        body: `Your payment is ${plural(info.daysOverdue, 'day')} overdue. ${ending} — renew to keep joining.`,
      };
    }
    case 'expired':
      return {
        title: 'Subscription expired',
        body: 'Your subscription has expired, so live classes are locked. Renew to start joining again.',
      };
    case 'none':
      return {
        title: 'Subscription required',
        body: 'Live classes are for subscribed members. Subscribe to join your coach’s sessions.',
      };
    case 'staff':
      return {
        title: 'Coach access',
        body: 'You host live classes, so no subscription is needed.',
      };
    case 'active':
    default:
      return {
        title: 'Subscription active',
        body: 'You’re all set — live classes are open to you.',
      };
  }
}

/** True when the member should be nagged about payment on the way into a class. */
export function shouldShowSubscriptionReminder(info: SubscriptionInfo): boolean {
  return info.state === 'grace';
}
