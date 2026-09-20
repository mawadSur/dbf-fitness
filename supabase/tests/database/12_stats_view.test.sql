-- ============================================================================
-- 12_stats_view.test.sql
--
-- public.member_workout_stats (streak / score / counts) and the milestone
-- rules built on the same arithmetic (public.has_earned_milestone + RLS on
-- public.milestones).
--
-- The two things this file exists to pin down:
--   * the day boundary is UTC MIDNIGHT, not a rolling 24 hours -- two sessions
--     one hour apart across midnight are TWO streak days, two sessions twenty
--     hours apart inside one UTC day are ONE;
--   * the view is security_invoker, so who you are changes what it returns.
--
-- Run with: supabase test db supabase/tests/database/12_stats_view.test.sql
-- One transaction, rolled back. Fixture prefix 7a12… is unique to this file.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(54);

-- ---------------------------------------------------------------------------
-- Fixtures (superuser, RLS bypassed, rolled back at the end).
--   ..01 coach A
--   ..02 member STREAK      7 consecutive UTC days, 2 sessions on the last one
--   ..03 member GAP         a 3-day island that ended 3 days ago
--   ..04 member EMPTY       no completions at all
--   ..05 coach B            ..06 member of coach B, spans UTC midnight
--   ..07 admin              ..08 stranger member, two sessions in one UTC day
-- The database runs in UTC, so (a date)::timestamptz is that day's UTC midnight.
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'stats12-' || u.n || '@test.invalid', 'x', now(), now()
from (values
  ('7a120000-0000-4000-8000-000000000001'::uuid, 1),
  ('7a120000-0000-4000-8000-000000000002'::uuid, 2),
  ('7a120000-0000-4000-8000-000000000003'::uuid, 3),
  ('7a120000-0000-4000-8000-000000000004'::uuid, 4),
  ('7a120000-0000-4000-8000-000000000005'::uuid, 5),
  ('7a120000-0000-4000-8000-000000000006'::uuid, 6),
  ('7a120000-0000-4000-8000-000000000007'::uuid, 7),
  ('7a120000-0000-4000-8000-000000000008'::uuid, 8)
) as u(id, n);

insert into public.profiles (id, role, coach_id, full_name) values
  ('7a120000-0000-4000-8000-000000000001', 'coach',  null,                                   'S12 Coach A'),
  ('7a120000-0000-4000-8000-000000000002', 'member', '7a120000-0000-4000-8000-000000000001', 'S12 Streak'),
  ('7a120000-0000-4000-8000-000000000003', 'member', '7a120000-0000-4000-8000-000000000001', 'S12 Gap'),
  ('7a120000-0000-4000-8000-000000000004', 'member', '7a120000-0000-4000-8000-000000000001', 'S12 Empty'),
  ('7a120000-0000-4000-8000-000000000005', 'coach',  null,                                   'S12 Coach B'),
  ('7a120000-0000-4000-8000-000000000006', 'member', '7a120000-0000-4000-8000-000000000005', 'S12 Midnight'),
  ('7a120000-0000-4000-8000-000000000007', 'admin',  null,                                   'S12 Admin'),
  ('7a120000-0000-4000-8000-000000000008', 'member', null,                                   'S12 Stranger');

insert into public.workout_plans (id, member_id, coach_id, title) values
  ('7a120000-0000-4000-8000-0000000000a1', '7a120000-0000-4000-8000-000000000002',
   '7a120000-0000-4000-8000-000000000001', 'S12 Plan Streak'),
  ('7a120000-0000-4000-8000-0000000000a2', '7a120000-0000-4000-8000-000000000003',
   '7a120000-0000-4000-8000-000000000001', 'S12 Plan Gap'),
  ('7a120000-0000-4000-8000-0000000000a3', '7a120000-0000-4000-8000-000000000006',
   '7a120000-0000-4000-8000-000000000005', 'S12 Plan Midnight'),
  ('7a120000-0000-4000-8000-0000000000a4', '7a120000-0000-4000-8000-000000000008',
   '7a120000-0000-4000-8000-000000000001', 'S12 Plan Stranger');

