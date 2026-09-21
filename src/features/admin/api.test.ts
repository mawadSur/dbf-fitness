import { supabase } from '../../services/supabase/client';
import {
  cancelSubscription,
  listReports,
  listSubscriptions,
  markPaid,
  removeFromGroup,
  reviewReport,
} from './api';

jest.mock('../../services/supabase/client', () => ({
  supabase: { rpc: jest.fn() },
}));

const rpc = supabase.rpc as unknown as jest.Mock;

beforeEach(() => rpc.mockReset());

describe('markPaid', () => {
  it('sends every parameter the RPC declares, with nulls for the omitted ones', async () => {
    rpc.mockResolvedValue({ data: [{ subscription_id: 's1', event_id: 'e1', applied: true }], error: null });

    await expect(markPaid({ memberId: 'm1', periodEnd: '2026-10-21T00:00:00.000Z' })).resolves.toEqual(
      { subscriptionId: 's1', eventId: 'e1', applied: true },
    );
    expect(rpc).toHaveBeenCalledWith('admin_mark_paid', {
      p_member: 'm1',
      p_new_period_end: '2026-10-21T00:00:00.000Z',
      p_note: null,
      p_amount_cents: null,
      p_currency: null,
      p_expected_previous_end: null,
      p_allow_backwards: false,
    });
  });

  it('passes the optimistic-concurrency and correction flags through', async () => {
    rpc.mockResolvedValue({ data: [{ subscription_id: 's1', event_id: 'e1', applied: true }], error: null });
    await markPaid({
      memberId: 'm1',
      periodEnd: '2026-10-21T00:00:00.000Z',
      note: 'cash',
      amountCents: 4900,
      currency: 'USD',
      expectedPreviousEnd: '2026-09-21T00:00:00.000Z',
      allowBackwards: true,
    });
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_expected_previous_end: '2026-09-21T00:00:00.000Z',
      p_allow_backwards: true,
      p_amount_cents: 4900,
      p_currency: 'USD',
    });
  });

  it('reports a replay as applied=false rather than an error', async () => {
    rpc.mockResolvedValue({ data: [{ subscription_id: 's1', event_id: 'e1', applied: false }], error: null });
    await expect(markPaid({ memberId: 'm1', periodEnd: 'x' })).resolves.toMatchObject({ applied: false });
  });

  it('fails closed when the server sends nothing usable', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(markPaid({ memberId: 'm1', periodEnd: 'x' })).resolves.toEqual({
      subscriptionId: null,
      eventId: null,
      applied: false,
    });
  });

  it('rethrows the raw error so the caller can map its code', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'period_backwards' } });
    await expect(markPaid({ memberId: 'm1', periodEnd: 'x' })).rejects.toMatchObject({
      message: 'period_backwards',
    });
  });
});

describe('cancelSubscription', () => {
  it('calls the cancel RPC and maps the result', async () => {
    rpc.mockResolvedValue({ data: [{ subscription_id: 's1', event_id: 'e2', applied: true }], error: null });
    await expect(cancelSubscription('m1', 'asked to stop')).resolves.toEqual({
      subscriptionId: 's1',
      eventId: 'e2',
      applied: true,
    });
    expect(rpc).toHaveBeenCalledWith('admin_cancel_subscription', {
      p_member: 'm1',
      p_note: 'asked to stop',
    });
  });
});

