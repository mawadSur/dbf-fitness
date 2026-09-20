// Subscription entitlement, in portable TypeScript.
//
// No imports and no Deno/Node globals on purpose: the same file is loaded by the Edge runtime
// (via `../_shared/subscriptionState.ts` from a function's index.ts), by Jest, and by the app
// (src/features/subscriptions re-exports GRACE_DAYS / canJoinLive from here so the constant is
// defined exactly once on the TypeScript side).
//
// THIS MIRRORS SQL. The authority is public.subscription_state_row() in
// supabase/migrations/20260919150000_subscriptions_and_live_access.sql, and the app always asks
// the database (rpc get_subscription_state) rather than computing state from a raw row. The
// mirror exists only for server-side batch work that already holds the rows — the
// live-class-reminder function, which would otherwise need one RPC per member. Any change to the
// SQL state machine must be made here too; subscriptionState.test.ts pins the same boundary cases
// the SQL role matrix pins.

/**
 * Days of continued live-class access after current_period_end when a payment is merely late.
 * Single source of truth in TypeScript; the SQL counterpart is public.subscription_grace_days().
 */
export const GRACE_DAYS = 10;

export type SubscriptionState = 'none' | 'active' | 'grace' | 'expired' | 'staff';

export type SubscriptionInfo = {
  state: SubscriptionState;
  currentPeriodEnd: string | null;
  daysOverdue: number;
  graceDaysLeft: number;
};

/** The fields of public.subscriptions the state machine reads. */
export type SubscriptionRecord = {
  status: string;
  current_period_end: string;
};

const MS_PER_DAY = 86_400_000;

/** ACCESS = active | grace | staff. Everything that gates a live class goes through this. */
export function canJoinLive(state: SubscriptionState): boolean {
  return state === 'active' || state === 'grace' || state === 'staff';
}

/**
 * The state machine, mirroring public.subscription_state_row():
 *   staff   - role is coach/admin (exempt; no row needed)
 *   none    - no row, or a row whose period end cannot be parsed (fails closed)
 *   active  - now <= current_period_end, whatever the status ('canceled' keeps its paid period)
 *   grace   - now > end, now <= end + graceDays (INCLUSIVE), status is active/past_due
 *   expired - anything else
 */
export function computeSubscriptionState(
  subscription: SubscriptionRecord | null | undefined,
  isStaff: boolean,
  now: Date,
  graceDays: number = GRACE_DAYS
): SubscriptionInfo {
  const rawEnd = subscription?.current_period_end ?? null;
  const endMs = rawEnd === null ? Number.NaN : new Date(rawEnd).getTime();
  const hasEnd = Number.isFinite(endMs);
  const currentPeriodEnd = hasEnd ? rawEnd : null;

  if (isStaff) return { state: 'staff', currentPeriodEnd, daysOverdue: 0, graceDaysLeft: 0 };
  if (!subscription || !hasEnd) {
    return { state: 'none', currentPeriodEnd: null, daysOverdue: 0, graceDaysLeft: 0 };
  }

  const nowMs = now.getTime();
  if (nowMs <= endMs) {
    return { state: 'active', currentPeriodEnd, daysOverdue: 0, graceDaysLeft: 0 };
  }

  const graceEndMs = endMs + graceDays * MS_PER_DAY;
  const paymentIsLate = subscription.status === 'active' || subscription.status === 'past_due';
  if (nowMs <= graceEndMs && paymentIsLate) {
    return {
      state: 'grace',
      currentPeriodEnd,
      daysOverdue: Math.floor((nowMs - endMs) / MS_PER_DAY),
      graceDaysLeft: Math.ceil((graceEndMs - nowMs) / MS_PER_DAY),
    };
  }

  return { state: 'expired', currentPeriodEnd, daysOverdue: 0, graceDaysLeft: 0 };
}

export function hasLiveAccessAt(
  subscription: SubscriptionRecord | null | undefined,
  isStaff: boolean,
  now: Date,
  graceDays: number = GRACE_DAYS
): boolean {
  return canJoinLive(computeSubscriptionState(subscription, isStaff, now, graceDays).state);
}

export type MemberEntitlementInput = {
  member_id: string;
  role?: string | null;
  subscription?: SubscriptionRecord | null;
};

/**
 * Ids of the members who currently have live access. Used by live-class-reminder so a lapsed
 * member is not pushed a "starting soon" notification for a class they would be turned away from.
 */
export function selectEntitledMemberIds(
  members: readonly MemberEntitlementInput[],
  now: Date,
  graceDays: number = GRACE_DAYS
): string[] {
  return members
    .filter((member) =>
      hasLiveAccessAt(
        member.subscription ?? null,
        member.role === 'coach' || member.role === 'admin',
        now,
        graceDays
      )
    )
    .map((member) => member.member_id);
}
