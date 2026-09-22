import { supabase } from '../../services/supabase/client';
import {
  fetchAttentionCounts,
  fetchMemberHistory,
  fetchRoster,
  fetchUnscoredCompletions,
  nextRosterCursor,
  snoozeMember,
} from './api';

jest.mock('../../services/supabase/client', () => ({
  supabase: { rpc: jest.fn() },
}));

const rpc = supabase.rpc as unknown as jest.Mock;
beforeEach(() => rpc.mockReset());

const ROSTER_ROW = {
  member_id: 'm-1',
  full_name: 'Jordan',
  subscription_state: 'grace',
  subscription_period_end: '2026-09-18T00:00:00.000Z',
  coach_assigned_at: '2026-08-01T00:00:00.000Z',
  plan_source: 'starter',
  needs_tailoring: true,
  has_plan: true,
  last_completed_at: '2026-09-19T10:00:00.000Z',
  completions_7d: 2,
  completions_30d: 9,
  streak: 3,
  unscored_count: 1,
  days_inactive: 2,
  status: 'starter',
  priority: 1,
  activity_at: '2026-09-19T10:00:00.000Z',
  snoozed_until: null,
};

describe('fetchRoster', () => {
  it('passes a null cursor on the first page and maps the row to camelCase', async () => {
    rpc.mockResolvedValue({ data: [ROSTER_ROW], error: null });

    const page = await fetchRoster();

    expect(rpc).toHaveBeenCalledWith('coach_roster', {
      p_coach: null,
      p_after_priority: null,
      p_after_activity: null,
      p_after_member: null,
      p_limit: 50,
    });
    expect(page[0]).toMatchObject({
      memberId: 'm-1',
      fullName: 'Jordan',
      subscriptionState: 'grace',
      planSource: 'starter',
      needsTailoring: true,
      hasPlan: true,
      completions7d: 2,
      completions30d: 9,
      streak: 3,
      unscoredCount: 1,
      daysInactive: 2,
      status: 'starter',
      priority: 1,
    });
  });

  it('sends the keyset cursor tuple, never an offset', async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    await fetchRoster({
      coachId: 'coach-9',
      after: { priority: 2, activityAt: '2026-09-01T00:00:00.000Z', memberId: 'm-7' },
      limit: 25,
    });

    expect(rpc).toHaveBeenCalledWith('coach_roster', {
      p_coach: 'coach-9',
      p_after_priority: 2,
      p_after_activity: '2026-09-01T00:00:00.000Z',
      p_after_member: 'm-7',
      p_limit: 25,
    });
  });

  it('fails closed on a row the server did not send in the agreed shape', async () => {
    rpc.mockResolvedValue({
      data: [{ member_id: 'm-2', status: 'bogus', priority: 99, subscription_state: 'weird' }],
      error: null,
    });

    const [row] = await fetchRoster();
    // Unknown status/priority degrade to the LEAST urgent bucket, so a server
    // change can never fabricate an alarm at the top of a coach's queue.
    expect(row.status).toBe('active');
    expect(row.priority).toBe(3);
    expect(row.subscriptionState).toBe('none');
    expect(row.hasPlan).toBe(false);
    expect(row.completions7d).toBe(0);
  });

  it('maps the gate error to coach-facing copy and keeps the driver error as cause', async () => {
    const error = { code: '42501', message: 'not_entitled' };
    rpc.mockResolvedValue({ data: null, error });

    await expect(fetchRoster()).rejects.toThrow('Only this member’s coach or an admin can see this.');
    await expect(fetchRoster()).rejects.toMatchObject({ cause: error });
  });

  it('falls back to friendlyError for a transport failure', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('Network request failed') });
    await expect(fetchRoster()).rejects.toThrow("Can't reach the server.");
  });
});

describe('nextRosterCursor', () => {
  it('returns the last row tuple while the page is full', () => {
    const rows = [
      { priority: 1 as const, activityAt: 'a', memberId: 'm-0' },
      { priority: 2 as const, activityAt: 'b', memberId: 'm-1' },
    ];
    expect(nextRosterCursor(rows as never, 2)).toEqual({
      priority: 2,
      activityAt: 'b',
      memberId: 'm-1',
    });
  });

  it('returns null on a short or empty page, so the list stops paging', () => {
    expect(nextRosterCursor([], 50)).toBeNull();
    expect(
      nextRosterCursor([{ priority: 0, activityAt: null, memberId: 'm-0' }] as never, 50),
    ).toBeNull();
  });
});

