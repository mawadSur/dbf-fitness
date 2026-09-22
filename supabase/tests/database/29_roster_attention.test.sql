-- ============================================================================
-- 29_roster_attention.test.sql
--
-- Pins migration 20260921120000_roster_attention.sql:
--   * coach_roster()      — scope (own roster / admin / denied), priority and
--                           status buckets, snooze, per-member metrics,
--                           keyset paging with no dupes or skips, and the
--                           roster following the member's CURRENT coach
--   * attention_counts()  — every bucket, admin-only pending_reports
--   * snooze_member()     — authz, 14-day cap, clearing
--   * unscored_completions() / member_history() — scope + paging
--   * subscription_state_calc() — parity with subscription_state_row()
--   * every new function is safe to call directly as anon (42501, no crash)
--
-- Run with: psql -X -f supabase/tests/database/29_roster_attention.test.sql
--        or supabase test db supabase/tests/database/29_roster_attention.test.sql
-- One transaction, rolled back. Fixture prefix 7a29... is unique to this file.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(58);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'h29-' || u.n || '@test.invalid', 'x', now(), now()
from (values
  ('7a290000-0000-4000-8000-000000000001'::uuid, 1),  -- coach A
  ('7a290000-0000-4000-8000-000000000002'::uuid, 2),  -- coach B
  ('7a290000-0000-4000-8000-000000000003'::uuid, 3),  -- A: no plan
  ('7a290000-0000-4000-8000-000000000004'::uuid, 4),  -- A: starter plan
  ('7a290000-0000-4000-8000-000000000005'::uuid, 5),  -- A: inactive
  ('7a290000-0000-4000-8000-000000000006'::uuid, 6),  -- A: active
  ('7a290000-0000-4000-8000-000000000007'::uuid, 7),  -- A: inactive but snoozed
  ('7a290000-0000-4000-8000-000000000008'::uuid, 8),  -- B: other coach's member
  ('7a290000-0000-4000-8000-000000000009'::uuid, 9),  -- admin
  ('7a290000-0000-4000-8000-000000000010'::uuid, 10)  -- member who has no coach yet
) as u(id, n);

insert into public.profiles (id, role, coach_id, full_name, coach_assigned_at) values
  ('7a290000-0000-4000-8000-000000000001', 'coach',  null, 'H29 Coach A', null),
  ('7a290000-0000-4000-8000-000000000002', 'coach',  null, 'H29 Coach B', null),
  ('7a290000-0000-4000-8000-000000000009', 'admin',  null, 'H29 Admin',   null),
  ('7a290000-0000-4000-8000-000000000003', 'member',
   '7a290000-0000-4000-8000-000000000001', 'H29 No Plan',  now() - interval '5 days'),
  ('7a290000-0000-4000-8000-000000000004', 'member',
   '7a290000-0000-4000-8000-000000000001', 'H29 Starter',  now() - interval '6 days'),
  ('7a290000-0000-4000-8000-000000000005', 'member',
   '7a290000-0000-4000-8000-000000000001', 'H29 Inactive', now() - interval '20 days'),
  ('7a290000-0000-4000-8000-000000000006', 'member',
   '7a290000-0000-4000-8000-000000000001', 'H29 Active',   now() - interval '30 days'),
  ('7a290000-0000-4000-8000-000000000007', 'member',
   '7a290000-0000-4000-8000-000000000001', 'H29 Snoozed',  now() - interval '25 days'),
  ('7a290000-0000-4000-8000-000000000008', 'member',
   '7a290000-0000-4000-8000-000000000002', 'H29 Other',    now() - interval '4 days'),
  -- Signed up, never chose a coach: belongs to no roster and cannot be snoozed.
  ('7a290000-0000-4000-8000-000000000010', 'member', null, 'H29 Coachless', null);

-- Plans: the starter member is on an untailored starter, the rest on a real
-- coach-authored plan. The "no plan" member deliberately has none.
insert into public.workout_plans (id, member_id, coach_id, title, source, needs_tailoring) values
  ('7a290000-0000-4000-8000-0000000000b4', '7a290000-0000-4000-8000-000000000004',
   '7a290000-0000-4000-8000-000000000001', 'H29 Starter Plan', 'starter', true),
  ('7a290000-0000-4000-8000-0000000000b5', '7a290000-0000-4000-8000-000000000005',
   '7a290000-0000-4000-8000-000000000001', 'H29 Inactive Plan', 'coach', false),
  ('7a290000-0000-4000-8000-0000000000b6', '7a290000-0000-4000-8000-000000000006',
   '7a290000-0000-4000-8000-000000000001', 'H29 Active Plan', 'coach', false),
  ('7a290000-0000-4000-8000-0000000000b7', '7a290000-0000-4000-8000-000000000007',
   '7a290000-0000-4000-8000-000000000001', 'H29 Snoozed Plan', 'coach', false);

