import {
  canJoinLive,
  computeSubscriptionState,
  GRACE_DAYS,
  hasLiveAccessAt,
  selectEntitledMemberIds,
  type SubscriptionRecord,
} from './subscriptionState';

const NOW = new Date('2026-09-19T12:00:00.000Z');
const MS_PER_DAY = 86_400_000;
/** An ISO instant `days` days from NOW (negative = in the past); extraMs nudges the boundary. */
const at = (days: number, extraMs = 0) =>
  new Date(NOW.getTime() + days * MS_PER_DAY + extraMs).toISOString();

const sub = (status: string, currentPeriodEnd: string): SubscriptionRecord => ({
  status,
  current_period_end: currentPeriodEnd,
});

describe('GRACE_DAYS', () => {
  // The product decision is 10 days. Changing it must be a deliberate edit of this assertion and
  // of public.subscription_grace_days(), never a silent drift between the two.
  it('is the documented 10-day grace period', () => {
    expect(GRACE_DAYS).toBe(10);
  });
});

describe('canJoinLive', () => {
  it('allows active, grace and staff only', () => {
    expect(canJoinLive('active')).toBe(true);
    expect(canJoinLive('grace')).toBe(true);
    expect(canJoinLive('staff')).toBe(true);
    expect(canJoinLive('none')).toBe(false);
    expect(canJoinLive('expired')).toBe(false);
  });
});

describe('computeSubscriptionState', () => {
  it('is staff for a coach or admin, with no row needed', () => {
    expect(computeSubscriptionState(null, true, NOW)).toEqual({
      state: 'staff',
      currentPeriodEnd: null,
      daysOverdue: 0,
      graceDaysLeft: 0,
    });
  });

  it('is staff even when the staff member has a long-expired row', () => {
    expect(computeSubscriptionState(sub('canceled', at(-400)), true, NOW).state).toBe('staff');
  });

  it('is none without a row', () => {
    expect(computeSubscriptionState(null, false, NOW)).toEqual({
      state: 'none',
      currentPeriodEnd: null,
      daysOverdue: 0,
      graceDaysLeft: 0,
    });
  });

  it('is active while the paid period runs, whatever the status', () => {
    for (const status of ['active', 'past_due', 'canceled']) {
      expect(computeSubscriptionState(sub(status, at(20)), false, NOW).state).toBe('active');
    }
  });

  it('is active at the exact period end (inclusive)', () => {
    expect(computeSubscriptionState(sub('active', at(0)), false, NOW).state).toBe('active');
  });

  it('is grace one millisecond after the period end', () => {
    expect(computeSubscriptionState(sub('past_due', at(0, -1)), false, NOW).state).toBe('grace');
  });

  it('reports whole days overdue and days of grace left', () => {
    expect(computeSubscriptionState(sub('past_due', at(-3)), false, NOW)).toEqual({
      state: 'grace',
      currentPeriodEnd: at(-3),
      daysOverdue: 3,
      graceDaysLeft: 7,
    });
  });

  it('rounds days_overdue down and grace_days_left up for a part-day', () => {
    const info = computeSubscriptionState(sub('past_due', at(-3.5)), false, NOW);
    expect(info.daysOverdue).toBe(3);
    expect(info.graceDaysLeft).toBe(7);
  });

  it('is still grace at exactly period_end + GRACE_DAYS (inclusive boundary)', () => {
    const info = computeSubscriptionState(sub('past_due', at(-GRACE_DAYS)), false, NOW);
    expect(info.state).toBe('grace');
    expect(info.daysOverdue).toBe(GRACE_DAYS);
    expect(info.graceDaysLeft).toBe(0);
  });

  it('is expired one second past the grace boundary', () => {
    expect(computeSubscriptionState(sub('past_due', at(-GRACE_DAYS, -1000)), false, NOW).state).toBe(
      'expired'
    );
  });

  it('gives a canceled subscription no grace at all', () => {
    expect(computeSubscriptionState(sub('canceled', at(0, -1)), false, NOW).state).toBe('expired');
    expect(computeSubscriptionState(sub('canceled', at(-1)), false, NOW).state).toBe('expired');
  });

  it('fails closed on an unparsable period end', () => {
    expect(computeSubscriptionState(sub('active', 'not-a-date'), false, NOW).state).toBe('none');
  });
});

describe('hasLiveAccessAt', () => {
  it('matches canJoinLive over the whole state machine', () => {
    expect(hasLiveAccessAt(sub('active', at(20)), false, NOW)).toBe(true);
    expect(hasLiveAccessAt(sub('past_due', at(-3)), false, NOW)).toBe(true);
    expect(hasLiveAccessAt(sub('past_due', at(-GRACE_DAYS)), false, NOW)).toBe(true);
    expect(hasLiveAccessAt(sub('past_due', at(-GRACE_DAYS, -1000)), false, NOW)).toBe(false);
    expect(hasLiveAccessAt(sub('canceled', at(-1)), false, NOW)).toBe(false);
    expect(hasLiveAccessAt(null, false, NOW)).toBe(false);
    expect(hasLiveAccessAt(null, true, NOW)).toBe(true);
  });
});

describe('selectEntitledMemberIds', () => {
  it('keeps active, grace and staff, drops none and expired', () => {
    expect(
      selectEntitledMemberIds(
        [
          { member_id: 'jordan', role: 'member', subscription: sub('active', at(20)) },
          { member_id: 'sam', role: 'member', subscription: sub('past_due', at(-3)) },
          { member_id: 'riley', role: 'member', subscription: sub('past_due', at(-30)) },
          { member_id: 'nosub', role: 'member', subscription: null },
          { member_id: 'dana', role: 'coach' },
          { member_id: 'cancelled-future', role: 'member', subscription: sub('canceled', at(5)) },
          { member_id: 'cancelled-past', role: 'member', subscription: sub('canceled', at(-2)) },
        ],
        NOW
      )
    ).toEqual(['jordan', 'sam', 'dana', 'cancelled-future']);
  });

  it('returns nothing for an empty roster', () => {
    expect(selectEntitledMemberIds([], NOW)).toEqual([]);
  });
});
