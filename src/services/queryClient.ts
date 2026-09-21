import { QueryClient } from '@tanstack/react-query';

import { classifyError } from '../components/friendlyError';

/**
 * The one TanStack client, and the fail-fast policy every screen inherits.
 *
 * THE BUG THIS FIXES — with `retry: 1` and TanStack's default exponential
 * `retryDelay`, a phone with no usable connection sat in the Skeleton for well
 * over 15 seconds before the Retry button appeared. Two things stacked up:
 *
 *  1. A retry that could never succeed. A hard network failure ("Network
 *     request failed", "Load failed", DNS/ECONNREFUSED) means the request
 *     never reached the server; repeating it a second later changes nothing
 *     and only doubles the wait. Retrying is for a server that answered badly,
 *     not for a network that is not there.
 *  2. No cap on a single attempt. `fetch` in React Native has NO default
 *     timeout, and `supabase.auth.getSession()` — which most fetchers call
 *     first, to get the member id — inherits that, so one attempt could hang
 *     until the OS gave up (tens of seconds).
 *
 * So: network failures are not retried at all, everything else gets exactly
 * one quick retry, and `withQueryTimeout` caps each attempt. The arithmetic is
 * asserted in `queryClient.test.ts`: the WORST case from "query starts" to
 * "the screen shows its error state with a Retry" is
 * `QUERY_TIMEOUT_MS + QUERY_RETRY_DELAY_MS + QUERY_TIMEOUT_MS` = 7.3 s, inside
 * the 8 s budget, and a detectable network failure lands immediately.
 *
 * `staleTime` is unchanged: fail-fast is about the FIRST answer, not about how
 * long a good answer stays good.
 */

/** Unchanged from before: a good answer stays fresh for 30 s. */
export const QUERY_STALE_TIME_MS = 30_000;

/** How long ONE attempt may take before it is treated as a timeout. */
export const QUERY_TIMEOUT_MS = 3_500;

/** Gap before the single retry. Flat, not exponential — the budget is small. */
export const QUERY_RETRY_DELAY_MS = 300;

/** Retries allowed for an error that is NOT a hard network failure. */
export const MAX_QUERY_RETRIES = 1;

/**
 * The longest a screen may stay in its loading state before it shows an error
 * with a Retry. Everything above is sized to fit inside this.
 */
export const QUERY_ERROR_BUDGET_MS = 8_000;

/**
 * Is this the network being unreachable, rather than the server complaining?
 *
 * Reuses `classifyError` so the retry policy and the copy the member reads
 * ("Can't reach the server…") can never disagree about what a network error
 * is — one regex, one answer.
 */
export function isHardNetworkError(error: unknown): boolean {
  return classifyError(error) === 'network';
}

/** `retry` for TanStack: false on a network failure, one quick retry otherwise. */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (isHardNetworkError(error)) return false;
  // An expired/absent session will not fix itself inside 300 ms either, and the
  // screen has a real recovery for it (sign in again), so surface it at once.
  if (classifyError(error) === 'auth') return false;
  // `failureCount` is 0 on the first check (TanStack documents `retry: 3` as
  // `failureCount < 3`), so `<` is what gives exactly MAX_QUERY_RETRIES retries.
  return failureCount < MAX_QUERY_RETRIES;
}

/** `retryDelay` for TanStack: flat and short, never exponential. */
export function queryRetryDelay(): number {
  return QUERY_RETRY_DELAY_MS;
}

/**
 * The worst-case time from "query starts" to "error state on screen", in ms,
 * for an error that IS retried. Exists so the budget is a value a test can
 * check rather than a comment.
 */
export function worstCaseTimeToErrorMs(
  timeout: number = QUERY_TIMEOUT_MS,
  delay: number = QUERY_RETRY_DELAY_MS,
  retries: number = MAX_QUERY_RETRIES,
): number {
  return timeout * (retries + 1) + delay * retries;
}

/** Thrown when one attempt outlives `QUERY_TIMEOUT_MS`. */
export class QueryTimeoutError extends Error {
  constructor(ms: number = QUERY_TIMEOUT_MS) {
    // "timed out" is what `classifyError` looks for, so the member sees the
    // network copy and `shouldRetryQuery` does not retry it.
    super(`Request timed out after ${ms}ms`);
    this.name = 'QueryTimeoutError';
  }
}

/**
 * Caps one fetcher at `QUERY_TIMEOUT_MS`.
 *
 * TanStack v5 has no global queryFn wrapper, so a fetcher opts in:
 *
 *     queryFn: () => withQueryTimeout(() => fetchTodayPlan()),
 *
 * The underlying promise is NOT cancelled (a Supabase call has no abort handle
 * here) — it is abandoned, and its late result is ignored. That is the point:
 * the SCREEN must not wait for it.
 */
export async function withQueryTimeout<T>(
  run: () => Promise<T>,
  ms: number = QUERY_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new QueryTimeoutError(ms)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: QUERY_STALE_TIME_MS,
      retry: shouldRetryQuery,
      retryDelay: queryRetryDelay,
    },
    mutations: {
      // A mutation is a member action they are watching a spinner for: never
      // silently repeat a write, and never make them wait on a dead network.
      retry: false,
    },
  },
});