insert into public.workout_days (id, workout_plan_id, day_number, block_name) values
  ('7a290000-0000-4000-8000-0000000000c5', '7a290000-0000-4000-8000-0000000000b5', 1, 'H29 Day Inactive'),
  ('7a290000-0000-4000-8000-0000000000c6', '7a290000-0000-4000-8000-0000000000b6', 1, 'H29 Day Active'),
  ('7a290000-0000-4000-8000-0000000000c7', '7a290000-0000-4000-8000-0000000000b7', 1, 'H29 Day Snoozed');

insert into public.exercises (id, workout_day_id, order_index, name, reps_or_duration) values
  ('7a290000-0000-4000-8000-0000000000e6', '7a290000-0000-4000-8000-0000000000c6', 1, 'H29 Squat', '3 x 10');

-- The inactive pair last trained 5 days ago; the active member has a 3-day
-- streak ending today, two of those sessions still unscored.
insert into public.workout_completions (id, member_id, workout_day_id, status, completed_at, effort_score) values
  ('7a290000-0000-4000-8000-0000000000f5', '7a290000-0000-4000-8000-000000000005',
   '7a290000-0000-4000-8000-0000000000c5', 'completed', now() - interval '5 days', 4),
  ('7a290000-0000-4000-8000-0000000000f7', '7a290000-0000-4000-8000-000000000007',
   '7a290000-0000-4000-8000-0000000000c7', 'completed', now() - interval '6 days', 3),
  ('7a290000-0000-4000-8000-0000000000a1', '7a290000-0000-4000-8000-000000000006',
   '7a290000-0000-4000-8000-0000000000c6', 'completed', now() - interval '2 days', 5),
  ('7a290000-0000-4000-8000-0000000000a2', '7a290000-0000-4000-8000-000000000006',
   '7a290000-0000-4000-8000-0000000000c6', 'completed', now() - interval '1 day', null),
  ('7a290000-0000-4000-8000-0000000000a3', '7a290000-0000-4000-8000-000000000006',
   '7a290000-0000-4000-8000-0000000000c6', 'completed', now() - interval '1 hour', null);

insert into public.exercise_completions (workout_completion_id, exercise_id) values
  ('7a290000-0000-4000-8000-0000000000a3', '7a290000-0000-4000-8000-0000000000e6');

-- Subscriptions: the active member's access lapses in 2 days (access_expiring),
-- the snoozed member is already in grace with 9 days of it left (not expiring).
insert into public.subscriptions (member_id, status, current_period_end) values
  ('7a290000-0000-4000-8000-000000000006', 'active',   now() + interval '2 days'),
  ('7a290000-0000-4000-8000-000000000007', 'past_due', now() - interval '1 day'),
  ('7a290000-0000-4000-8000-000000000005', 'canceled', now() - interval '40 days');

-- Member 7 is snoozed for another week (written directly: snooze_member() is
-- exercised further down).
insert into public.attention_snoozes (coach_id, member_id, snoozed_until) values
  ('7a290000-0000-4000-8000-000000000001', '7a290000-0000-4000-8000-000000000007',
   now() + interval '7 days');

-- An open report, so the admin-only pending_reports bucket has something to see.
insert into public.moderation_reports (reporter_id, reported_user_id, reason, status) values
  ('7a290000-0000-4000-8000-000000000003', '7a290000-0000-4000-8000-000000000008',
   'H29 test report', 'open');

-- ---------------------------------------------------------------------------
-- coach_roster(): scope, order, buckets, metrics.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '7a290000-0000-4000-8000-000000000001', true);

select is(current_user::text || '/' || auth.uid()::text,
  'authenticated/7a290000-0000-4000-8000-000000000001', '01 running as coach A');

select is((select count(*) from public.coach_roster()), 5::bigint,
  '02 a coach sees exactly their own five members, never coach B''s');

select is(
  (select string_agg(x.full_name, ',' order by x.ord)
   from (select row_number() over () as ord, cr.* from public.coach_roster() cr) x),
  'H29 No Plan,H29 Starter,H29 Inactive,H29 Snoozed,H29 Active',
  '03 worst first: no plan, starter, inactive, then priority-3 by oldest activity');

