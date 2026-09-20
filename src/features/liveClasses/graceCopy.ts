import type { SubscriptionInfo } from '../subscriptions/state';

export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** Persistent in-call banner text: "Payment overdue — 7 days of access left". */
export function graceBannerText(info: Pick<SubscriptionInfo, 'graceDaysLeft'>): string {
  return info.graceDaysLeft <= 0
    ? 'Payment overdue — access ends today'
    : `Payment overdue — ${plural(info.graceDaysLeft, 'day')} of access left`;
}

/** The two facts the pre-join notice spells out. */
export function graceNoticeFacts(info: Pick<SubscriptionInfo, 'daysOverdue' | 'graceDaysLeft'>): string[] {
  return [
    `${plural(info.daysOverdue, 'day')} overdue`,
    info.graceDaysLeft <= 0 ? 'Access ends today' : `${plural(info.graceDaysLeft, 'day')} of access left`,
  ];
}

/** Server-reported subscription (from agora-rtc-token) as the app's SubscriptionInfo. */
export function infoFromRtcSubscription(sub: {
  state: 'active' | 'grace' | 'staff';
  days_overdue: number;
  grace_days_left: number;
}): SubscriptionInfo {
  return {
    state: sub.state,
    currentPeriodEnd: null,
    daysOverdue: sub.days_overdue,
    graceDaysLeft: sub.grace_days_left,
  };
}
