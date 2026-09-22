import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { TERMS_VERSION } from '../../config/legal';
import { acceptTerms, hasAcceptedTerms } from './api';

export const TERMS_ACCEPTANCE_QUERY_KEY = ['legal', 'termsAccepted', TERMS_VERSION] as const;

/**
 * Has the signed-in user accepted the CURRENT terms version?
 *
 * `enabled` is driven by the caller (the gate only asks once a session exists), and the result
 * never goes stale within a launch: acceptance cannot be revoked from another device, so
 * `staleTime: Infinity` keeps the gate from re-querying on every focus.
 */
export function useTermsAcceptance(enabled: boolean) {
  return useQuery<boolean>({
    queryKey: TERMS_ACCEPTANCE_QUERY_KEY,
    queryFn: () => hasAcceptedTerms(TERMS_VERSION),
    enabled,
    staleTime: Infinity,
    retry: 1,
  });
}

/**
 * Records acceptance and flips the gate open by writing the cache directly — the RPC is
 * idempotent and returns void, so a refetch would only cost a round trip on the critical path.
 */
export function useAcceptTerms() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => acceptTerms(TERMS_VERSION),
    onSuccess: () => queryClient.setQueryData(TERMS_ACCEPTANCE_QUERY_KEY, true),
  });
}
