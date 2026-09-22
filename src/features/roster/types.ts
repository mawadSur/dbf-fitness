/**
 * Shapes returned by the D1c roster / attention RPCs
 * (migration 20260921120000_roster_attention.sql).
 *
 * Every list RPC is keyset paginated: the server sorts by an explicit tuple and
 * the client echoes the LAST row's tuple back as the cursor. Offsets are never
 * used, so a roster that changes between pages cannot duplicate or skip a member.
 */

/** Why a member is in the queue. Ordered worst-first, same order as `priority`. */
export type RosterStatus = 'no_plan' | 'starter' | 'inactive' | 'active';

/** 0 no plan, 1 untailored starter, 2 inactive (72 h), 3 active. Snoozed members sort as 3. */
export type RosterPriority = 0 | 1 | 2 | 3;

export type SubscriptionStateName = 'none' | 'active' | 'grace' | 'expired' | 'staff';

export type RosterMember = {
  memberId: string;
  fullName: string | null;
  subscriptionState: SubscriptionStateName;
  subscriptionPeriodEnd: string | null;
  coachAssignedAt: string | null;
  planSource: string | null;
  needsTailoring: boolean;
  hasPlan: boolean;
  lastCompletedAt: string | null;
  completions7d: number;
  completions30d: number;
  streak: number;
  unscoredCount: number;
  daysInactive: number;
  status: RosterStatus;
  priority: RosterPriority;
  /** Sort key: the later of (last completion, coach assignment). Never null. */
  activityAt: string | null;
  snoozedUntil: string | null;
};

/** The cursor for the next roster page: the last row's (priority, activityAt, memberId). */
export type RosterCursor = {
  priority: RosterPriority;
  activityAt: string | null;
  memberId: string;
};

export type AttentionCounts = {
  noPlan: number;
  starterNeedsTailoring: number;
  unscoredSessions: number;
  inactiveMembers: number;
  /** Admin only; 0 for a coach. */
  pendingReports: number;
  accessExpiring: number;
  total: number;
};

export type UnscoredCompletion = {
  completionId: string;
  memberId: string;
  memberName: string | null;
  dayNumber: number | null;
  blockName: string | null;
  completedAt: string | null;
  effortScore: number | null;
};

/** The effort queue's cursor: the last row's (completedAt, completionId). */
export type CompletionCursor = {
  completedAt: string | null;
  completionId: string;
};

export type MemberHistoryEntry = {
  completionId: string;
  completedAt: string | null;
  completedLocalDate: string | null;
  dayNumber: number | null;
  blockName: string | null;
  status: string | null;
  effortScore: number | null;
  exercisesLogged: number;
};

export const ROSTER_STATUSES: readonly RosterStatus[] = [
  'no_plan',
  'starter',
  'inactive',
  'active',
];

export const SUBSCRIPTION_STATE_NAMES: readonly SubscriptionStateName[] = [
  'none',
  'active',
  'grace',
  'expired',
  'staff',
];
