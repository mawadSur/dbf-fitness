/**
 * Typed wrappers for the D1c roster / attention RPCs
 * (supabase/migrations/20260921120000_roster_attention.sql).
 *
 * Contract:
 *   coach_roster(p_coach, p_after_priority, p_after_activity, p_after_member, p_limit)
 *   attention_counts(p_coach)
 *   snooze_member(p_member, p_until)              -> timestamptz | null
 *   unscored_completions(p_after_completed_at, p_after_id, p_limit)
 *   member_history(p_member, p_after_completed_at, p_limit, p_after_id)
 *
 * Errors (raised in the function body, never an RLS leak):
 *   42501 'not_entitled'         — not this roster's coach, not an admin, signed out
 *   P0002 'member_not_found' / 'member_has_no_coach'
 *   22023 'snooze_too_long'      — more than 14 days
 * Every wrapper rethrows an Error whose message is coach-facing copy
 * (src/features/roster/errors.ts) with the raw driver error kept as `cause`.
 */

import { supabase } from '../../services/supabase/client';
import {
  ATTENTION_FALLBACK,
  EFFORT_QUEUE_FALLBACK,
  MEMBER_HISTORY_FALLBACK,
  ROSTER_FALLBACK,
  SNOOZE_FALLBACK,
  rosterErrorMessage,
} from './errors';
import {
  ROSTER_STATUSES,
  SUBSCRIPTION_STATE_NAMES,
  type AttentionCounts,
  type MemberHistoryEntry,
  type RosterCursor,
  type RosterMember,
  type RosterPriority,
  type RosterStatus,
  type SubscriptionStateName,
  type UnscoredCompletion,
} from './types';

type Row = Record<string, unknown>;