-- Two day-rows per double-session plan: workout_completions carries a unique
-- index on (member_id, workout_day_id, (completed_at at time zone 'utc')::date),
-- so a second session on the same UTC day has to be a different workout_day.
insert into public.workout_days (id, workout_plan_id, day_number, block_name) values
  ('7a120000-0000-4000-8000-0000000000d1', '7a120000-0000-4000-8000-0000000000a1', 1, 'S12 Block Streak'),
  ('7a120000-0000-4000-8000-0000000000e1', '7a120000-0000-4000-8000-0000000000a1', 2, 'S12 Block Streak PM'),
  ('7a120000-0000-4000-8000-0000000000d2', '7a120000-0000-4000-8000-0000000000a2', 1, 'S12 Block Gap'),
  ('7a120000-0000-4000-8000-0000000000d3', '7a120000-0000-4000-8000-0000000000a3', 1, 'S12 Block Midnight'),
  ('7a120000-0000-4000-8000-0000000000d4', '7a120000-0000-4000-8000-0000000000a4', 1, 'S12 Block Stranger'),
  ('7a120000-0000-4000-8000-0000000000e4', '7a120000-0000-4000-8000-0000000000a4', 2, 'S12 Block Stranger PM');

-- STREAK member: seven consecutive UTC days (today back to today-6), each worth 5,
-- plus a SECOND session late on the last day. Eight completed rows, seven days.
insert into public.workout_completions (member_id, workout_day_id, status, effort_score, completed_at)
select '7a120000-0000-4000-8000-000000000002', '7a120000-0000-4000-8000-0000000000d1',
       'completed', 5, (current_date - g)::timestamptz + interval '12 hours'
from generate_series(0, 6) g;
insert into public.workout_completions (member_id, workout_day_id, status, effort_score, completed_at)
values ('7a120000-0000-4000-8000-000000000002', '7a120000-0000-4000-8000-0000000000e1',
        'completed', 5, current_date::timestamptz + interval '23 hours');
-- ...and one missed day, which must not touch the streak or the score.
insert into public.workout_completions (member_id, workout_day_id, status, effort_score, completed_at)
values ('7a120000-0000-4000-8000-000000000002', '7a120000-0000-4000-8000-0000000000d1',
        'missed', null, (current_date - 10)::timestamptz + interval '12 hours');

-- GAP member: a three-day island that ended three days ago -- a stale streak.
insert into public.workout_completions (member_id, workout_day_id, status, effort_score, completed_at)
select '7a120000-0000-4000-8000-000000000003', '7a120000-0000-4000-8000-0000000000d2',
       'completed', 3, (current_date - g)::timestamptz + interval '12 hours'
from generate_series(3, 5) g;

-- MIDNIGHT member: 23:30 yesterday and 00:30 today -- one hour apart, TWO UTC days.
insert into public.workout_completions (member_id, workout_day_id, status, effort_score, completed_at)
values
  ('7a120000-0000-4000-8000-000000000006', '7a120000-0000-4000-8000-0000000000d3',
   'completed', 4, (current_date - 1)::timestamptz + interval '23 hours 30 minutes'),
  ('7a120000-0000-4000-8000-000000000006', '7a120000-0000-4000-8000-0000000000d3',
   'completed', 4, current_date::timestamptz + interval '30 minutes');

-- STRANGER: 01:00 and 21:00 the same day -- twenty hours apart, ONE UTC day.
insert into public.workout_completions (member_id, workout_day_id, status, effort_score, completed_at)
values
  ('7a120000-0000-4000-8000-000000000008', '7a120000-0000-4000-8000-0000000000d4',
   'completed', 2, current_date::timestamptz + interval '1 hour'),
  ('7a120000-0000-4000-8000-000000000008', '7a120000-0000-4000-8000-0000000000e4',
   'completed', 2, current_date::timestamptz + interval '21 hours');

-- ===========================================================================
-- The STREAK member reading their own stats.
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a120000-0000-4000-8000-000000000002', true);

