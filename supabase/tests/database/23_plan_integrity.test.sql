-- ============================================================================
-- 23_plan_integrity.test.sql
--
-- Pins migration 20260921100000_plan_integrity.sql:
--   * one workout_plan per member (UNIQUE(member_id)), rev defaults to 1
--   * archived_at soft delete on workout_days / exercises; members stop seeing
--     archived rows, the CURRENT coach and admins still do
--   * a member's history survives deleting the day / exercise / plan / coach
--     (ON DELETE SET NULL + day_number / block_name / plan_rev / exercise_name
--     snapshots filled by BEFORE INSERT triggers)
--   * plan / day / exercise / completion authorization follows the member's
--     CURRENT coach (is_coach_of_member), not the plan's AUTHOR
--   * exercise_completions rejects an exercise from another day
--   * workout_days (plan, day_number) unique is DEFERRABLE (day reorder)
--   * the old direct-insert client path still works
--   * anon can call every new SECURITY DEFINER function without a segfault
--
-- Run with: psql -X -f supabase/tests/database/23_plan_integrity.test.sql
--        or supabase test db supabase/tests/database/23_plan_integrity.test.sql
-- One transaction, rolled back. Fixture prefix 7a23... is unique to this file.
--
-- Fixtures: ..01 coach C1  — the plan's AUTHOR, M's coach at the start
--           ..02 coach C2  — M's coach after the switch (authored nothing)
--           ..03 member M  — owns the plan under test
--           ..04 member O  — another coach's member, own plan
--           ..05 coach C3  — O's coach, never coached M
--           ..06 admin
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(48);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'h23-' || u.n || '@test.invalid', 'x', now(), now()
from (values
  ('7a230000-0000-4000-8000-000000000001'::uuid, 1),
  ('7a230000-0000-4000-8000-000000000002'::uuid, 2),
  ('7a230000-0000-4000-8000-000000000003'::uuid, 3),
  ('7a230000-0000-4000-8000-000000000004'::uuid, 4),
  ('7a230000-0000-4000-8000-000000000005'::uuid, 5),
  ('7a230000-0000-4000-8000-000000000006'::uuid, 6)
) as u(id, n);

insert into public.profiles (id, role, coach_id, full_name) values
  ('7a230000-0000-4000-8000-000000000001', 'coach',  null, 'H23 Coach One'),
  ('7a230000-0000-4000-8000-000000000002', 'coach',  null, 'H23 Coach Two'),
  ('7a230000-0000-4000-8000-000000000003', 'member', '7a230000-0000-4000-8000-000000000001', 'H23 Member M'),
  ('7a230000-0000-4000-8000-000000000004', 'member', '7a230000-0000-4000-8000-000000000005', 'H23 Member O'),
  ('7a230000-0000-4000-8000-000000000005', 'coach',  null, 'H23 Coach Three'),
  ('7a230000-0000-4000-8000-000000000006', 'admin',  null, 'H23 Admin');

-- M's plan, authored by C1. Day b1 is live, day b2 is ARCHIVED.
insert into public.workout_plans (id, member_id, coach_id, title) values
  ('7a230000-0000-4000-8000-0000000000a1', '7a230000-0000-4000-8000-000000000003', '7a230000-0000-4000-8000-000000000001', 'H23 Plan M'),
  ('7a230000-0000-4000-8000-0000000000a2', '7a230000-0000-4000-8000-000000000004', '7a230000-0000-4000-8000-000000000005', 'H23 Plan O');

insert into public.workout_days (id, workout_plan_id, day_number, block_name, duration_minutes, archived_at) values
  ('7a230000-0000-4000-8000-0000000000b1', '7a230000-0000-4000-8000-0000000000a1', 1, 'H23 Day One', 20, null),
  ('7a230000-0000-4000-8000-0000000000b2', '7a230000-0000-4000-8000-0000000000a1', 2, 'H23 Day Two', 20, now()),
  ('7a230000-0000-4000-8000-0000000000b3', '7a230000-0000-4000-8000-0000000000a1', 3, 'H23 Day Three', 20, null),
  ('7a230000-0000-4000-8000-0000000000b9', '7a230000-0000-4000-8000-0000000000a2', 1, 'H23 Day O', 20, null);

