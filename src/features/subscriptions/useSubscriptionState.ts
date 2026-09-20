import { useQuery } from '@tanstack/react-query';

import { fetchSubscriptionState } from './api';
import type { SubscriptionInfo } from './state';

export const SUBSCRIPTION_STATE_QUERY_KEY = ['subscription', 'state'] as const;

/**
 * The signed-in member's entitlement. Short staleTime because grace can run out between screens
 * and the countdown in the reminder copy has to stay honest; the query is cheap (one RPC).
 */
export function useSubscriptionState() {
  return useQuery<SubscriptionInfo>({
    queryKey: SUBSCRIPTION_STATE_QUERY_KEY,
    queryFn: fetchSubscriptionState,
    staleTime: 60_000,
  });
}