select is(auth.uid(), '7a120000-0000-4000-8000-000000000002'::uuid,
          'identity: caller is the STREAK member');                                        -- 1

select is((select completed_count from public.member_workout_stats where member_id = auth.uid()),
          8::bigint, 'stats: completed_count counts sessions, not days (8)');              -- 2
select is((select missed_count from public.member_workout_stats where member_id = auth.uid()),
          1::bigint, 'stats: missed_count is counted separately (1)');                     -- 3
select is((select total_effort_score from public.member_workout_stats where member_id = auth.uid()),
          40::bigint, 'stats: total_effort_score sums only completed sessions (8 x 5)');   -- 4
select is((select avg_effort_score from public.member_workout_stats where member_id = auth.uid()),
          5.00::numeric, 'stats: avg_effort_score is rounded to 2 decimals');              -- 5
select is((select current_streak from public.member_workout_stats where member_id = auth.uid()),
          7::bigint,
          'stats: current_streak is 7 DAYS -- the double session on day 0 counts once');   -- 6
select is((select count(*)::int from public.member_workout_stats), 1,
          'stats: security_invoker means a member sees exactly one row, their own');       -- 7

select is(public.has_earned_milestone(auth.uid(), 'first_day'), true,
          'milestone: first_day is earned after one completed session');                   -- 8
select is(public.has_earned_milestone(auth.uid(), 'seven_day_streak'), true,
          'milestone: seven_day_streak is earned at exactly 7 days');                      -- 9
select is(public.has_earned_milestone(auth.uid(), 'thirty_day_streak'), false,
          'milestone: thirty_day_streak is not earned at 7 days');                         -- 10
select is(public.has_earned_milestone('7a120000-0000-4000-8000-000000000003', 'first_day'), false,
          'milestone: probing a member you cannot see returns false, never null');         -- 11

select lives_ok(
  $$insert into public.milestones (member_id, tier)
    values ('7a120000-0000-4000-8000-000000000002', 'seven_day_streak')$$,
  'milestones: a member may claim a tier they have actually earned');                      -- 12
select throws_ok(
  $$insert into public.milestones (member_id, tier)
    values ('7a120000-0000-4000-8000-000000000002', 'thirty_day_streak')$$,
  '42501',
  'new row violates row-level security policy for table "milestones"',
  'milestones: a member cannot claim a tier they have not earned');                        -- 13
select throws_ok(
  $$insert into public.milestones (member_id, tier)
    values ('7a120000-0000-4000-8000-000000000003', 'first_day')$$,
  '42501',
  'new row violates row-level security policy for table "milestones"',
  'milestones: a member cannot claim a tier for someone else');                            -- 14
select is((select count(*)::int from public.milestones
            where member_id::text like '7a120000%'), 1,
          'milestones: the member reads back exactly their own award');                    -- 15

-- ===========================================================================
-- The GAP member: an island that ended three days ago is not a live streak.
-- ===========================================================================
select set_config('request.jwt.claim.sub', '7a120000-0000-4000-8000-000000000003', true);

select is(auth.uid(), '7a120000-0000-4000-8000-000000000003'::uuid,
          'identity: caller is the GAP member');                                           -- 16
select is((select completed_count from public.member_workout_stats where member_id = auth.uid()),
          3::bigint, 'gap: three completed sessions are still counted');                   -- 17
select is((select current_streak from public.member_workout_stats where member_id = auth.uid()),
          0::bigint,
          'gap: a streak whose last day is older than yesterday reads 0');                 -- 18
select is((select avg_effort_score from public.member_workout_stats where member_id = auth.uid()),
          3.00::numeric, 'gap: avg_effort_score still reflects the completed work');       -- 19
select is(public.has_earned_milestone(auth.uid(), 'first_day'), true,
          'gap: first_day survives a broken streak (it is a lifetime count)');             -- 20
select is(public.has_earned_milestone(auth.uid(), 'seven_day_streak'), false,
          'gap: seven_day_streak is not earned on a 3-day stale island');                  -- 21

