import type { Coach } from '../../features/coaching/types';
import { coachCardState, initialOf, memberCountLabel, subscriptionChip } from './coachCardState';

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
  it('initialOf handles empty and unicode names', () => {
    expect(initialOf('  dana')).toBe('D');
    expect(initialOf('')).toBe('?');
  });
  it('maps every subscription state to a chip', () => {
    expect(subscriptionChip('active').tone).toBe('good');
    expect(subscriptionChip('grace').tone).toBe('warn');
    expect(subscriptionChip('expired').tone).toBe('bad');
    expect(subscriptionChip('staff').tone).toBe('neutral');
    expect(subscriptionChip('none').label).toBe('Not subscribed');
  });
});
