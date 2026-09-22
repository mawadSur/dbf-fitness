-- D1c — coach roster, attention queue and effort (unscored) queue.
--
-- The gap this closes: a coach with 200 members had no way to see WHO needs
-- them. Everything the coach dashboard needs is computed here, server side,
-- in ONE set-based query per call (no per-member round trip), keyset
-- paginated so a long roster pages without dupes or skips, and gated in the
-- function body (caller is the coach whose roster it is, or an admin).
--
-- Ordering contract for coach_roster: (priority asc, activity_at asc,
-- member_id asc). The cursor is exactly that tuple — the client echoes the
-- last row's priority / activity_at / member_id back as
-- p_after_priority / p_after_activity / p_after_member.

begin;

-- ---------------------------------------------------------------------------
-- 1. subscription_state_calc — the subscription state machine as a pure
--    expression, so a roster page can compute 50 states inside one query
--    instead of calling the per-member subscription_state_row() 50 times.
--
--    This MIRRORS public.subscription_state_row() (20260919150000) exactly:
--    staff -> none -> active -> grace (inclusive 10-day boundary, only for
--    status active/past_due) -> expired. It deliberately holds no visibility
--    check: it is a calculator over values its CALLER already read under its
--    own authorization gate. pgTAP 29 asserts parity with
--    subscription_state_row() over the full matrix.
-- ---------------------------------------------------------------------------

create or replace function public.subscription_state_calc(
  p_role        text,
  p_status      text,
  p_period_end  timestamptz,
  p_now         timestamptz default now()
)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when p_role in ('coach', 'admin') then 'staff'
    when p_period_end is null then 'none'
    when p_now <= p_period_end then 'active'
    when p_now <= p_period_end + make_interval(days => public.subscription_grace_days())
         and p_status in ('active', 'past_due') then 'grace'
    else 'expired'
  end;
$$;

comment on function public.subscription_state_calc(text, text, timestamptz, timestamptz) is
  'Pure set-based mirror of subscription_state_row()''s state machine '
  '(staff/none/active/grace/expired). Takes values the caller already read; '
  'holds no visibility check of its own. Used by the roster/attention RPCs.';

revoke all on function public.subscription_state_calc(text, text, timestamptz, timestamptz) from public;

-- ---------------------------------------------------------------------------
-- 2. attention_snoozes — "I have dealt with this member, stop nagging me".
--    Keyed by (coach, member) so a coach switch does not carry a snooze over
--    to the new coach. Written ONLY through snooze_member(); the policies
--    below are read-only on purpose.
-- ---------------------------------------------------------------------------

create table if not exists public.attention_snoozes (
  coach_id      uuid        not null references public.profiles(id) on delete cascade,
  member_id     uuid        not null references public.profiles(id) on delete cascade,
  snoozed_until timestamptz not null,
  created_at    timestamptz not null default now(),
  primary key (coach_id, member_id)
);

comment on table public.attention_snoozes is
  'Per-coach snooze of a member in the attention queue. A snoozed member still '
  'appears in coach_roster() but sorts with priority 3 (as if active) until '
  'snoozed_until passes. Written only by snooze_member().';

create index if not exists attention_snoozes_member_idx
  on public.attention_snoozes (member_id);

alter table public.attention_snoozes enable row level security;

drop policy if exists attention_snoozes_read_own on public.attention_snoozes;
create policy attention_snoozes_read_own on public.attention_snoozes
  for select using (coach_id = (select auth.uid()) or (select public.is_admin()));

-- ---------------------------------------------------------------------------
-- 3. roster_scope — shared in-body gate. Returns the coach whose roster the
--    caller may read: the caller themselves for a coach, p_coach (or NULL =
--    every coach) for an admin. Anyone else gets 42501.
-- ---------------------------------------------------------------------------

create or replace function public.roster_scope(p_coach uuid default null)
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then
    raise exception 'not_entitled' using errcode = '42501',
      hint = 'Sign in as a coach or admin.';
  end if;

  select p.role into v_role from public.profiles p where p.id = v_uid;

  if v_role = 'admin' then
    return p_coach;  -- NULL means "every coach"
  end if;

  if v_role is distinct from 'coach' then
    raise exception 'not_entitled' using errcode = '42501',
      hint = 'Only a coach or an admin can read a roster.';
  end if;

  if p_coach is not null and p_coach <> v_uid then
    raise exception 'not_entitled' using errcode = '42501',
      hint = 'A coach can only read their own roster.';
  end if;

  return v_uid;