select is(
  (select string_agg(x.priority::text, ',' order by x.ord)
   from (select row_number() over () as ord, cr.* from public.coach_roster() cr) x),
  '0,1,2,3,3', '04 priorities 0 no_plan, 1 starter, 2 inactive, 3 active');

select is(
  (select string_agg(x.status, ',' order by x.ord)
   from (select row_number() over () as ord, cr.* from public.coach_roster() cr) x),
  'no_plan,starter,inactive,inactive,active',
  '05 a snoozed member keeps its real status and only loses its priority');

select is(
  (select r.priority from public.coach_roster() r
   where r.member_id = '7a290000-0000-4000-8000-000000000007'),
  3, '06 the snoozed member sorts as if active');

select isnt(
  (select r.snoozed_until from public.coach_roster() r
   where r.member_id = '7a290000-0000-4000-8000-000000000007'),
  null, '07 ... and the row says why (snoozed_until is echoed back)');

select is(
  (select r.has_plan::text || '/' || coalesce(r.plan_source, '-') || '/' || r.needs_tailoring::text
   from public.coach_roster() r where r.member_id = '7a290000-0000-4000-8000-000000000004'),
  'true/starter/true', '08 plan provenance travels with the roster row');

select is(
  (select r.has_plan::text || '/' || coalesce(r.plan_source, '-')
   from public.coach_roster() r where r.member_id = '7a290000-0000-4000-8000-000000000003'),
  'false/-', '09 the plan-less member is flagged has_plan = false');

select is(
  (select r.completions_7d || '/' || r.completions_30d || '/' || r.unscored_count || '/' || r.streak
   from public.coach_roster() r where r.member_id = '7a290000-0000-4000-8000-000000000006'),
  '3/3/2/3', '10 per-member metrics: 7d, 30d, unscored and the local-date streak');

select is(
  (select r.days_inactive from public.coach_roster() r
   where r.member_id = '7a290000-0000-4000-8000-000000000005'),
  5, '11 days_inactive counts whole days since the last activity');

select is(
  (select r.days_inactive from public.coach_roster() r
   where r.member_id = '7a290000-0000-4000-8000-000000000006'),
  0, '12 ... and is 0 for someone who trained an hour ago');

select is(
  (select string_agg(r.subscription_state, ',' order by r.member_id)
   from public.coach_roster() r),
  'none,none,expired,active,grace',
  '13 subscription state is computed per row (none/expired/active/grace)');

-- ---------------------------------------------------------------------------
-- Keyset paging: three pages of two must equal one page of five, in order,
-- with no duplicate and no skipped member.
-- ---------------------------------------------------------------------------

select is(
  (select string_agg(x.full_name, ',' order by x.ord)
   from (select row_number() over () as ord, cr.*
         from public.coach_roster(null, null, null, null, 2) cr) x),
  'H29 No Plan,H29 Starter', '14 page 1 of 2');

select is(
  (with p1 as (
     select row_number() over () as ord, cr.*
     from public.coach_roster(null, null, null, null, 2) cr
   ), last1 as (select * from p1 order by ord desc limit 1)
   select string_agg(x.full_name, ',' order by x.ord)
   from last1 l,
        lateral (select row_number() over () as ord, cr.*
                 from public.coach_roster(null, l.priority, l.activity_at, l.member_id, 2) cr) x),
  'H29 Inactive,H29 Snoozed', '15 page 2 continues from the cursor tuple');

select is(
  (select count(distinct x.member_id)
   from (select cr.member_id from public.coach_roster(null, null, null, null, 2) cr
         union all
         select cr2.member_id
         from (select * from public.coach_roster(null, null, null, null, 2)
               order by priority desc, activity_at desc, member_id desc limit 1) l,
              lateral public.coach_roster(null, l.priority, l.activity_at, l.member_id, 50) cr2) x),
  5::bigint, '16 paging covers every member exactly once (no dupes, no skips)');

-- ---------------------------------------------------------------------------
-- attention_counts() for coach A, and the effort queue.
-- ---------------------------------------------------------------------------

select is(
  (select c.no_plan || '/' || c.starter_needs_tailoring || '/' || c.unscored_sessions
          || '/' || c.inactive_members || '/' || c.pending_reports || '/' || c.access_expiring
          || '/' || c.total
   from public.attention_counts() c),
  '1/1/2/2/0/1/7',
  '17 attention counts: 1 no-plan, 1 starter, 2 unscored, 2 inactive, 0 reports, 1 expiring');