-- c1 live on b1, c2 ARCHIVED on b1, c3 live on b3, c9 lives on O's day.
insert into public.exercises (id, workout_day_id, name, reps_or_duration, order_index, archived_at) values
  ('7a230000-0000-4000-8000-0000000000c1', '7a230000-0000-4000-8000-0000000000b1', 'H23 Ex Live',     '10', 1, null),
  ('7a230000-0000-4000-8000-0000000000c2', '7a230000-0000-4000-8000-0000000000b1', 'H23 Ex Archived', '10', 2, now()),
  ('7a230000-0000-4000-8000-0000000000c3', '7a230000-0000-4000-8000-0000000000b3', 'H23 Ex Other Day','10', 1, null),
  ('7a230000-0000-4000-8000-0000000000c9', '7a230000-0000-4000-8000-0000000000b9', 'H23 Ex O',        '10', 1, null);

-- ---------------------------------------------------------------------------
-- Schema shape
-- ---------------------------------------------------------------------------
set local role postgres;

select ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'workout_plans_member_id_key'),
  '01 workout_plans has a UNIQUE index on member_id');

select is(
  (select rev from public.workout_plans where id = '7a230000-0000-4000-8000-0000000000a1'),
  1, '02 workout_plans.rev defaults to 1');

select throws_ok(
  $$insert into public.workout_plans (member_id, coach_id, title)
    values ('7a230000-0000-4000-8000-000000000003', '7a230000-0000-4000-8000-000000000001', 'H23 Second Plan')$$,
  '23505', null, '03 a second plan for the same member is rejected');

select is(
  (select confdeltype::text from pg_constraint where conname = 'workout_completions_workout_day_id_fkey'),
  'n', '04 workout_completions.workout_day_id FK is ON DELETE SET NULL');

select is(
  (select confdeltype::text from pg_constraint where conname = 'exercise_completions_exercise_id_fkey'),
  'n', '05 exercise_completions.exercise_id FK is ON DELETE SET NULL');

select ok(
  (select condeferrable from pg_constraint where conname = 'workout_days_workout_plan_id_day_number_key'),
  '06 the (plan, day_number) unique is DEFERRABLE');

select is(
  (select is_nullable from information_schema.columns
    where table_schema = 'public' and table_name = 'workout_completions' and column_name = 'workout_day_id'),
  'YES', '07 workout_completions.workout_day_id is nullable');

-- ---------------------------------------------------------------------------
-- SELECT matrix, before the coach switch (C1 is M's CURRENT coach and author)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a230000-0000-4000-8000-000000000003', true);

select is((select count(*) from public.workout_plans where id = '7a230000-0000-4000-8000-0000000000a1'),
  1::bigint, '08 member sees their own plan');
select is((select count(*) from public.workout_days where id = '7a230000-0000-4000-8000-0000000000b1'),
  1::bigint, '09 member sees a live day');
select is((select count(*) from public.workout_days where id = '7a230000-0000-4000-8000-0000000000b2'),
  0::bigint, '10 member does NOT see an archived day');
select is((select count(*) from public.exercises where id = '7a230000-0000-4000-8000-0000000000c1'),
  1::bigint, '11 member sees a live exercise');
select is((select count(*) from public.exercises where id = '7a230000-0000-4000-8000-0000000000c2'),
  0::bigint, '12 member does NOT see an archived exercise');
select is((select count(*) from public.workout_plans where id = '7a230000-0000-4000-8000-0000000000a2'),
  0::bigint, '13 member does not see another member''s plan');

-- other member
select set_config('request.jwt.claim.sub', '7a230000-0000-4000-8000-000000000004', true);
select is((select count(*) from public.workout_plans where id = '7a230000-0000-4000-8000-0000000000a1'),
  0::bigint, '14 another member does not see M''s plan');
select is((select count(*) from public.workout_days where workout_plan_id = '7a230000-0000-4000-8000-0000000000a1'),
  0::bigint, '15 another member does not see M''s days');

-- current coach C1
select set_config('request.jwt.claim.sub', '7a230000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.workout_plans where id = '7a230000-0000-4000-8000-0000000000a1'),
  1::bigint, '16 the current coach sees the plan');
select is((select count(*) from public.workout_days where id = '7a230000-0000-4000-8000-0000000000b2'),
  1::bigint, '17 the current coach sees an ARCHIVED day');
select is((select count(*) from public.exercises where id = '7a230000-0000-4000-8000-0000000000c2'),
  1::bigint, '18 the current coach sees an ARCHIVED exercise');

-- an unrelated coach
select set_config('request.jwt.claim.sub', '7a230000-0000-4000-8000-000000000005', true);
select is((select count(*) from public.workout_plans where id = '7a230000-0000-4000-8000-0000000000a1'),
  0::bigint, '19 a coach who does not coach M sees nothing of M''s plan');