describe('fetchAttentionCounts', () => {
  it('maps every bucket and defaults a missing row to all zeros', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          no_plan: 3,
          starter_needs_tailoring: 1,
          unscored_sessions: 7,
          inactive_members: 2,
          pending_reports: 0,
          access_expiring: 4,
          total: 17,
        },
      ],
      error: null,
    });
    await expect(fetchAttentionCounts()).resolves.toEqual({
      noPlan: 3,
      starterNeedsTailoring: 1,
      unscoredSessions: 7,
      inactiveMembers: 2,
      pendingReports: 0,
      accessExpiring: 4,
      total: 17,
    });
    expect(rpc).toHaveBeenCalledWith('attention_counts', { p_coach: null });

    rpc.mockResolvedValue({ data: [], error: null });
    await expect(fetchAttentionCounts('coach-1')).resolves.toMatchObject({ total: 0 });
  });
});

describe('snoozeMember', () => {
  it('sends an ISO deadline and returns what the server stored', async () => {
    rpc.mockResolvedValue({ data: '2026-09-25T00:00:00.000Z', error: null });
    await expect(snoozeMember('m-1', new Date('2026-09-25T00:00:00.000Z'))).resolves.toBe(
      '2026-09-25T00:00:00.000Z',
    );
    expect(rpc).toHaveBeenCalledWith('snooze_member', {
      p_member: 'm-1',
      p_until: '2026-09-25T00:00:00.000Z',
    });
  });

  it('sends null to clear a snooze', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(snoozeMember('m-1', null)).resolves.toBeNull();
    expect(rpc).toHaveBeenCalledWith('snooze_member', { p_member: 'm-1', p_until: null });
  });

  it('explains the 14-day cap instead of showing the SQL error', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'snooze_too_long' } });
    await expect(snoozeMember('m-1', new Date())).rejects.toThrow(
      'You can snooze a member for at most 14 days.',
    );
  });

  it('distinguishes member_has_no_coach from member_not_found', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0002', message: 'member_has_no_coach' } });
    await expect(snoozeMember('m-1', new Date())).rejects.toThrow('has no coach yet');
  });
});

describe('fetchUnscoredCompletions', () => {
  it('maps the effort queue and pages by (completedAt, completionId)', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          completion_id: 'c-1',
          member_id: 'm-1',
          member_name: 'Jordan',
          day_number: 2,
          block_name: 'Upper',
          completed_at: '2026-09-20T08:00:00.000Z',
          effort_score: null,
        },
      ],
      error: null,
    });

    const [row] = await fetchUnscoredCompletions({
      after: { completedAt: '2026-09-21T00:00:00.000Z', completionId: 'c-0' },
      limit: 5,
    });

    expect(rpc).toHaveBeenCalledWith('unscored_completions', {
      p_after_completed_at: '2026-09-21T00:00:00.000Z',
      p_after_id: 'c-0',
      p_limit: 5,
    });
    expect(row).toEqual({
      completionId: 'c-1',
      memberId: 'm-1',
      memberName: 'Jordan',
      dayNumber: 2,
      blockName: 'Upper',
      completedAt: '2026-09-20T08:00:00.000Z',
      effortScore: null,
    });
  });
});

describe('fetchMemberHistory', () => {
  it('sends the member plus an optional cursor and maps snapshot columns', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          completion_id: 'c-9',
          completed_at: '2026-09-20T08:00:00.000Z',
          completed_local_date: '2026-09-20',
          day_number: 1,
          block_name: 'Legs',
          status: 'completed',
          effort_score: 7,
          exercises_logged: 4,
        },
      ],
      error: null,
    });

    const [row] = await fetchMemberHistory('m-1');

    expect(rpc).toHaveBeenCalledWith('member_history', {
      p_member: 'm-1',
      p_after_completed_at: null,
      p_limit: 30,
      p_after_id: null,
    });
    expect(row).toMatchObject({
      completionId: 'c-9',
      completedLocalDate: '2026-09-20',
      blockName: 'Legs',
      effortScore: 7,
      exercisesLogged: 4,
    });
  });

  it('refuses another coach member with copy, not a raw 42501', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'not_entitled' } });
    await expect(fetchMemberHistory('m-2')).rejects.toThrow('Only this member’s coach or an admin');
  });
});
