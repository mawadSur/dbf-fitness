import type { Coach } from '../../features/coaching/types';
import { coachCardState, memberCountLabel, subscriptionChip } from './coachCardState';

const coach = (over: Partial<Coach> = {}): Coach => ({
  coachId: 'c1',
  fullName: 'Dana Reyes',
  bio: null,
  specialties: [],
  acceptingMembers: true,
  memberCount: 3,
  ...over,
});

describe('coachCardState', () => {
  it('accepting and not current is selectable', () => {
    expect(coachCardState(coach(), null)).toMatchObject({ availability: 'accepting', isCurrent: false, selectable: true });
  });
  it('not accepting is not selectable', () => {
    expect(coachCardState(coach({ acceptingMembers: false }), null)).toMatchObject({
      availability: 'not_accepting',
      selectable: false,
    });
  });
  it('current coach is flagged and not selectable', () => {
    expect(coachCardState(coach(), 'c1')).toMatchObject({ isCurrent: true, selectable: false });
  });
  it('pluralizes member counts', () => {
    expect(memberCountLabel(1)).toBe('1 member');
    expect(memberCountLabel(0)).toBe('0 members');
  });
  it('maps every subscription state to a design-system badge tone', () => {
    expect(subscriptionChip('active')).toMatchObject({ label: 'Active', tone: 'success' });
    expect(subscriptionChip('grace').tone).toBe('warning');
    expect(subscriptionChip('expired')).toMatchObject({ label: 'Expired', tone: 'danger' });
    expect(subscriptionChip('staff')).toMatchObject({ label: 'Coach access', tone: 'info' });
    expect(subscriptionChip('none')).toMatchObject({ label: 'Not subscribed', tone: 'danger' });
  });
  it('carries an icon as well as a word, so status is never colour alone', () => {
    for (const state of ['active', 'grace', 'expired', 'staff', 'none']) {
      const chip = subscriptionChip(state);
      expect(chip.icon).toBeTruthy();
      expect(chip.label.length).toBeGreaterThan(0);
    }
  });
  it('tells a member in the grace window how long is left', () => {
    expect(subscriptionChip('grace', 7).label).toBe('Payment overdue — 7 days left');
    expect(subscriptionChip('grace', 1).label).toBe('Payment overdue — 1 day left');
    expect(subscriptionChip('grace', 0).label).toBe('Payment overdue');
  });
});
