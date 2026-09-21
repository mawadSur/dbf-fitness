import type { Coach } from '../../features/coaching/types';
import type { BadgeTone, IconName } from '../ui';

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

export type SubscriptionChip = { label: string; tone: BadgeTone; icon: IconName };

/**
 * The subscription state as the profile's status badge states it.
 *
 * The tone names are the design system's `BadgeTone`s, so the theme owns the colours, and every
 * state carries an ICON AND A WORD — status is never signalled by colour alone (design system §9).
 * A member in the grace window is told how many days are left, because that is the only number
 * that tells them how urgent this is.
 */
export function subscriptionChip(state: string, graceDaysLeft: number = 0): SubscriptionChip {
  switch (state) {
    case 'active':
      return { label: 'Active', tone: 'success', icon: 'check-circle' };
    case 'grace':
      return {
        label: graceDaysLeft > 0 ? `Payment overdue — ${dayCount(graceDaysLeft)} left` : 'Payment overdue',
        tone: 'warning',
        icon: 'alert-triangle',
      };
    case 'expired':
      return { label: 'Expired', tone: 'danger', icon: 'lock' };
    case 'staff':
      return { label: 'Coach access', tone: 'info', icon: 'shield' };
    default:
      return { label: 'Not subscribed', tone: 'danger', icon: 'lock' };
  }
}

function dayCount(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}