select is(
  (select c.inactive_members from public.attention_counts() c), 2,
  '18 a snooze reorders the roster but never hides the work from the counts');

select is(
  (select string_agg(x.member_name, ',' order by x.ord)
   from (select row_number() over () as ord, u.* from public.unscored_completions() u) x),
  'H29 Active,H29 Active',
  '19 the effort queue holds only this coach''s unscored sessions, newest first');

select is(
  (select string_agg(x.ord || ':' || x.block_name, ',' order by x.ord)
   from (select row_number() over () as ord, u.* from public.unscored_completions() u) x),
  '1:H29 Day Active,2:H29 Day Active',
  '20 ... with the snapshot day name the member actually trained');

select is(
  (with p1 as (select u.* from public.unscored_completions(null, null, 1) u)
   select string_agg(u2.completion_id::text, ',')
   from p1, lateral public.unscored_completions(p1.completed_at, p1.completion_id, 10) u2),
  '7a290000-0000-4000-8000-0000000000a2',
  '21 the effort queue pages by (completed_at, id) without repeating a row');

-- ---------------------------------------------------------------------------
-- Everyone else. A member, another coach and anon are all refused.
-- ---------------------------------------------------------------------------

select throws_ok(
  $$select public.coach_roster('7a290000-0000-4000-8000-000000000002')$$,
  '42501', null, '22 a coach cannot read another coach''s roster');

set local role authenticated;
select set_config('request.jwt.claim.sub', '7a290000-0000-4000-8000-000000000002', true);

select is((select count(*) from public.coach_roster()), 1::bigint,
  '23 coach B sees only their own member');

select is(
  (select count(*) from public.unscored_completions() u
   where u.member_id::text like '7a29%'),
  0::bigint, '24 coach B never sees coach A''s unscored sessions');

select throws_ok(
  $$select public.member_history('7a290000-0000-4000-8000-000000000006')$$,
  '42501', null, '25 coach B cannot read coach A''s member''s history');

select throws_ok(
  $$select public.snooze_member('7a290000-0000-4000-8000-000000000006', now() + interval '1 day')$$,
  '42501', null, '26 coach B cannot snooze coach A''s member');

set local role authenticated;
select set_config('request.jwt.claim.sub', '7a290000-0000-4000-8000-000000000006', true);

select throws_ok($$select public.coach_roster()$$, '42501', null,
  '27 a member has no roster');
select throws_ok($$select public.attention_counts()$$, '42501', null,
  '28 ... and no attention queue');
select throws_ok($$select public.unscored_completions()$$, '42501', null,
  '29 ... and no effort queue');
select is((select count(*) from public.member_history('7a290000-0000-4000-8000-000000000006')),
  3::bigint, '30 but a member can read their own history');
select throws_ok(
  $$select public.member_history('7a290000-0000-4000-8000-000000000005')$$,
  '42501', null, '31 ... and nobody else''s');

select is(
  (select h.exercises_logged from public.member_history('7a290000-0000-4000-8000-000000000006') h
   order by h.completed_at desc limit 1),
  1, '32 history rows carry the number of exercises logged');

-- ---------------------------------------------------------------------------
-- Admin scope.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '7a290000-0000-4000-8000-000000000009', true);

select is(
  (select count(*) from public.coach_roster('7a290000-0000-4000-8000-000000000001')),
  5::bigint, '33 an admin can read any named coach''s roster');

select is(
  (select count(*) from public.coach_roster(null, null, null, null, 200) r
   where r.member_id::text like '7a29%'),
  6::bigint, '34 ... and, with no coach named, every coached member at once');

select cmp_ok(
  (select c.pending_reports from public.attention_counts('7a290000-0000-4000-8000-000000000001') c),
  '>=', 1, '35 pending_reports is visible to an admin');

select is(
  (select count(*) from public.member_history('7a290000-0000-4000-8000-000000000006')),
  3::bigint, '36 an admin can read any member''s history');

-- Two statements on purpose: PostgreSQL does not promise to evaluate a
-- function argument before a sibling subquery, so the write and the read of
-- its effect must not share one statement.
select isnt(
  public.snooze_member('7a290000-0000-4000-8000-000000000005', now() + interval '2 days'),
  null, '37 an admin can snooze a member');

select is(
  (select s.coach_id from public.attention_snoozes s
   where s.member_id = '7a290000-0000-4000-8000-000000000005'),
  '7a290000-0000-4000-8000-000000000001'::uuid,
  '37b ... and the snooze is filed under the member''s CURRENT coach');