-- RLS filters the row out of the UPDATE's scope, so Postgres reports 0 rows
-- rather than raising: the assertion is that nothing changed.
update public.workout_plans set title = 'H23 Hijack'
  where id = '7a230000-0000-4000-8000-0000000000a1';
set local role postgres;
select is((select title from public.workout_plans where id = '7a230000-0000-4000-8000-0000000000a1'),
  'H23 Plan M', '20 an unrelated coach''s UPDATE of M''s plan changes nothing');
set local role authenticated;

-- admin (read-only on this chain, pinned by test 21)
select set_config('request.jwt.claim.sub', '7a230000-0000-4000-8000-000000000006', true);
select is((select count(*) from public.workout_plans where id = '7a230000-0000-4000-8000-0000000000a1'),
  1::bigint, '21 an admin reads the plan');

-- anon
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is((select count(*) from public.workout_plans where id = '7a230000-0000-4000-8000-0000000000a1'),
  0::bigint, '22 anon reads no plan');
select is((select count(*) from public.workout_days where workout_plan_id = '7a230000-0000-4000-8000-0000000000a1'),
  0::bigint, '23 anon reads no day');
select is((select count(*) from public.exercises where workout_day_id = '7a230000-0000-4000-8000-0000000000b1'),
  0::bigint, '24 anon reads no exercise');

-- ---------------------------------------------------------------------------
-- Old-client parity + the snapshot triggers
-- The shipped client inserts the completion and then the ticks, directly.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a230000-0000-4000-8000-000000000003', true);

select lives_ok(
  $$insert into public.workout_completions (id, member_id, workout_day_id, status)
    values ('7a230000-0000-4000-8000-0000000000d1', '7a230000-0000-4000-8000-000000000003',
            '7a230000-0000-4000-8000-0000000000b1', 'completed')$$,
  '25 old client: a member still inserts their completion directly');

select lives_ok(
  $$insert into public.exercise_completions (workout_completion_id, exercise_id)
    values ('7a230000-0000-4000-8000-0000000000d1', '7a230000-0000-4000-8000-0000000000c1')$$,
  '26 old client: a member still inserts an exercise tick directly');

set local role postgres;
select is((select day_number from public.workout_completions where id = '7a230000-0000-4000-8000-0000000000d1'),
  1, '27 the BEFORE INSERT trigger snapshots day_number');
select is((select block_name from public.workout_completions where id = '7a230000-0000-4000-8000-0000000000d1'),
  'H23 Day One', '28 the BEFORE INSERT trigger snapshots block_name');
select is((select plan_rev from public.workout_completions where id = '7a230000-0000-4000-8000-0000000000d1'),
  1, '29 the BEFORE INSERT trigger snapshots plan_rev');
select is((select exercise_name from public.exercise_completions
            where workout_completion_id = '7a230000-0000-4000-8000-0000000000d1'),
  'H23 Ex Live', '30 the BEFORE INSERT trigger snapshots exercise_name');

-- ---------------------------------------------------------------------------
-- exercise_completions integrity: the exercise must belong to the day
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a230000-0000-4000-8000-000000000003', true);

select throws_ok(
  $$insert into public.exercise_completions (workout_completion_id, exercise_id)
    values ('7a230000-0000-4000-8000-0000000000d1', '7a230000-0000-4000-8000-0000000000c3')$$,
  null, null, '31 an exercise from ANOTHER day of the same plan is rejected');

select throws_ok(
  $$insert into public.exercise_completions (workout_completion_id, exercise_id)
    values ('7a230000-0000-4000-8000-0000000000d1', '7a230000-0000-4000-8000-0000000000c9')$$,
  null, null, '32 an exercise from another member''s day is rejected');

-- ---------------------------------------------------------------------------
-- History survives deleting the day (and, through it, the exercises)
-- ---------------------------------------------------------------------------
set local role postgres;
insert into public.workout_completions (id, member_id, workout_day_id, status)
  values ('7a230000-0000-4000-8000-0000000000d3', '7a230000-0000-4000-8000-000000000003',
          '7a230000-0000-4000-8000-0000000000b3', 'completed');
insert into public.exercise_completions (workout_completion_id, exercise_id)
  values ('7a230000-0000-4000-8000-0000000000d3', '7a230000-0000-4000-8000-0000000000c3');

delete from public.workout_days where id = '7a230000-0000-4000-8000-0000000000b3';

