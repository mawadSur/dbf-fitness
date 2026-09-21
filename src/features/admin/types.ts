// Row shapes returned by the admin RPCs, in camelCase for the UI layer.
// The SQL contract lives in supabase/migrations/20260921130000_admin_payments.sql
// and 20260921131000_moderation_admin.sql.

import type { SubscriptionState } from '../subscriptions/state';

/** Result of admin_mark_paid / admin_cancel_subscription. */
export type MarkPaidResult = {
  subscriptionId: string | null;
  eventId: string | null;
  /** false when the call was a replay of one already recorded -- not an error. */
  applied: boolean;
};

/** One row of admin_list_subscriptions. */
export type AdminSubscriptionRow = {
  memberId: string;
  fullName: string | null;
  coachId: string | null;
  coachName: string | null;
  /** Raw provider status; null when the member has no subscription row yet. */
  status: 'active' | 'past_due' | 'canceled' | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  provider: string | null;
  /** Computed entitlement, from the same SQL the app uses everywhere else. */
  state: SubscriptionState;
  daysOverdue: number;
  graceDaysLeft: number;
  updatedAt: string | null;
};

export type ReportStatus = 'open' | 'reviewed' | 'dismissed' | 'actioned';
export type ReportStatusFilter = ReportStatus | 'all';

/** One row of admin_list_reports. */
export type AdminReportRow = {
  id: string;
  reporterId: string | null;
  reporterName: string | null;
  reportedUserId: string | null;
  reportedName: string | null;
  reason: string;
  status: ReportStatus;
  contentRef: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  createdAt: string;
};

/** Keyset cursor for admin_list_reports: the last row of the previous page. */
export type ReportCursor = { createdAt: string; id: string };

export type ReviewReportResult = {
  reportId: string;
  actionId: string | null;
  status: ReportStatus;
};

export type RemoveFromGroupResult = {
  /** false when the membership was already gone; the action is audited either way. */
  removed: boolean;
  actionId: string | null;
};