function rows(data: unknown): Row[] {
  if (Array.isArray(data)) return data.filter((r): r is Row => typeof r === 'object' && r !== null);
  if (typeof data === 'object' && data !== null) return [data as Row];
  return [];
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const nullableNum = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/** Rethrows with coach-facing copy; the driver error stays reachable as `cause`. */
function fail(error: unknown, fallback: string): never {
  throw new Error(rosterErrorMessage(error, fallback), { cause: error });
}

function toStatus(v: unknown): RosterStatus {
  return ROSTER_STATUSES.includes(v as RosterStatus) ? (v as RosterStatus) : 'active';
}

function toPriority(v: unknown): RosterPriority {
  const n = num(v);
  return n === 0 || n === 1 || n === 2 || n === 3 ? (n as RosterPriority) : 3;
}

function toSubscriptionState(v: unknown): SubscriptionStateName {
  return SUBSCRIPTION_STATE_NAMES.includes(v as SubscriptionStateName)
    ? (v as SubscriptionStateName)
    : 'none';
}

function toRosterMember(row: Row): RosterMember {
  return {
    memberId: str(row.member_id) ?? '',
    fullName: str(row.full_name),
    subscriptionState: toSubscriptionState(row.subscription_state),
    subscriptionPeriodEnd: str(row.subscription_period_end),
    coachAssignedAt: str(row.coach_assigned_at),
    planSource: str(row.plan_source),
    needsTailoring: row.needs_tailoring === true,
    hasPlan: row.has_plan === true,
    lastCompletedAt: str(row.last_completed_at),
    completions7d: num(row.completions_7d),
    completions30d: num(row.completions_30d),
    streak: num(row.streak),
    unscoredCount: num(row.unscored_count),
    daysInactive: num(row.days_inactive),
    status: toStatus(row.status),
    priority: toPriority(row.priority),
    activityAt: str(row.activity_at),
    snoozedUntil: str(row.snoozed_until),
  };
}

export async function fetchRoster(options?: {
  coachId?: string | null;
  after?: RosterCursor | null;
  limit?: number;
}): Promise<RosterMember[]> {
  const after = options?.after ?? null;
  const { data, error } = await supabase.rpc('coach_roster', {
    p_coach: options?.coachId ?? null,
    p_after_priority: after?.priority ?? null,
    p_after_activity: after?.activityAt ?? null,
    p_after_member: after?.memberId ?? null,
    p_limit: options?.limit ?? 50,
  });
  if (error) fail(error, ROSTER_FALLBACK);
  return rows(data).map(toRosterMember);
}

/** The cursor to pass as `after` for the next page, or null when the page was the last one. */
export function nextRosterCursor(page: RosterMember[], limit = 50): RosterCursor | null {
  if (page.length < limit || page.length === 0) return null;
  const last = page[page.length - 1];
  return { priority: last.priority, activityAt: last.activityAt, memberId: last.memberId };
}

const NO_COUNTS: AttentionCounts = {
  noPlan: 0,
  starterNeedsTailoring: 0,
  unscoredSessions: 0,
  inactiveMembers: 0,
  pendingReports: 0,
  accessExpiring: 0,
  total: 0,
};

export async function fetchAttentionCounts(coachId?: string | null): Promise<AttentionCounts> {
  const { data, error } = await supabase.rpc('attention_counts', { p_coach: coachId ?? null });
  if (error) fail(error, ATTENTION_FALLBACK);
  const row = rows(data)[0];
  if (!row) return NO_COUNTS;
  return {
    noPlan: num(row.no_plan),
    starterNeedsTailoring: num(row.starter_needs_tailoring),
    unscoredSessions: num(row.unscored_sessions),
    inactiveMembers: num(row.inactive_members),
    pendingReports: num(row.pending_reports),
    accessExpiring: num(row.access_expiring),
    total: num(row.total),
  };
}

/** `until` of null clears the snooze. Returns the deadline the server stored. */
export async function snoozeMember(memberId: string, until: Date | string | null): Promise<string | null> {
  const iso = until == null ? null : until instanceof Date ? until.toISOString() : until;
  const { data, error } = await supabase.rpc('snooze_member', {
    p_member: memberId,
    p_until: iso,
  });
  if (error) fail(error, SNOOZE_FALLBACK);
  return typeof data === 'string' ? data : null;
}

export async function fetchUnscoredCompletions(options?: {
  after?: { completedAt: string | null; completionId: string } | null;
  limit?: number;
}): Promise<UnscoredCompletion[]> {
  const after = options?.after ?? null;
  const { data, error } = await supabase.rpc('unscored_completions', {
    p_after_completed_at: after?.completedAt ?? null,
    p_after_id: after?.completionId ?? null,
    p_limit: options?.limit ?? 20,
  });
  if (error) fail(error, EFFORT_QUEUE_FALLBACK);
  return rows(data).map((row) => ({
    completionId: str(row.completion_id) ?? '',
    memberId: str(row.member_id) ?? '',
    memberName: str(row.member_name),
    dayNumber: nullableNum(row.day_number),
    blockName: str(row.block_name),
    completedAt: str(row.completed_at),
    effortScore: nullableNum(row.effort_score),
  }));
}

export async function fetchMemberHistory(
  memberId: string,
  options?: { after?: { completedAt: string | null; completionId?: string } | null; limit?: number },
): Promise<MemberHistoryEntry[]> {
  const after = options?.after ?? null;
  const { data, error } = await supabase.rpc('member_history', {
    p_member: memberId,
    p_after_completed_at: after?.completedAt ?? null,
    p_limit: options?.limit ?? 30,
    p_after_id: after?.completionId ?? null,
  });
  if (error) fail(error, MEMBER_HISTORY_FALLBACK);
  return rows(data).map((row) => ({
    completionId: str(row.completion_id) ?? '',
    completedAt: str(row.completed_at),
    completedLocalDate: str(row.completed_local_date),
    dayNumber: nullableNum(row.day_number),
    blockName: str(row.block_name),
    status: str(row.status),
    effortScore: nullableNum(row.effort_score),
    exercisesLogged: num(row.exercises_logged),
  }));
}
