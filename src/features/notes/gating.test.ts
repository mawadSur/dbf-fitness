import { notesGate } from './gating';

const info = (state: string) =>
  ({ state, currentPeriodEnd: null, daysOverdue: 0, graceDaysLeft: 0 }) as never;

describe('notesGate', () => {
  it('coaches are never gated', () => {
    expect(notesGate({ isCoach: true, info: info('expired'), loading: false })).toEqual({ kind: 'open' });
    expect(notesGate({ isCoach: true, info: undefined, loading: true })).toEqual({ kind: 'open' });
  });
  it('members: active/staff open, grace banner, expired/none blocked', () => {
    expect(notesGate({ isCoach: false, info: info('active'), loading: false }).kind).toBe('open');
    expect(notesGate({ isCoach: false, info: info('grace'), loading: false }).kind).toBe('grace');
    expect(notesGate({ isCoach: false, info: info('expired'), loading: false })).toEqual({
      kind: 'blocked',
      reason: 'expired',
    });
    expect(notesGate({ isCoach: false, info: info('none'), loading: false })).toEqual({
      kind: 'blocked',
      reason: 'none',
    });
  });
  it('holds while loading and opens when the lookup failed', () => {
    expect(notesGate({ isCoach: false, info: undefined, loading: true }).kind).toBe('checking');
    expect(notesGate({ isCoach: false, info: undefined, loading: false }).kind).toBe('open');
  });
});
