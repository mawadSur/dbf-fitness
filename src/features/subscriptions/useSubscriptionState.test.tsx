import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { fetchSubscriptionState } from './api';
import type { SubscriptionInfo } from './state';
import { SUBSCRIPTION_STATE_QUERY_KEY, useSubscriptionState } from './useSubscriptionState';

jest.mock('./api', () => ({ fetchSubscriptionState: jest.fn() }));

const fetchMock = fetchSubscriptionState as jest.Mock;

const GRACE: SubscriptionInfo = {
  state: 'grace',
  currentPeriodEnd: '2026-09-16T12:00:00.000Z',
  daysOverdue: 3,
  graceDaysLeft: 7,
};

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

beforeEach(() => jest.clearAllMocks());

describe('useSubscriptionState', () => {
  it('exposes the fetched state under the shared query key', async () => {
    fetchMock.mockResolvedValue(GRACE);
    const client = newClient();

    const { result } = await renderHook(() => useSubscriptionState(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(GRACE);
    expect(client.getQueryData(SUBSCRIPTION_STATE_QUERY_KEY)).toEqual(GRACE);
  });

  it('surfaces an error instead of silently reporting no subscription', async () => {
    fetchMock.mockRejectedValue(new Error('rpc failed'));

    const { result } = await renderHook(() => useSubscriptionState(), { wrapper: wrapper(newClient()) });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('uses the documented query key', () => {
    expect(SUBSCRIPTION_STATE_QUERY_KEY).toEqual(['subscription', 'state']);
  });
});