-- ===========================================================================
-- The EMPTY member: present in the view with zeros, not missing from it.
-- ===========================================================================
select set_config('request.jwt.claim.sub', '7a120000-0000-4000-8000-000000000004', true);

select is((select completed_count from public.member_workout_stats where member_id = auth.uid()),
          0::bigint, 'empty: completed_count is 0, not null');                             -- 22
select is((select missed_count from public.member_workout_stats where member_id = auth.uid()),
          0::bigint, 'empty: missed_count is 0, not null');                                -- 23
select is((select total_effort_score from public.member_workout_stats where member_id = auth.uid()),
          0::bigint, 'empty: total_effort_score is 0, not null');                          -- 24
select is((select avg_effort_score from public.member_workout_stats where member_id = auth.uid()),
          null::numeric, 'empty: avg_effort_score is null (no sessions to average)');      -- 25
select is((select current_streak from public.member_workout_stats where member_id = auth.uid()),
          0::bigint, 'empty: current_streak is 0');                                        -- 26
select is(public.has_earned_milestone(auth.uid(), 'first_day'), false,
          'empty: first_day is not earned with zero sessions');                            -- 27

-- ===========================================================================
-- The UTC-midnight boundary, from both sides.
-- ===========================================================================
select set_config('request.jwt.claim.sub', '7a120000-0000-4000-8000-000000000006', true);
select is((select completed_count from public.member_workout_stats where member_id = auth.uid()),
          2::bigint, 'midnight: both sessions are counted');                               -- 28
select is((select current_streak from public.member_workout_stats where member_id = auth.uid()),
          2::bigint,
          'midnight: 23:30 and 00:30 are one hour apart but TWO UTC streak days');         -- 29

select set_config('request.jwt.claim.sub', '7a120000-0000-4000-8000-000000000008', true);
select is((select completed_count from public.member_workout_stats where member_id = auth.uid()),
          2::bigint, 'same-day: both sessions are counted');                               -- 30
select is((select current_streak from public.member_workout_stats where member_id = auth.uid()),
          1::bigint,
          'same-day: 01:00 and 21:00 are twenty hours apart but ONE UTC streak day');      -- 31

-- ===========================================================================
-- The coach sees their own roster's numbers and nobody else's.
-- ===========================================================================
select set_config('request.jwt.claim.sub', '7a120000-0000-4000-8000-000000000001', true);

select is(auth.uid(), '7a120000-0000-4000-8000-000000000001'::uuid,
          'identity: caller is coach A');                                                  -- 32
select is((select count(*)::int from public.member_workout_stats
            where member_id::text like '7a120000%'), 3,
          'coach A sees exactly their three members (not the coach row, not others)');     -- 33
select is((select completed_count from public.member_workout_stats
            where member_id = '7a120000-0000-4000-8000-000000000002'), 8::bigint,
          'coach A reads the real completed_count for their own member');                  -- 34
select is((select count(*)::int from public.member_workout_stats
            where member_id = '7a120000-0000-4000-8000-000000000006'), 0,
          'coach A sees nothing for coach B member');                                      -- 35
select is(public.has_earned_milestone('7a120000-0000-4000-8000-000000000002', 'seven_day_streak'),
          true, 'coach A may ask whether their own member earned a tier');                 -- 36
select is((select count(*)::int from public.milestones
            where member_id = '7a120000-0000-4000-8000-000000000002'), 1,
          'coach A reads their member milestone award');                                   -- 37

select set_config('request.jwt.claim.sub', '7a120000-0000-4000-8000-000000000005', true);
select is(public.has_earned_milestone('7a120000-0000-4000-8000-000000000002', 'first_day'),
          false, 'coach B cannot probe coach A member milestones');                        -- 38
select is((select count(*)::int from public.member_workout_stats
            where member_id = '7a120000-0000-4000-8000-000000000002'), 0,
          'coach B sees no stats row for coach A member');                                 -- 39
select is((select count(*)::int from public.milestones
            where member_id = '7a120000-0000-4000-8000-000000000002'), 0,
          'coach B reads no milestone rows for coach A member');                           -- 40