select is((select count(*) from public.workout_completions where id = '7a230000-0000-4000-8000-0000000000d3'),
  1::bigint, '33 deleting the day does NOT erase the member''s completion');
select is((select workout_day_id from public.workout_completions where id = '7a230000-0000-4000-8000-0000000000d3'),
  null, '34 the deleted day''s FK is set to null, not cascaded');
select is((select day_number from public.workout_completions where id = '7a230000-0000-4000-8000-0000000000d3'),
  3, '35 the completion still knows which day number it was');
select is((select block_name from public.workout_completions where id = '7a230000-0000-4000-8000-0000000000d3'),
  'H23 Day Three', '36 the completion still knows the block name');
select is((select count(*) from public.exercise_completions
            where workout_completion_id = '7a230000-0000-4000-8000-0000000000d3'),
  1::bigint, '37 the exercise tick survives the exercise being deleted');
select is((select exercise_id from public.exercise_completions
            where workout_completion_id = '7a230000-0000-4000-8000-0000000000d3'),
  null, '38 the deleted exercise''s FK is set to null');
select is((select exercise_name from public.exercise_completions
            where workout_completion_id = '7a230000-0000-4000-8000-0000000000d3'),
  'H23 Ex Other Day', '39 the tick still knows which exercise it was');

-- ---------------------------------------------------------------------------
-- Authorization follows the CURRENT coach, not the plan's author
-- M switches from C1 (who WROTE the plan) to C2 (who wrote nothing).
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a230000-0000-4000-8000-000000000003', true);
select public.choose_coach('7a230000-0000-4000-8000-000000000002');

-- the FORMER coach, still recorded as workout_plans.coach_id
select set_config('request.jwt.claim.sub', '7a230000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.workout_plans where id = '7a230000-0000-4000-8000-0000000000a1'),
  0::bigint, '40 the FORMER coach loses the plan even though they authored it');
select is((select count(*) from public.workout_completions where member_id = '7a230000-0000-4000-8000-000000000003'),
  0::bigint, '41 the FORMER coach loses the member''s history');
update public.workout_plans set title = 'H23 Former'
  where id = '7a230000-0000-4000-8000-0000000000a1';
set local role postgres;
select is((select title from public.workout_plans where id = '7a230000-0000-4000-8000-0000000000a1'),
  'H23 Plan M', '42 the FORMER coach''s UPDATE of the plan they authored changes nothing');
set local role authenticated;

-- the NEW coach, who authored nothing
select set_config('request.jwt.claim.sub', '7a230000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.workout_plans where id = '7a230000-0000-4000-8000-0000000000a1'),
  1::bigint, '43 the NEW coach gains the plan they did not author');
select is((select count(*) from public.workout_completions where member_id = '7a230000-0000-4000-8000-000000000003'),
  2::bigint, '44 the NEW coach gains the member''s history');
select lives_ok(
  $$update public.workout_plans set title = 'H23 Retitled by the new coach'
     where id = '7a230000-0000-4000-8000-0000000000a1'$$,
  '45 the NEW coach can update the plan');

-- ---------------------------------------------------------------------------
-- Direct anon calls of every function this migration added or redefined.
-- Postgres 17.6 segfaults when a role calls a SECURITY DEFINER function it has
-- no EXECUTE on, so this path is exercised for real rather than reasoned about.
-- ---------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select is(public.is_coach_of_workout_day('7a230000-0000-4000-8000-0000000000b1'),
  false, '46 anon calling is_coach_of_workout_day gets false, not a crash');
select throws_ok(
  $$select * from public.finish_workout('7a230000-0000-4000-8000-0000000000b1')$$,
  '42501', 'not_your_plan', '47 anon calling finish_workout is refused, not crashed');

-- ---------------------------------------------------------------------------
-- Day reorder: two UPDATEs that collide mid-way are legal because the unique
-- is DEFERRABLE INITIALLY DEFERRED. SET CONSTRAINTS ... IMMEDIATE forces the
-- check inside this transaction, which is never committed.
-- ---------------------------------------------------------------------------
set local role postgres;
update public.workout_days set day_number = 2 where id = '7a230000-0000-4000-8000-0000000000b1';
update public.workout_days set day_number = 1 where id = '7a230000-0000-4000-8000-0000000000b2';

select lives_ok(
  $$set constraints public.workout_days_workout_plan_id_day_number_key immediate$$,
  '48 swapping two day numbers passes the deferred unique at check time');

select * from finish();
rollback;