describe('listSubscriptions', () => {
  it('maps snake_case rows and defaults an unknown state to none', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          member_id: 'm1',
          full_name: 'Jordan',
          coach_id: 'c1',
          coach_name: 'Dana',
          status: 'past_due',
          current_period_end: '2026-09-18T00:00:00.000Z',
          cancel_at_period_end: false,
          provider: 'manual',
          state: 'grace',
          days_overdue: 3,
          grace_days_left: 7,
          updated_at: '2026-09-18T00:00:00.000Z',
        },
        { member_id: 'm2', state: 'who-knows', status: 'nonsense' },
      ],
      error: null,
    });

    const page = await listSubscriptions({ state: 'grace', afterMemberId: 'm0', limit: 10 });
    expect(page[0]).toMatchObject({
      memberId: 'm1',
      coachName: 'Dana',
      state: 'grace',
      status: 'past_due',
      daysOverdue: 3,
      graceDaysLeft: 7,
    });
    expect(page[1]).toMatchObject({ memberId: 'm2', state: 'none', status: null, daysOverdue: 0 });
    expect(rpc).toHaveBeenCalledWith('admin_list_subscriptions', {
      p_state: 'grace',
      p_after_member: 'm0',
      p_limit: 10,
    });
  });

  it('defaults to the first page of 50 with no filter', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await listSubscriptions();
    expect(rpc).toHaveBeenCalledWith('admin_list_subscriptions', {
      p_state: null,
      p_after_member: null,
      p_limit: 50,
    });
  });
});

describe('listReports', () => {
  it('defaults to the open queue and maps the joined names', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          id: 'r1',
          reporter_id: 'm1',
          reporter_name: 'Jordan',
          reported_user_id: 'm2',
          reported_name: 'Sam',
          reason: 'abuse',
          status: 'open',
          content_ref: 'group_message:1',
          resolved_by: null,
          resolved_at: null,
          resolution_note: null,
          created_at: '2026-09-20T00:00:00.000Z',
        },
      ],
      error: null,
    });
    await expect(listReports()).resolves.toEqual([
      {
        id: 'r1',
        reporterId: 'm1',
        reporterName: 'Jordan',
        reportedUserId: 'm2',
        reportedName: 'Sam',
        reason: 'abuse',
        status: 'open',
        contentRef: 'group_message:1',
        resolvedBy: null,
        resolvedAt: null,
        resolutionNote: null,
        createdAt: '2026-09-20T00:00:00.000Z',
      },
    ]);
    expect(rpc).toHaveBeenCalledWith('admin_list_reports', {
      p_status: 'open',
      p_after_created_at: null,
      p_after_id: null,
      p_limit: 30,
    });
  });

  it('splits the keyset cursor into the two RPC parameters', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await listReports({ status: 'all', after: { createdAt: '2026-09-20T00:00:00.000Z', id: 'r1' } });
    expect(rpc).toHaveBeenCalledWith('admin_list_reports', {
      p_status: 'all',
      p_after_created_at: '2026-09-20T00:00:00.000Z',
      p_after_id: 'r1',
      p_limit: 30,
    });
  });
});

describe('reviewReport', () => {
  it('sends the status and echoes the server result', async () => {
    rpc.mockResolvedValue({
      data: [{ report_id: 'r1', action_id: 'a1', status: 'actioned' }],
      error: null,
    });
    await expect(reviewReport('r1', 'actioned', 'warned')).resolves.toEqual({
      reportId: 'r1',
      actionId: 'a1',
      status: 'actioned',
    });
    expect(rpc).toHaveBeenCalledWith('review_report', {
      p_report: 'r1',
      p_status: 'actioned',
      p_note: 'warned',
    });
  });

  it('rethrows the accused-admin refusal', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'accused_cannot_review' } });
    await expect(reviewReport('r1', 'dismissed')).rejects.toMatchObject({
      message: 'accused_cannot_review',
    });
  });
});

describe('removeFromGroup', () => {
  it('reports removed=false when the membership had already gone', async () => {
    rpc.mockResolvedValue({ data: [{ removed: false, action_id: 'a2' }], error: null });
    await expect(removeFromGroup({ groupId: 'g1', memberId: 'm2' })).resolves.toEqual({
      removed: false,
      actionId: 'a2',
    });
    expect(rpc).toHaveBeenCalledWith('remove_from_group', {
      p_group: 'g1',
      p_member: 'm2',
      p_report: null,
      p_note: null,
    });
  });
});
