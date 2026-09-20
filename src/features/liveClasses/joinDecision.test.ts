import type { SubscriptionInfo, SubscriptionState } from '../subscriptions/state';
import { canAttemptJoin, canOpenClassFromList, decideJoin, type JoinDecisionInput } from './joinDecision';

const sub = (state: SubscriptionState): SubscriptionInfo => ({
  state,
  currentPeriodEnd: null,
  daysOverdue: state === 'grace' ? 3 : 0,
  graceDaysLeft: state === 'grace' ? 7 : 0,
});

const base: JoinDecisionInput = { classStatus: 'scheduled', signedIn: true, subscription: sub('active'), denial: null };
const decide = (over: Partial<JoinDecisionInput>) => decideJoin({ ...base, ...over });

describe('decideJoin', () => {
  it('allows active and staff', () => {
    expect(decide({}).kind).toBe('allowed');
    expect(decide({ subscription: sub('staff') }).kind).toBe('allowed');
    expect(decide({ classStatus: 'live' }).kind).toBe('allowed');
  });

  it('asks for the grace notice for a late payer', () => {
    const decision = decide({ subscription: sub('grace') });
    expect(decision).toEqual({ kind: 'needs-grace-notice' });
    expect(canAttemptJoin(decision)).toBe(true);
  });

  it('blocks expired and none with distinct reasons', () => {
    expect(decide({ subscription: sub('expired') })).toEqual({ kind: 'blocked', reason: 'expired' });
    expect(decide({ subscription: sub('none') })).toEqual({ kind: 'blocked', reason: 'required' });
    expect(canAttemptJoin(decide({ subscription: sub('none') }))).toBe(false);
  });

  it('treats an unknown subscription as allowed: the server decides at join time', () => {
    expect(decide({ subscription: null }).kind).toBe('allowed');
  });

  it('lets the server denial override an optimistic client state', () => {
    expect(decide({ denial: 'subscription_required' })).toEqual({ kind: 'blocked', reason: 'required' });
    expect(decide({ denial: 'subscription_required', subscription: sub('expired') })).toEqual({
      kind: 'blocked',
      reason: 'expired',
    });
    expect(decide({ denial: 'not_entitled' })).toEqual({ kind: 'server-denied', reason: 'not_entitled' });
    expect(decide({ denial: 'class_not_joinable' })).toEqual({ kind: 'closed', reason: 'ended' });
    expect(decide({ denial: 'class_not_found' })).toEqual({ kind: 'closed', reason: 'not_found' });
    expect(decide({ denial: 'unauthorized' })).toEqual({ kind: 'reauth' });
  });

  it('closes ended and cancelled classes regardless of subscription', () => {
    expect(decide({ classStatus: 'ended' })).toEqual({ kind: 'closed', reason: 'ended' });
    expect(decide({ classStatus: 'cancelled', subscription: sub('grace') })).toEqual({
      kind: 'closed',
      reason: 'cancelled',
    });
  });

  it('reports signed-out', () => {
    expect(decide({ signedIn: false })).toEqual({ kind: 'signed-out' });
  });
});

describe('canOpenClassFromList', () => {
  it.each([
    ['active', true],
    ['grace', true],
    ['staff', true],
    ['expired', false],
    ['none', false],
  ] as const)('%s -> %s', (state, expected) => {
    expect(canOpenClassFromList(sub(state))).toBe(expected);
  });
  it('is true while unknown', () => expect(canOpenClassFromList(null)).toBe(true));
});