-- ---------------------------------------------------------------------------
-- snooze_member(): effect, cap, clearing.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '7a290000-0000-4000-8000-000000000001', true);

select is(
  (select r.priority from public.coach_roster() r
   where r.member_id = '7a290000-0000-4000-8000-000000000005'),
  3, '38 the snoozed inactive member now sorts as active');

select throws_ok(
  $$select public.snooze_member('7a290000-0000-4000-8000-000000000005', now() + interval '15 days')$$,
  '22023', null, '39 a snooze longer than 14 days is refused');

select is(public.snooze_member('7a290000-0000-4000-8000-000000000005', null), null,
  '40 a null deadline clears the snooze');

select is(
  (select r.priority from public.coach_roster() r
   where r.member_id = '7a290000-0000-4000-8000-000000000005'),
  2, '41 ... and the member goes back to the top of the queue');

-- snooze_member's two P0002 paths. Both are distinct from the 42501 gate on
-- purpose: "this member is gone" and "this member has no coach" are facts the
-- client shows differently from "you may not do this".
select throws_ok(
  $$select public.snooze_member('7a290000-0000-4000-8000-0000000000ff', now() + interval '1 day')$$,
  'P0002', null, '41b snoozing a member who does not exist raises member_not_found');

select throws_ok(
  $$select public.snooze_member('7a290000-0000-4000-8000-000000000010', now() + interval '1 day')$$,
  'P0002', null, '41c a member with no coach cannot be snoozed');

select is(public.snooze_member('7a290000-0000-4000-8000-000000000006', now() - interval '1 hour'),
  null, '41d a deadline in the past clears rather than creating a snooze');

select is(
  (select count(*) from public.attention_snoozes s
   where s.member_id = '7a290000-0000-4000-8000-000000000006'),
  0::bigint, '41e ... and leaves no row behind');

-- ---------------------------------------------------------------------------
-- The roster follows the member's CURRENT coach.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '7a290000-0000-4000-8000-000000000005', true);
select public.choose_coach('7a290000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub', '7a290000-0000-4000-8000-000000000001', true);

select is(
  (select count(*) from public.coach_roster() r
   where r.member_id = '7a290000-0000-4000-8000-000000000005'),
  0::bigint, '42 the former coach loses the member from their roster');

select throws_ok(
  $$select public.member_history('7a290000-0000-4000-8000-000000000005')$$,
  '42501', null, '43 ... and their history with them');

set local role authenticated;
select set_config('request.jwt.claim.sub', '7a290000-0000-4000-8000-000000000002', true);

select is(
  (select count(*) from public.coach_roster() r
   where r.member_id = '7a290000-0000-4000-8000-000000000005'),
  1::bigint, '44 the new coach picks the member up');

-- ---------------------------------------------------------------------------
-- subscription_state_calc() must agree with subscription_state_row().
-- ---------------------------------------------------------------------------

set local role postgres;

select is(
  (select string_agg(
     public.subscription_state_calc('member', s.status, s.current_period_end),
     ',' order by s.member_id)
   from public.subscriptions s
   where s.member_id::text like '7a29%'),
  (select string_agg(r.state, ',' order by s.member_id)
   from public.subscriptions s, lateral public.subscription_state_row(s.member_id) r
   where s.member_id::text like '7a29%'),
  '45 subscription_state_calc matches subscription_state_row row for row');

-- ---------------------------------------------------------------------------
-- Direct anon calls: refused in the body, never a crash.
-- ---------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select throws_ok($$select public.roster_scope(null)$$, '42501', null,
  '46 anon calling the gate directly is refused, not crashed');
select throws_ok($$select public.coach_roster()$$, '42501', null,
  '47 anon: coach_roster');
select throws_ok($$select public.attention_counts()$$, '42501', null,
  '48 anon: attention_counts');
select throws_ok($$select public.unscored_completions()$$, '42501', null,
  '49 anon: unscored_completions');
select throws_ok(
  $$select public.member_history('7a290000-0000-4000-8000-000000000006')$$,
  '42501', null, '50 anon: member_history');
select throws_ok(
  $$select public.snooze_member('7a290000-0000-4000-8000-000000000006', now())$$,
  '42501', null, '51 anon: snooze_member');
select is(public.subscription_state_calc('member', 'active', now() + interval '1 day'),
  'active', '52 subscription_state_calc is a harmless pure calculator for anon');
select is((select count(*) from public.attention_snoozes), 0::bigint,
  '53 anon cannot read any snooze row through RLS');

select * from finish();
rollback;

