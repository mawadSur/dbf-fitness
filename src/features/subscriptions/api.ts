import { supabase } from '../../services/supabase/client';
import type { SubscriptionInfo, SubscriptionState } from './state';

const STATES: readonly SubscriptionState[] = ['none', 'active', 'grace', 'expired', 'staff'];

const NO_SUBSCRIPTION: SubscriptionInfo = {
  state: 'none',
  currentPeriodEnd: null,
  daysOverdue: 0,
  graceDaysLeft: 0,
};

/** Anything the server did not send in the agreed shape means no access. Fails closed. */
function toInfo(row: Record<string, unknown> | null | undefined): SubscriptionInfo {
  if (!row) return NO_SUBSCRIPTION;
  const state = STATES.includes(row.state as SubscriptionState)
    ? (row.state as SubscriptionState)
    : 'none';
  return {
    state,
    currentPeriodEnd: typeof row.current_period_end === 'string' ? row.current_period_end : null,
    daysOverdue: typeof row.days_overdue === 'number' ? row.days_overdue : 0,
    graceDaysLeft: typeof row.grace_days_left === 'number' ? row.grace_days_left : 0,
  };
}

/**
 * The caller's entitlement, decided entirely by the database. `get_subscription_state()` is a
 * set-returning function, so PostgREST hands back an array of exactly one row (an empty array is
 * only possible if the RPC is missing, which is treated as "no subscription").
 */
export async function fetchSubscriptionState(): Promise<SubscriptionInfo> {
  const { data, error } = await supabase.rpc('get_subscription_state');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return toInfo(row as Record<string, unknown> | null | undefined);
}
