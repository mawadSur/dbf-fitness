import {
  canJoinLive,
  GRACE_DAYS,
  graceReminderCopy,
  shouldShowSubscriptionReminder,
  type SubscriptionInfo,
} from './state';

const info = (overrides: Partial<SubscriptionInfo> = {}): SubscriptionInfo => ({
  state: 'active',
  currentPeriodEnd: '2026-10-09T12:00:00.000Z',
  daysOverdue: 0,
  graceDaysLeft: 0,
  ...overrides,
});

describe('GRACE_DAYS', () => {
  // Product decision: a late payer keeps live-class access for 10 more days. The SQL counterpart
  // is public.subscription_grace_days(); the two must be changed together, never drift.
  it('is 10', () => {
    expect(GRACE_DAYS).toBe(10);
  });
});

describe('canJoinLive', () => {
  it('matches the ACCESS rule (active, grace, staff)', () => {
    expect(canJoinLive('active')).toBe(true);
    expect(canJoinLive('grace')).toBe(true);
    expect(canJoinLive('staff')).toBe(true);
    expect(canJoinLive('none')).toBe(false);
    expect(canJoinLive('expired')).toBe(false);
  });
});

describe('graceReminderCopy', () => {
  it('spells out the countdown for a member in grace', () => {
    expect(graceReminderCopy(info({ state: 'grace', daysOverdue: 3, graceDaysLeft: 7 }))).toEqual({
      title: 'Payment overdue',
      body: 'Your payment is 3 days overdue. Live-class access ends in 7 days — renew to keep joining.',
    });
  });

  it('uses the singular for one day, both halves', () => {
    expect(graceReminderCopy(info({ state: 'grace', daysOverdue: 1, graceDaysLeft: 9 })).body).toBe(
      'Your payment is 1 day overdue. Live-class access ends in 9 days — renew to keep joining.'
    );
    expect(graceReminderCopy(info({ state: 'grace', daysOverdue: 9, graceDaysLeft: 1 })).body).toBe(
      'Your payment is 9 days overdue. Live-class access ends in 1 day — renew to keep joining.'
    );
  });

  it('says "today" on the last day rather than "in 0 days"', () => {
    expect(graceReminderCopy(info({ state: 'grace', daysOverdue: GRACE_DAYS, graceDaysLeft: 0 })).body).toBe(
      'Your payment is 10 days overdue. Live-class access ends today — renew to keep joining.'
    );
  });

  it('has distinct copy for expired, none, staff and active', () => {
    const titles = (['expired', 'none', 'staff', 'active'] as const).map(
      (state) => graceReminderCopy(info({ state })).title
    );
    expect(titles).toEqual([
      'Subscription expired',
      'Subscription required',
      'Coach access',
      'Subscription active',
    ]);
    expect(new Set(titles).size).toBe(4);
  });

  it('never returns an empty title or body', () => {
    for (const state of ['none', 'active', 'grace', 'expired', 'staff'] as const) {
      const copy = graceReminderCopy(info({ state }));
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.body.length).toBeGreaterThan(0);
    }
  });
});

describe('shouldShowSubscriptionReminder', () => {
  it('nags only in grace', () => {
    expect(shouldShowSubscriptionReminder(info({ state: 'grace' }))).toBe(true);
    for (const state of ['none', 'active', 'expired', 'staff'] as const) {
      expect(shouldShowSubscriptionReminder(info({ state }))).toBe(false);
    }
  });
});
