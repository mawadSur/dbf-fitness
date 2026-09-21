// Typed wrappers over the admin-only RPCs. No screens use these yet (the owner
// console is a later ticket); they exist so the UI lane has one contract to
// build against and so the mapping is unit-tested before any screen exists.
//
// Every function throws on failure. Screens should render
// adminErrorMessage(error, '<screen fallback>') from ./errors.

import { supabase } from '../../services/supabase/client';
import type { SubscriptionState } from '../subscriptions/state';
import type {
  AdminReportRow,
  AdminSubscriptionRow,
  MarkPaidResult,
  RemoveFromGroupResult,
  ReportCursor,
  ReportStatus,
  ReportStatusFilter,
  ReviewReportResult,
} from './types';

const STATES: readonly SubscriptionState[] = ['none', 'active', 'grace', 'expired', 'staff'];
const REPORT_STATUSES: readonly ReportStatus[] = ['open', 'reviewed', 'dismissed', 'actioned'];

type Row = Record<string, unknown>;

function rows(data: unknown): Row[] {
  if (Array.isArray(data)) return data.filter((r): r is Row => !!r && typeof r === 'object');
  if (data && typeof data === 'object') return [data as Row];
  return [];
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function toMarkPaidResult(data: unknown): MarkPaidResult {
  const row = rows(data)[0] ?? {};
  return {
    subscriptionId: str(row.subscription_id),
    eventId: str(row.event_id),
    // Fails closed: an unreadable response is never reported as "applied".
    applied: row.applied === true,
  };
}

/**
 * Record an out-of-app payment. `periodEnd` is an ABSOLUTE ISO timestamp (the
 * date the member is paid until), never a duration -- a double submit is then a
 * no-op rather than a second month. Replays come back with applied=false.
 *
 * Errors: admin_required / mfa_required, member_not_found, stale_subscription
 * (pass `expectedPreviousEnd` to get it), period_backwards, period_out_of_bounds.
 */
export async function markPaid(input: {
  memberId: string;
  periodEnd: string;
  note?: string | null;
  amountCents?: number | null;
  currency?: string | null;
  expectedPreviousEnd?: string | null;
  allowBackwards?: boolean;
}): Promise<MarkPaidResult> {
  const { data, error } = await supabase.rpc('admin_mark_paid', {
    p_member: input.memberId,
    p_new_period_end: input.periodEnd,
    p_note: input.note ?? null,
    p_amount_cents: input.amountCents ?? null,
    p_currency: input.currency ?? null,
    p_expected_previous_end: input.expectedPreviousEnd ?? null,
    p_allow_backwards: input.allowBackwards ?? false,
  });
  if (error) throw error;
  return toMarkPaidResult(data);
}

/**
 * Cancel a subscription. Access is NOT revoked: the member keeps it until the
 * current period end (and a canceled subscription then gets no grace period).
 */
export async function cancelSubscription(
  memberId: string,
  note?: string | null,
): Promise<MarkPaidResult> {
  const { data, error } = await supabase.rpc('admin_cancel_subscription', {
    p_member: memberId,
    p_note: note ?? null,
  });
  if (error) throw error;
  return toMarkPaidResult(data);
}

function toSubscriptionRow(row: Row): AdminSubscriptionRow {
  const status = str(row.status);
  return {
    memberId: str(row.member_id) ?? '',
    fullName: str(row.full_name),
    coachId: str(row.coach_id),
    coachName: str(row.coach_name),
    status:
      status === 'active' || status === 'past_due' || status === 'canceled' ? status : null,
    currentPeriodEnd: str(row.current_period_end),
    cancelAtPeriodEnd: row.cancel_at_period_end === true,
    provider: str(row.provider),
    state: STATES.includes(row.state as SubscriptionState)
      ? (row.state as SubscriptionState)
      : 'none',
    daysOverdue: num(row.days_overdue),
    graceDaysLeft: num(row.grace_days_left),
    updatedAt: str(row.updated_at),
  };
}

/**
 * One keyset page of members and their computed subscription state, ordered by
 * member id. Pass the last row's `memberId` as `afterMemberId` for the next page.
 */
export async function listSubscriptions(options?: {
  state?: SubscriptionState | null;
  afterMemberId?: string | null;
  limit?: number;
}): Promise<AdminSubscriptionRow[]> {
  const { data, error } = await supabase.rpc('admin_list_subscriptions', {
    p_state: options?.state ?? null,
    p_after_member: options?.afterMemberId ?? null,
    p_limit: options?.limit ?? 50,
  });
  if (error) throw error;
  return rows(data).map(toSubscriptionRow);
}

function toReportRow(row: Row): AdminReportRow {
  const status = str(row.status);
  return {
    id: str(row.id) ?? '',
    reporterId: str(row.reporter_id),
    reporterName: str(row.reporter_name),
    reportedUserId: str(row.reported_user_id),
    reportedName: str(row.reported_name),
    reason: str(row.reason) ?? '',
    status: REPORT_STATUSES.includes(status as ReportStatus) ? (status as ReportStatus) : 'open',
    contentRef: str(row.content_ref),
    resolvedBy: str(row.resolved_by),
    resolvedAt: str(row.resolved_at),
    resolutionNote: str(row.resolution_note),
    createdAt: str(row.created_at) ?? '',
  };
}

/**
 * One keyset page of the moderation queue, newest first. Pass the last row's
 * `{ createdAt, id }` as `after` for the next page. Reports filed against the
 * calling admin are never returned.
 */
export async function listReports(options?: {
  status?: ReportStatusFilter;
  after?: ReportCursor | null;
  limit?: number;
}): Promise<AdminReportRow[]> {
  const { data, error } = await supabase.rpc('admin_list_reports', {
    p_status: options?.status ?? 'open',
    p_after_created_at: options?.after?.createdAt ?? null,
    p_after_id: options?.after?.id ?? null,
    p_limit: options?.limit ?? 30,
  });
  if (error) throw error;
  return rows(data).map(toReportRow);
}

/** Resolve a report and append the audit row. An admin cannot resolve a report about themselves. */
export async function reviewReport(
  reportId: string,
  status: Exclude<ReportStatus, 'open'>,
  note?: string | null,
): Promise<ReviewReportResult> {
  const { data, error } = await supabase.rpc('review_report', {
    p_report: reportId,
    p_status: status,
    p_note: note ?? null,
  });
  if (error) throw error;
  const row = rows(data)[0] ?? {};
  const returned = str(row.status);
  return {
    reportId: str(row.report_id) ?? reportId,
    actionId: str(row.action_id),
    status: REPORT_STATUSES.includes(returned as ReportStatus)
      ? (returned as ReportStatus)
      : status,
  };
}

/**
 * Remove a member from a group as a moderation action. `removed` is false when
 * the membership had already gone; the action is audited either way.
 */
export async function removeFromGroup(input: {
  groupId: string;
  memberId: string;
  reportId?: string | null;
  note?: string | null;
}): Promise<RemoveFromGroupResult> {
  const { data, error } = await supabase.rpc('remove_from_group', {
    p_group: input.groupId,
    p_member: input.memberId,
    p_report: input.reportId ?? null,
    p_note: input.note ?? null,
  });
  if (error) throw error;
  const row = rows(data)[0] ?? {};
  return { removed: row.removed === true, actionId: str(row.action_id) };
}
