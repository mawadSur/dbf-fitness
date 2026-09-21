import { QueryClient } from '@tanstack/react-query';

import { classifyError } from '../components/friendlyError';
import {
  isHardNetworkError,
  MAX_QUERY_RETRIES,
  QUERY_ERROR_BUDGET_MS,
  QUERY_RETRY_DELAY_MS,
  QUERY_STALE_TIME_MS,
  QUERY_TIMEOUT_MS,
  QueryTimeoutError,
  queryClient,
  queryRetryDelay,
  shouldRetryQuery,
  withQueryTimeout,
  worstCaseTimeToErrorMs,
} from './queryClient';

/** The real errors the app sees, by name, so the policy is tested on them. */
const NETWORK_ERRORS: [string, unknown][] = [
  ['react-native fetch', new TypeError('Network request failed')],
  ['safari / rn-web fetch', new TypeError('Load failed')],
  ['undici', new TypeError('fetch failed')],
  ['dns', Object.assign(new Error('getaddrinfo ENOTFOUND db.local'), { code: 'ENOTFOUND' })],
  ['refused', Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })],
  ['our own cap', new QueryTimeoutError()],
];

const RETRYABLE_ERRORS: [string, unknown][] = [
  ['postgrest 500', { message: 'internal server error', code: 'XX000' }],
  ['unknown shape', new Error('something went wrong')],
];

describe('fail-fast retry policy', () => {
  it.each(NETWORK_ERRORS)('never retries a %s failure', (_name, error) => {
    expect(isHardNetworkError(error)).toBe(true);
    expect(shouldRetryQuery(0, error)).toBe(false);
  });

  it.each(RETRYABLE_ERRORS)('retries a %s exactly once', (_name, error) => {
    expect(isHardNetworkError(error)).toBe(false);
    // `failureCount` is 0 on the first check, so this is exactly one retry.
    expect(shouldRetryQuery(0, error)).toBe(true);
    expect(shouldRetryQuery(MAX_QUERY_RETRIES, error)).toBe(false);
  });

  it('surfaces an auth failure immediately — a retry cannot fix a dead session', () => {
    const expired = { message: 'JWT expired', code: 'PGRST301' };
    expect(classifyError(expired)).toBe('auth');
    expect(shouldRetryQuery(0, expired)).toBe(false);
  });

  it('uses a flat short delay, never TanStack’s exponential backoff', () => {
    expect(queryRetryDelay()).toBe(QUERY_RETRY_DELAY_MS);
    expect(QUERY_RETRY_DELAY_MS).toBeLessThanOrEqual(1_000);
  });

  it('reaches the error state inside the budget in the worst case', () => {
    expect(worstCaseTimeToErrorMs()).toBeLessThanOrEqual(QUERY_ERROR_BUDGET_MS);
    // And the budget is the thing the ticket asked for: 6-8 s, not 15+.
    expect(QUERY_ERROR_BUDGET_MS).toBeLessThanOrEqual(8_000);
    expect(worstCaseTimeToErrorMs()).toBeGreaterThanOrEqual(6_000);
  });

  it('keeps the 30s staleTime and installs the policy on the shipped client', () => {
    const defaults = queryClient.getDefaultOptions().queries;
    expect(defaults?.staleTime).toBe(QUERY_STALE_TIME_MS);
    expect(QUERY_STALE_TIME_MS).toBe(30_000);
    expect(defaults?.retry).toBe(shouldRetryQuery);
    expect(defaults?.retryDelay).toBe(queryRetryDelay);
    expect(queryClient.getDefaultOptions().mutations?.retry).toBe(false);
  });
});

describe('withQueryTimeout', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('passes a fast answer straight through', async () => {
    await expect(withQueryTimeout(async () => 'ok')).resolves.toBe('ok');
  });

  it('gives up on a hanging request after the cap', async () => {
    jest.useFakeTimers();
    // A request that never settles — exactly the `getSession()` hang that kept
    // the Skeleton up for 15+ seconds.
    const pending = withQueryTimeout(() => new Promise<string>(() => undefined));
    const assertion = expect(pending).rejects.toBeInstanceOf(QueryTimeoutError);
    jest.advanceTimersByTime(QUERY_TIMEOUT_MS);
    await assertion;
  });

  it('produces an error the member sees as a network problem, and never retries', async () => {
    jest.useFakeTimers();
    const pending = withQueryTimeout(() => new Promise<string>(() => undefined)).catch(
      (error: unknown) => error,
    );
    jest.advanceTimersByTime(QUERY_TIMEOUT_MS);
    const error = await pending;
    expect(classifyError(error)).toBe('network');
    expect(shouldRetryQuery(0, error)).toBe(false);
  });

  it('clears its timer when the request wins, so nothing is left pending', async () => {
    jest.useFakeTimers();
    const clear = jest.spyOn(global, 'clearTimeout');
    await withQueryTimeout(async () => 'done');
    expect(clear).toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    clear.mockRestore();
  });
});

describe('a query fed by the shipped policy', () => {
  /** A fresh client carrying the SHIPPED defaults, so the test is about the policy. */
  function clientUnderTest() {
    return new QueryClient({
      defaultOptions: {
        queries: { ...queryClient.getDefaultOptions().queries, gcTime: 0 },
      },
    });
  }

  it('reaches its error after ONE call when the network is down', async () => {
    const client = clientUnderTest();
    const queryFn = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    const started = Date.now();

    await expect(client.fetchQuery({ queryKey: ['down'], queryFn })).rejects.toThrow(
      /Network request failed/,
    );

    // The whole point: no second attempt, so no extra wait before Retry.
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(Date.now() - started).toBeLessThan(QUERY_ERROR_BUDGET_MS);
    client.clear();
  });

  it('still retries a server-side failure once before giving up', async () => {
    const client = clientUnderTest();
    const queryFn = jest.fn().mockRejectedValue(new Error('internal server error'));

    await expect(client.fetchQuery({ queryKey: ['500'], queryFn })).rejects.toThrow(
      /internal server error/,
    );

    expect(queryFn).toHaveBeenCalledTimes(MAX_QUERY_RETRIES + 1);
    client.clear();
  });

  it('gives up on a hanging fetcher wrapped in withQueryTimeout', async () => {
    const client = clientUnderTest();
    const queryFn = jest.fn(() => withQueryTimeout(() => new Promise<string>(() => undefined), 20));

    await expect(client.fetchQuery({ queryKey: ['hang'], queryFn })).rejects.toBeInstanceOf(
      QueryTimeoutError,
    );

    // A timeout classifies as a network error, so it is not retried either.
    expect(queryFn).toHaveBeenCalledTimes(1);
    client.clear();
  });
});
