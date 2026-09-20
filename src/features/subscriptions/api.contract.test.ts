import { supabase } from '../../services/supabase/client';
import { fetchSubscriptionState } from './api';

jest.mock('../../services/supabase/client', () => ({
  supabase: { rpc: jest.fn(), from: jest.fn() },
}));

const rpc = supabase.rpc as unknown as jest.Mock;
const from = supabase.from as unknown as jest.Mock;

const NONE = { state: 'none', currentPeriodEnd: null, daysOverdue: 0, graceDaysLeft: 0 };

beforeEach(() => jest.clearAllMocks());

describe('subscriptions api contract', () => {
  it('reads entitlement ONLY through rpc get_subscription_state with no arguments (server decides identity)', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await fetchSubscriptionState();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]).toEqual(['get_subscription_state']);
    expect(from).not.toHaveBeenCalled();
  });

  it.each([
    ['empty array (rpc missing)', []],
    ['null', null],
    ['undefined', undefined],
  ])('fails closed to none for %s', async (_label, data) => {
    rpc.mockResolvedValue({ data, error: null });
    await expect(fetchSubscriptionState()).resolves.toEqual(NONE);
  });

  it('an unknown state string is downgraded to none, never passed through', async () => {
    rpc.mockResolvedValue({ data: [{ state: 'premium', current_period_end: 'x', days_overdue: 1, grace_days_left: 2 }], error: null });
    const info = await fetchSubscriptionState();
    expect(info.state).toBe('none');
  });

  it.each(['none', 'active', 'grace', 'expired', 'staff'])('accepts the canonical state %s', async (state) => {
    rpc.mockResolvedValue({ data: [{ state }], error: null });
    await expect(fetchSubscriptionState()).resolves.toMatchObject({ state });
  });

  it('non-number counters and non-string dates fall back to 0/null (no NaN or string leakage)', async () => {
    rpc.mockResolvedValue({
      data: [{ state: 'grace', current_period_end: 123, days_overdue: '3', grace_days_left: null }],
      error: null,
    });
    await expect(fetchSubscriptionState()).resolves.toEqual({
      state: 'grace',
      currentPeriodEnd: null,
      daysOverdue: 0,
      graceDaysLeft: 0,
    });
  });

  it('maps snake_case columns to the camelCase contract', async () => {
    rpc.mockResolvedValue({
      data: [{ state: 'grace', current_period_end: '2026-09-16T12:00:00Z', days_overdue: 3, grace_days_left: 7 }],
      error: null,
    });
    await expect(fetchSubscriptionState()).resolves.toEqual({
      state: 'grace',
      currentPeriodEnd: '2026-09-16T12:00:00Z',
      daysOverdue: 3,
      graceDaysLeft: 7,
    });
  });

  it('rethrows the rpc error unchanged instead of pretending there is no subscription', async () => {
    const error = { message: 'permission denied', code: '42501' };
    rpc.mockResolvedValue({ data: null, error });
    await expect(fetchSubscriptionState()).rejects.toBe(error);
  });
});