end;
$$;

comment on function public.roster_scope(uuid) is
  'In-body gate for the roster/attention RPCs: coach -> own id, admin -> '
  'p_coach or NULL (all coaches), anyone else 42501 not_entitled.';

revoke all on function public.roster_scope(uuid) from public;

-- ---------------------------------------------------------------------------
-- 4. coach_roster — one page of the coach's members, worst first.
--
--   status/priority: 0 no_plan, 1 starter still needing tailoring,
--   2 inactive (has a plan and nothing has happened for 72 h), 3 active.
--   A snoozed member keeps its real status but sorts at priority 3.
--   activity_at = the later of (last completion, coach_assigned_at), falling
--   back to the profile's created_at, so it is never NULL and the keyset
--   tuple is total.
--
--   Shape: the cheap columns decide the page (one pass over the coach's
--   members), and only the page's members pay for the 7d/30d/unscored
--   aggregates and the streak scan.
-- ---------------------------------------------------------------------------

create or replace function public.coach_roster(
  p_coach          uuid        default null,
  p_after_priority int         default null,
  p_after_activity timestamptz default null,
  p_after_member   uuid        default null,
  p_limit          int         default 50
)
returns table (
  member_id               uuid,
  full_name               text,
  subscription_state      text,
  subscription_period_end timestamptz,
  coach_assigned_at       timestamptz,
  plan_source             text,
  needs_tailoring         boolean,
  has_plan                boolean,
  last_completed_at       timestamptz,
  completions_7d          int,
  completions_30d         int,
  streak                  int,
  unscored_count          int,
  days_inactive           int,
  status                  text,
  priority                int,
  activity_at             timestamptz,
  snoozed_until           timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_scope uuid;
  v_now   timestamptz := now();
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  v_scope := public.roster_scope(p_coach);

  return query
  with base as (
    select
      p.id                as member_id,
      p.full_name         as full_name,
      p.coach_assigned_at as coach_assigned_at,
      p.timezone          as tz,
      s.status            as sub_status,
      s.current_period_end as sub_period_end,
      wp.id               as plan_id,
      wp.source           as plan_source,
      coalesce(wp.needs_tailoring, false) as needs_tailoring,
      sn.snoozed_until    as snoozed_until,
      lc.last_completed_at as last_completed_at,
      greatest(
        coalesce(lc.last_completed_at, '-infinity'::timestamptz),
        coalesce(p.coach_assigned_at, p.created_at)
      ) as activity_at
    from public.profiles p
    left join public.subscriptions s on s.member_id = p.id
    left join public.workout_plans wp on wp.member_id = p.id
    left join public.attention_snoozes sn
      on sn.coach_id = p.coach_id and sn.member_id = p.id and sn.snoozed_until > v_now
    left join lateral (
      select max(wc.completed_at) as last_completed_at
      from public.workout_completions wc
      where wc.member_id = p.id and wc.status = 'completed'
    ) lc on true
    where p.role = 'member'
      and p.coach_id is not null
      and (v_scope is null or p.coach_id = v_scope)
  ),
  scored as (
    select b.*,
      case
        when b.plan_id is null then 'no_plan'
        when b.plan_source = 'starter' and b.needs_tailoring then 'starter'
        when b.activity_at < v_now - interval '72 hours' then 'inactive'
        else 'active'
      end as status
    from base b
  ),
  ranked as (
    select sc.*,
      case
        when sc.snoozed_until is not null then 3
        when sc.status = 'no_plan'  then 0
        when sc.status = 'starter'  then 1
        when sc.status = 'inactive' then 2
        else 3
      end as priority
    from scored sc
  ),
  page as (
    select r.*
    from ranked r
    where p_after_priority is null
       or p_after_member is null
       or (r.priority, r.activity_at, r.member_id)
          > (p_after_priority, coalesce(p_after_activity, '-infinity'::timestamptz), p_after_member)
    order by r.priority, r.activity_at, r.member_id
    limit v_limit
  ),
  agg as (
    select pg.member_id,
      count(*) filter (
        where wc.status = 'completed' and wc.completed_at >= v_now - interval '7 days'
      )::int as completions_7d,
      count(*) filter (
        where wc.status = 'completed' and wc.completed_at >= v_now - interval '30 days'
      )::int as completions_30d,
      count(*) filter (
        where wc.status = 'completed' and wc.effort_score is null
      )::int as unscored_count
    from page pg
    left join public.workout_completions wc on wc.member_id = pg.member_id
    group by pg.member_id
  ),
  dates as (
    select pg.member_id, wc.completed_local_date as d
    from page pg
    join public.workout_completions wc
      on wc.member_id = pg.member_id
     and wc.status = 'completed'
     and wc.completed_local_date is not null
    group by pg.member_id, wc.completed_local_date
  ),
  islands as (
    select d0.member_id, d0.d,
           d0.d - (row_number() over (partition by d0.member_id order by d0.d))::int as island
    from dates d0
  ),
  runs as (
    select i.member_id, max(i.d) as streak_end, count(*)::int as streak_length
    from islands i
    group by i.member_id, i.island
  ),
  latest as (
    select distinct on (r.member_id) r.member_id, r.streak_end, r.streak_length
    from runs r
    order by r.member_id, r.streak_end desc
  )
  select
    pg.member_id,
    pg.full_name,
    public.subscription_state_calc('member', pg.sub_status, pg.sub_period_end, v_now),
    pg.sub_period_end,
    pg.coach_assigned_at,
    pg.plan_source,
    pg.needs_tailoring,
    pg.plan_id is not null,
    pg.last_completed_at,
    coalesce(a.completions_7d, 0),
    coalesce(a.completions_30d, 0),
    case
      when l.streak_end is not null
       and l.streak_end >= (v_now at time zone coalesce(pg.tz, 'UTC'))::date - 1
      then l.streak_length
      else 0
    end,
    coalesce(a.unscored_count, 0),
    greatest(0, floor(extract(epoch from (v_now - pg.activity_at)) / 86400))::int,
    pg.status,
    pg.priority,
    pg.activity_at,
    pg.snoozed_until
  from page pg
  left join agg a on a.member_id = pg.member_id
  left join latest l on l.member_id = pg.member_id
  order by pg.priority, pg.activity_at, pg.member_id;
end;
$$;

comment on function public.coach_roster(uuid, int, timestamptz, uuid, int) is
  'One keyset page of a coach''s roster, worst first: priority 0 no_plan, '
  '1 starter needing tailoring, 2 inactive (72 h), 3 active; snoozed members '
  'sort as 3. Cursor = (priority, activity_at, member_id) of the last row. '
  'Gated in body by roster_scope(): coach -> own roster, admin -> any/all.';

revoke all on function public.coach_roster(uuid, int, timestamptz, uuid, int) from public;

-- ---------------------------------------------------------------------------
-- 5. attention_counts — the badge numbers behind the roster.
--
--    access_expiring counts members whose NEXT subscription transition (an
--    active sub reaching its period end, a grace sub reaching the end of its
--    10 days) happens within 3 days — i.e. who is about to lose live access.
--    pending_reports is admin-only (a coach has no moderation queue) and 0
--    for everyone else. total is the sum of the six counts.
--
--    Snoozes deliberately do NOT change these counts: a snooze reorders the
--    roster, it does not make the work disappear.
-- ---------------------------------------------------------------------------

create or replace function public.attention_counts(p_coach uuid default null)
returns table (
  no_plan                 int,
  starter_needs_tailoring int,
  unscored_sessions       int,
  inactive_members        int,
  pending_reports         int,
  access_expiring         int,
  total                   int
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_scope    uuid;
  v_now      timestamptz := now();
  v_is_admin boolean;
  v_grace    interval := make_interval(days => public.subscription_grace_days());
begin
  v_scope := public.roster_scope(p_coach);
  v_is_admin := public.is_admin();

  return query
  with members as (
    select
      p.id as member_id,
      s.current_period_end as sub_period_end,
      public.subscription_state_calc('member', s.status, s.current_period_end, v_now) as sub_state,
      -- Same buckets as coach_roster(), in the same order, so a badge can
      -- never disagree with the list it opens.
      case
        when wp.id is null then 'no_plan'
        when wp.source = 'starter' and coalesce(wp.needs_tailoring, false) then 'starter'
        when greatest(
               coalesce(lc.last_completed_at, '-infinity'::timestamptz),
               coalesce(p.coach_assigned_at, p.created_at)
             ) < v_now - interval '72 hours' then 'inactive'
        else 'active'
      end as status
    from public.profiles p
    left join public.workout_plans wp on wp.member_id = p.id
    left join public.subscriptions s on s.member_id = p.id
    left join lateral (
      select max(wc.completed_at) as last_completed_at
      from public.workout_completions wc
      where wc.member_id = p.id and wc.status = 'completed'
    ) lc on true
    where p.role = 'member'
      and p.coach_id is not null
      and (v_scope is null or p.coach_id = v_scope)
  ),
  counted as (
    select
      count(*) filter (where m.status = 'no_plan')::int as no_plan,
      count(*) filter (where m.status = 'starter')::int as starter_needs_tailoring,
      count(*) filter (where m.status = 'inactive')::int as inactive_members,
      count(*) filter (
        where (m.sub_state = 'active' and m.sub_period_end <= v_now + interval '3 days')
           or (m.sub_state = 'grace' and m.sub_period_end + v_grace <= v_now + interval '3 days')
      )::int as access_expiring
    from members m
  ),
  unscored as (
    select count(*)::int as unscored_sessions
    from public.workout_completions wc
    join members m on m.member_id = wc.member_id
    where wc.status = 'completed' and wc.effort_score is null
  ),
  reports as (
    select case
      when v_is_admin then (
        select count(*)::int from public.moderation_reports mr where mr.status = 'open'
      )
      else 0
    end as pending_reports
  )
  select c.no_plan, c.starter_needs_tailoring, u.unscored_sessions, c.inactive_members,
         r.pending_reports, c.access_expiring,
         c.no_plan + c.starter_needs_tailoring + u.unscored_sessions + c.inactive_members
           + r.pending_reports + c.access_expiring
  from counted c, unscored u, reports r;
end;
$$;

comment on function public.attention_counts(uuid) is
  'Badge counts for the coach dashboard: no_plan, starter_needs_tailoring, '
  'unscored_sessions, inactive_members (72 h), pending_reports (admin only, '
  'else 0), access_expiring (subscription transition within 3 days) and their '
  'total. Same gate and scope as coach_roster().';

revoke all on function public.attention_counts(uuid) from public;

-- ---------------------------------------------------------------------------
-- 6. snooze_member — quiet one member for up to 14 days.
--    p_until NULL or in the past clears the snooze and returns NULL.
-- ---------------------------------------------------------------------------

create or replace function public.snooze_member(p_member uuid, p_until timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_coach uuid;
  v_role  text;
  v_now   timestamptz := now();
begin
  if v_uid is null then
    raise exception 'not_entitled' using errcode = '42501',
      hint = 'Sign in as this member''s coach.';
  end if;

  select p.coach_id, p.role into v_coach, v_role
  from public.profiles p where p.id = p_member;

  if v_role is null then
    raise exception 'member_not_found' using errcode = 'P0002',
      hint = 'This member no longer exists.';
  end if;

  if v_coach is null then
    raise exception 'member_has_no_coach' using errcode = 'P0002',
      hint = 'A member with no coach cannot be snoozed.';
  end if;

  if not (v_coach = v_uid or public.is_admin()) then
    raise exception 'not_entitled' using errcode = '42501',
      hint = 'Only this member''s current coach or an admin can snooze them.';
  end if;

  if p_until is null or p_until <= v_now then
    delete from public.attention_snoozes s
     where s.coach_id = v_coach and s.member_id = p_member;
    return null;
  end if;

  if p_until > v_now + interval '14 days' then
    raise exception 'snooze_too_long' using errcode = '22023',
      hint = 'A member can be snoozed for at most 14 days.';
  end if;

  insert into public.attention_snoozes (coach_id, member_id, snoozed_until)
  values (v_coach, p_member, p_until)
  on conflict (coach_id, member_id)
    do update set snoozed_until = excluded.snoozed_until;

  return p_until;
end;
$$;

comment on function public.snooze_member(uuid, timestamptz) is
  'Snoozes a member in the attention queue for at most 14 days (42501 '
  'not_entitled, P0002 member_not_found / member_has_no_coach, 22023 '
  'snooze_too_long). NULL or a past timestamp clears the snooze.';

revoke all on function public.snooze_member(uuid, timestamptz) from public;

-- ---------------------------------------------------------------------------
-- 7. unscored_completions — the effort queue: sessions still waiting for a
--    coach's effort score, newest first. Cursor = (completed_at, id).
-- ---------------------------------------------------------------------------

create or replace function public.unscored_completions(
  p_after_completed_at timestamptz default null,
  p_after_id           uuid        default null,
  p_limit              int         default 20
)
returns table (
  completion_id uuid,
  member_id     uuid,
  member_name   text,
  day_number    int,
  block_name    text,
  completed_at  timestamptz,
  effort_score  int
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_scope uuid;
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 100);
begin
  v_scope := public.roster_scope(null);

  return query
  select
    wc.id,
    wc.member_id,
    p.full_name,
    coalesce(wc.day_number, wd.day_number),
    coalesce(wc.block_name, wd.block_name),
    wc.completed_at,
    wc.effort_score
  from public.workout_completions wc
  join public.profiles p on p.id = wc.member_id
  left join public.workout_days wd on wd.id = wc.workout_day_id
  where p.role = 'member'
    and (v_scope is null or p.coach_id = v_scope)
    and wc.status = 'completed'
    and wc.effort_score is null
    and (
      p_after_completed_at is null
      or p_after_id is null
      or (wc.completed_at, wc.id) < (p_after_completed_at, p_after_id)
    )
  order by wc.completed_at desc, wc.id desc
  limit v_limit;
end;
$$;

comment on function public.unscored_completions(timestamptz, uuid, int) is
  'Effort queue: completed sessions with no effort_score for the caller''s '
  'members (coach) or everyone (admin), newest first. Cursor = '
  '(completed_at, id) of the last row. 42501 not_entitled otherwise.';

revoke all on function public.unscored_completions(timestamptz, uuid, int) from public;

-- ---------------------------------------------------------------------------
-- 8. member_history — one member's session history, newest first.
--    Readable by the member themselves, their CURRENT coach, or an admin.
--    p_after_id is optional; passing it makes paging exact when two sessions
--    share a completed_at.
-- ---------------------------------------------------------------------------

create or replace function public.member_history(
  p_member             uuid,
  p_after_completed_at timestamptz default null,
  p_limit              int         default 30,
  p_after_id           uuid        default null
)
returns table (
  completion_id       uuid,
  completed_at        timestamptz,
  completed_local_date date,
  day_number          int,
  block_name          text,
  status              text,
  effort_score        int,
  exercises_logged    int
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_limit int := least(greatest(coalesce(p_limit, 30), 1), 100);
begin
  if v_uid is null then
    raise exception 'not_entitled' using errcode = '42501',
      hint = 'Sign in to read this history.';
  end if;

  if not (
    v_uid = p_member
    or public.is_coach_of_member(p_member)
    or public.is_admin()
  ) then
    raise exception 'not_entitled' using errcode = '42501',
      hint = 'Only this member, their current coach or an admin can read it.';
  end if;

  return query
  select
    wc.id,
    wc.completed_at,
    wc.completed_local_date,
    coalesce(wc.day_number, wd.day_number),
    coalesce(wc.block_name, wd.block_name),
    wc.status,
    wc.effort_score,
    (
      select count(*)::int from public.exercise_completions ec
      where ec.workout_completion_id = wc.id
    )
  from public.workout_completions wc
  left join public.workout_days wd on wd.id = wc.workout_day_id
  where wc.member_id = p_member
    and (
      p_after_completed_at is null
      or (
        case
          when p_after_id is null then wc.completed_at < p_after_completed_at
          else (wc.completed_at, wc.id) < (p_after_completed_at, p_after_id)
        end
      )
    )
  order by wc.completed_at desc, wc.id desc
  limit v_limit;
end;
$$;

comment on function public.member_history(uuid, timestamptz, int, uuid) is
  'One member''s session history (snapshot day name, effort, exercises '
  'logged), newest first, for the member themselves, their CURRENT coach or '
  'an admin; 42501 not_entitled otherwise. Cursor = (completed_at[, id]).';

revoke all on function public.member_history(uuid, timestamptz, int, uuid) from public;

-- ---------------------------------------------------------------------------
-- 9. Indexes for the queries above. The per-member paths are already served
--    by 20260921100000 (workout_completions(member_id, completed_at desc)
--    and the unscored partial index) and by profiles_coach_id_idx; what is
--    missing is the ADMIN-wide effort queue, which sorts across every member.
-- ---------------------------------------------------------------------------

create index if not exists workout_completions_unscored_feed_idx
  on public.workout_completions (completed_at desc, id desc)
  where effort_score is null and status = 'completed';

commit;

