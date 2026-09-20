import { supabase } from '../../services/supabase/client';
import { fetchSubscriptionState } from './api';

jest.mock('../../services/supabase/client', () => ({
  supabase: { rpc: jest.fn() },
}));

const rpc = supabase.rpc as unknown as jest.Mock;

beforeEach(() => rpc.mockReset());

describe('fetchSubscriptionState', () => {
  it('calls the get_subscription_state RPC and maps the single row', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          state: 'grace',
          current_period_end: '2026-09-16T12:00:00.000Z',
          days_overdue: 3,
          grace_days_left: 7,
        },
      ],
      error: null,
    });

    await expect(fetchSubscriptionState()).resolves.toEqual({
      state: 'grace',
      currentPeriodEnd: '2026-09-16T12:00:00.000Z',
      daysOverdue: 3,
      graceDaysLeft: 7,
    });
    expect(rpc).toHaveBeenCalledWith('get_subscription_state');
  });

  it('handles a bare object as well as a one-row array', async () => {
    rpc.mockResolvedValue({
      data: { state: 'active', current_period_end: null, days_overdue: 0, grace_days_left: 0 },
      error: null,
    });
    await expect(fetchSubscriptionState()).resolves.toEqual({
      state: 'active',
      currentPeriodEnd: null,
      daysOverdue: 0,
      graceDaysLeft: 0,
    });
  });

  it('fails closed to none for an empty result or an unknown state', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect((await fetchSubscriptionState()).state).toBe('none');

    rpc.mockResolvedValue({ data: [{ state: 'premium-forever' }], error: null });
    const info = await fetchSubscriptionState();
    expect(info).toEqual({ state: 'none', currentPeriodEnd: null, daysOverdue: 0, graceDaysLeft: 0 });
  });

  it('coerces non-numeric counters to 0 rather than rendering NaN', async () => {
    rpc.mockResolvedValue({ data: [{ state: 'grace', days_overdue: '3', grace_days_left: null }], error: null });
    const info = await fetchSubscriptionState();
    expect(info.daysOverdue).toBe(0);
    expect(info.graceDaysLeft).toBe(0);
  });

  it('propagates an RPC error instead of pretending the user has no subscription', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('network down') });
    await expect(fetchSubscriptionState()).rejects.toThrow('network down');
  });
});
