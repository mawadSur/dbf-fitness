import type { Coach } from '../../features/coaching/types';

export type CoachCardState = {
  /** Badge shown on the card. */
  availability: 'accepting' | 'not_accepting';
  isCurrent: boolean;
  /** A coach can be selected only when accepting members and not already the member's coach. */
  selectable: boolean;
  memberCountLabel: string;
};

export function memberCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'member' : 'members'}`;
}

export function coachCardState(coach: Coach, currentCoachId: string | null | undefined): CoachCardState {
  const isCurrent = !!currentCoachId && coach.coachId === currentCoachId;
  return {
    availability: coach.acceptingMembers ? 'accepting' : 'not_accepting',
    isCurrent,
    selectable: coach.acceptingMembers && !isCurrent,
    memberCountLabel: memberCountLabel(coach.memberCount),
  };
}

export function initialOf(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toUpperCase() : '?';
}

/** Title-cased subscription state label for the chip. */
export function subscriptionChip(state: string): { label: string; tone: 'good' | 'warn' | 'bad' | 'neutral' } {
  switch (state) {
    case 'active':
      return { label: 'Active', tone: 'good' };
    case 'grace':
      return { label: 'Payment overdue', tone: 'warn' };
    case 'expired':
      return { label: 'Expired', tone: 'bad' };
    case 'staff':
      return { label: 'Coach access', tone: 'neutral' };
    default:
      return { label: 'Not subscribed', tone: 'bad' };
  }
}
