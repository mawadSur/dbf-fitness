import { graceBannerText, graceNoticeFacts, infoFromRtcSubscription, plural } from './graceCopy';

describe('plural', () => {
  it.each([
    [0, '0 days'],
    [1, '1 day'],
    [2, '2 days'],
    [10, '10 days'],
  ])('%i -> %s', (count, expected) => {
    expect(plural(count, 'day')).toBe(expected);
  });
});

describe('graceBannerText', () => {
  it.each([
    [10, 'Payment overdue — 10 days of access left'],
    [7, 'Payment overdue — 7 days of access left'],
    [2, 'Payment overdue — 2 days of access left'],
    [1, 'Payment overdue — 1 day of access left'],
    [0, 'Payment overdue — access ends today'],
  ])('%i days left', (graceDaysLeft, expected) => {
    expect(graceBannerText({ graceDaysLeft })).toBe(expected);
  });

  it('never claims negative days: an overrun clock reads as "ends today"', () => {
    expect(graceBannerText({ graceDaysLeft: -1 })).toBe('Payment overdue — access ends today');
  });
});

describe('graceNoticeFacts', () => {
  it.each([
    [{ daysOverdue: 0, graceDaysLeft: 10 }, ['0 days overdue', '10 days of access left']],
    [{ daysOverdue: 1, graceDaysLeft: 9 }, ['1 day overdue', '9 days of access left']],
    [{ daysOverdue: 3, graceDaysLeft: 1 }, ['3 days overdue', '1 day of access left']],
    [{ daysOverdue: 10, graceDaysLeft: 0 }, ['10 days overdue', 'Access ends today']],
  ])('%j', (input, expected) => {
    expect(graceNoticeFacts(input)).toEqual(expected);
  });
});

describe('infoFromRtcSubscription', () => {
  it('converts the server grace shape to the app SubscriptionInfo', () => {
    expect(infoFromRtcSubscription({ state: 'grace', days_overdue: 3, grace_days_left: 7 })).toEqual({
      state: 'grace',
      currentPeriodEnd: null,
      daysOverdue: 3,
      graceDaysLeft: 7,
    });
  });

  it.each(['active', 'staff'] as const)('keeps the %s state and zero counters', (state) => {
    expect(infoFromRtcSubscription({ state, days_overdue: 0, grace_days_left: 0 })).toEqual({
      state,
      currentPeriodEnd: null,
      daysOverdue: 0,
      graceDaysLeft: 0,
    });
  });
});