-- ===========================================================================
-- Admin. NOTE: profiles lets an admin see every member, but
-- workout_completions_select_owner does NOT have an admin branch, so the view
-- hands an admin a row of zeros rather than either the truth or a refusal.
-- These two assertions record that live behaviour so a later change is loud.
-- ===========================================================================
select set_config('request.jwt.claim.sub', '7a120000-0000-4000-8000-000000000007', true);

select is((select count(*)::int from public.member_workout_stats
            where member_id = '7a120000-0000-4000-8000-000000000002'), 1,
          'admin: the stats row for any member is visible (profiles has an admin branch)');-- 41
select is((select completed_count from public.member_workout_stats
            where member_id = '7a120000-0000-4000-8000-000000000002'), 0::bigint,
          'admin: but completed_count reads 0 -- workout_completions has no admin branch'); -- 42
select is(public.has_earned_milestone('7a120000-0000-4000-8000-000000000002', 'first_day'),
          true,
          'admin: the SECURITY DEFINER milestone RPC still answers true (the mismatch)');  -- 43

-- ===========================================================================
-- Stranger.
-- ===========================================================================
select set_config('request.jwt.claim.sub', '7a120000-0000-4000-8000-000000000008', true);
select is((select count(*)::int from public.member_workout_stats
            where member_id = '7a120000-0000-4000-8000-000000000002'), 0,
          'stranger sees no stats row for an unrelated member');                           -- 44
select is(public.has_earned_milestone('7a120000-0000-4000-8000-000000000002', 'first_day'),
          false, 'stranger cannot probe an unrelated member milestones');                  -- 45

-- ===========================================================================
-- anon: three direct SECURITY DEFINER calls, each false (never null, never a crash).
-- ===========================================================================
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select is(auth.uid(), null::uuid, 'identity: anon has a null auth.uid()');                 -- 46
select is(public.has_earned_milestone('7a120000-0000-4000-8000-000000000002', 'first_day'),
          false, 'anon call 1: false, not null (the three-valued-logic oracle)');          -- 47
select is(public.has_earned_milestone('7a120000-0000-4000-8000-000000000002', 'seven_day_streak'),
          false, 'anon call 2: false for a tier that really was earned');                  -- 48
select is(public.has_earned_milestone(null, 'first_day'),
          false, 'anon call 3: a null member argument is false, not null');                -- 49
select is((select count(*)::int from public.member_workout_stats
            where member_id::text like '7a120000%'), 0,
          'anon reads no stats rows');                                                     -- 50
select is((select count(*)::int from public.milestones
            where member_id::text like '7a120000%'), 0,
          'anon reads no milestone rows');                                                 -- 51
select throws_ok(
  $$insert into public.milestones (member_id, tier)
    values ('7a120000-0000-4000-8000-000000000002', 'first_day')$$,
  '42501',
  'new row violates row-level security policy for table "milestones"',
  'anon cannot award itself a milestone');                                                 -- 52

-- ===========================================================================
-- Structural guarantee the whole file leans on.
-- ===========================================================================
set local role postgres;
select ok((select 'security_invoker=true' = any (reloptions)
             from pg_class where relname = 'member_workout_stats'),
          'member_workout_stats is security_invoker (RLS follows the caller)');            -- 53

-- The same UTC-day bucketing is enforced at the storage layer too: one member
-- cannot log the same workout_day twice inside one UTC day, which is what keeps
-- completed_count from being inflatable by replaying a request.
select throws_ok(
  $$insert into public.workout_completions (member_id, workout_day_id, status, effort_score, completed_at)
    values ('7a120000-0000-4000-8000-000000000002', '7a120000-0000-4000-8000-0000000000d1',
            'completed', 5, current_date::timestamptz + interval '20 hours')$$,
  '23505',
  'duplicate key value violates unique constraint "workout_completions_member_day_date_key"',
  'a member cannot log the same workout_day twice in one UTC day');                        -- 54

select * from finish();

rollback;
