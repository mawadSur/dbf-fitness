-- ============================================================================
-- 24_finish_workout.test.sql
--
-- Pins public.finish_workout(uuid, uuid[], uuid) from 20260921100000:
--   returns table(completion_id uuid, already_logged boolean, completed_at timestamptz)
--   SECURITY DEFINER, gate in the body:
--     42501 'not_your_plan'  — no session, or the day belongs to another member
--     P0002 'day_not_found'  — unknown or archived day
--   ATOMIC (completion + ticks in one call) and IDEMPOTENT under the existing
--   one-completion-per-(member, day, UTC date) unique: a second call returns the
--   existing row with already_logged = true instead of a duplicate-key error.
--   Exercise ids that are not LIVE exercises of that day are silently ignored.
--
-- The migration's backfill statements are also re-run here against rows shaped
-- like the pre-migration ones, inside this rolled-back transaction.
--
-- CONCURRENCY: two committed sessions cannot be driven from inside one pgTAP
-- transaction (dblink is not installed and installing it would change a shared
-- database). Test 27 covers the mechanism deterministically — a completion that
-- another session already committed makes finish_workout return already_logged
-- with that row's id rather than raising. The genuinely parallel two-session
-- case was run separately against committed fixtures; see the report.
--
-- Run with: psql -X -f supabase/tests/database/24_finish_workout.test.sql
-- One transaction, rolled back. Fixture prefix 7a24... is unique to this file.
--
-- Fixtures: ..01 coach C   ..02 member M (C's, owns the plan under test)
--           ..03 member O  (C's other member, own plan)
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(28);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'h24-' || u.n || '@test.invalid', 'x', now(), now()
from (values
  ('7a240000-0000-4000-8000-000000000001'::uuid, 1),
  ('7a240000-0000-4000-8000-000000000002'::uuid, 2),
  ('7a240000-0000-4000-8000-000000000003'::uuid, 3)
) as u(id, n);

insert into public.profiles (id, role, coach_id, full_name) values
  ('7a240000-0000-4000-8000-000000000001', 'coach',  null, 'H24 Coach'),
  ('7a240000-0000-4000-8000-000000000002', 'member', '7a240000-0000-4000-8000-000000000001', 'H24 Member M'),
  ('7a240000-0000-4000-8000-000000000003', 'member', '7a240000-0000-4000-8000-000000000001', 'H24 Member O');

insert into public.workout_plans (id, member_id, coach_id, title) values
  ('7a240000-0000-4000-8000-0000000000a1', '7a240000-0000-4000-8000-000000000002', '7a240000-0000-4000-8000-000000000001', 'H24 Plan M'),
  ('7a240000-0000-4000-8000-0000000000a2', '7a240000-0000-4000-8000-000000000003', '7a240000-0000-4000-8000-000000000001', 'H24 Plan O');

insert into public.workout_days (id, workout_plan_id, day_number, block_name, duration_minutes, archived_at) values
  ('7a240000-0000-4000-8000-0000000000b1', '7a240000-0000-4000-8000-0000000000a1', 1, 'H24 Day One',   20, null),
  ('7a240000-0000-4000-8000-0000000000b2', '7a240000-0000-4000-8000-0000000000a1', 2, 'H24 Day Two',   20, now()),
  ('7a240000-0000-4000-8000-0000000000b3', '7a240000-0000-4000-8000-0000000000a1', 3, 'H24 Day Three', 20, null),
  ('7a240000-0000-4000-8000-0000000000b4', '7a240000-0000-4000-8000-0000000000a1', 4, 'H24 Day Four',  20, null),
  ('7a240000-0000-4000-8000-0000000000b9', '7a240000-0000-4000-8000-0000000000a2', 1, 'H24 Day O',     20, null);

insert into public.exercises (id, workout_day_id, name, reps_or_duration, order_index, archived_at) values
  ('7a240000-0000-4000-8000-0000000000c1', '7a240000-0000-4000-8000-0000000000b1', 'H24 Ex Live',     '10', 1, null),
  ('7a240000-0000-4000-8000-0000000000c2', '7a240000-0000-4000-8000-0000000000b1', 'H24 Ex Archived', '10', 2, now()),
  ('7a240000-0000-4000-8000-0000000000c3', '7a240000-0000-4000-8000-0000000000b3', 'H24 Ex Day Three','10', 1, null),
  ('7a240000-0000-4000-8000-0000000000c9', '7a240000-0000-4000-8000-0000000000b9', 'H24 Ex O',        '10', 1, null);

-- A scratch table so the OUT values of one call can be asserted several times.
create temporary table h24_result (label text primary key, completion_id uuid,
                                   already_logged boolean, completed_at timestamptz);
-- The assertions below run as `authenticated`, which has no rights on a table
-- created by `postgres`; this scratch table is per-session and dies with it.
grant select, insert, update, delete on h24_result to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Happy path: the member finishes day one with one live exercise ticked
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a240000-0000-4000-8000-000000000002', true);

insert into h24_result
select 'first', r.completion_id, r.already_logged, r.completed_at
from public.finish_workout(
  '7a240000-0000-4000-8000-0000000000b1',
  array['7a240000-0000-4000-8000-0000000000c1']::uuid[]
) r;

select is((select already_logged from h24_result where label = 'first'),
  false, '01 the first call reports already_logged = false');
select isnt((select completion_id from h24_result where label = 'first'),
  null, '02 the first call returns a completion id');
select isnt((select completed_at from h24_result where label = 'first'),
  null, '03 the first call returns the server-stamped completed_at');
select is((select count(*) from public.workout_completions
            where member_id = '7a240000-0000-4000-8000-000000000002'
              and workout_day_id = '7a240000-0000-4000-8000-0000000000b1'),
  1::bigint, '04 exactly one completion row was written');
select is((select count(*) from public.exercise_completions ec
            join h24_result r on r.completion_id = ec.workout_completion_id
           where r.label = 'first'),
  1::bigint, '05 the exercise tick was written in the same call');
select is((select ec.exercise_id from public.exercise_completions ec
            join h24_result r on r.completion_id = ec.workout_completion_id
           where r.label = 'first'),
  '7a240000-0000-4000-8000-0000000000c1'::uuid, '06 the tick is the exercise that was passed');

-- ---------------------------------------------------------------------------
-- Idempotency: the same call again on the same UTC day
-- ---------------------------------------------------------------------------
insert into h24_result
select 'second', r.completion_id, r.already_logged, r.completed_at
from public.finish_workout(
  '7a240000-0000-4000-8000-0000000000b1',
  array['7a240000-0000-4000-8000-0000000000c1']::uuid[]
) r;

select is((select already_logged from h24_result where label = 'second'),
  true, '07 the second call reports already_logged = true');
select is((select completion_id from h24_result where label = 'second'),
  (select completion_id from h24_result where label = 'first'),
  '08 the second call returns the SAME completion id');
select is((select count(*) from public.workout_completions
            where member_id = '7a240000-0000-4000-8000-000000000002'
              and workout_day_id = '7a240000-0000-4000-8000-0000000000b1'),
  1::bigint, '09 the second call did not create a duplicate completion');
select is((select count(*) from public.exercise_completions ec
            join h24_result r on r.completion_id = ec.workout_completion_id
           where r.label = 'first'),
  1::bigint, '10 the second call did not duplicate the tick');

-- A retry that carries ids the first call did not is still recorded: the ticks
-- are upserted whether or not the completion already existed.
select lives_ok(
  $$select * from public.finish_workout('7a240000-0000-4000-8000-0000000000b1',
      array['7a240000-0000-4000-8000-0000000000c1',
            '7a240000-0000-4000-8000-0000000000c2']::uuid[])$$,
  '11 a retry carrying extra ids does not raise');

-- ---------------------------------------------------------------------------
-- Ids that are not LIVE exercises of this day are ignored, never rejected
-- ---------------------------------------------------------------------------
select is((select count(*) from public.exercise_completions ec
            join h24_result r on r.completion_id = ec.workout_completion_id
           where r.label = 'first'),
  1::bigint, '12 an ARCHIVED exercise of this day is ignored, not ticked');

select lives_ok(
  $$select * from public.finish_workout('7a240000-0000-4000-8000-0000000000b3',
      array['7a240000-0000-4000-8000-0000000000c9',
            '7a240000-0000-4000-8000-0000000000c3',
            '7a240000-0000-4000-8000-000000000fff']::uuid[])$$,
  '13 a foreign id and an unknown id do not raise');

select is((select count(*) from public.exercise_completions ec
            join public.workout_completions wc on wc.id = ec.workout_completion_id
           where wc.workout_day_id = '7a240000-0000-4000-8000-0000000000b3'),
  1::bigint, '14 only the id that belongs to that day was ticked');
select is((select ec.exercise_id from public.exercise_completions ec
            join public.workout_completions wc on wc.id = ec.workout_completion_id
           where wc.workout_day_id = '7a240000-0000-4000-8000-0000000000b3'),
  '7a240000-0000-4000-8000-0000000000c3'::uuid, '15 and it is the right one');

-- An empty id array is the default and is legal (a member can log a session
-- without ticking anything).
select lives_ok(
  $$select * from public.finish_workout('7a240000-0000-4000-8000-0000000000b4')$$,
  '16 finishing with no exercise ids at all is legal');

-- ---------------------------------------------------------------------------
-- The gate
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select * from public.finish_workout('7a240000-0000-4000-8000-000000000eee')$$,
  'P0002', 'day_not_found', '17 an unknown day is P0002 day_not_found');

select throws_ok(
  $$select * from public.finish_workout('7a240000-0000-4000-8000-0000000000b2')$$,
  'P0002', 'day_not_found', '18 an ARCHIVED day is P0002 day_not_found');

-- another member of the same coach
select set_config('request.jwt.claim.sub', '7a240000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select * from public.finish_workout('7a240000-0000-4000-8000-0000000000b1')$$,
  '42501', 'not_your_plan', '19 another member cannot finish M''s workout');

-- the member's own coach
select set_config('request.jwt.claim.sub', '7a240000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select * from public.finish_workout('7a240000-0000-4000-8000-0000000000b1')$$,
  '42501', 'not_your_plan', '20 the member''s own coach cannot log the workout for them');

-- anon, with the claim cleared
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$select * from public.finish_workout('7a240000-0000-4000-8000-0000000000b1')$$,
  '42501', 'not_your_plan', '21 anon is refused (and the backend does not crash)');

-- ---------------------------------------------------------------------------
-- Three more days: the old direct-insert path, a legacy-shaped row, and the
-- "another session got there first" case.
-- ---------------------------------------------------------------------------
set local role postgres;
insert into public.workout_days (id, workout_plan_id, day_number, block_name, duration_minutes) values
  ('7a240000-0000-4000-8000-0000000000b5', '7a240000-0000-4000-8000-0000000000a1', 5, 'H24 Day Five',  20),
  ('7a240000-0000-4000-8000-0000000000b6', '7a240000-0000-4000-8000-0000000000a1', 6, 'H24 Day Six',   20),
  ('7a240000-0000-4000-8000-0000000000b7', '7a240000-0000-4000-8000-0000000000a1', 7, 'H24 Day Seven', 20);
insert into public.exercises (id, workout_day_id, name, reps_or_duration, order_index) values
  ('7a240000-0000-4000-8000-0000000000c6', '7a240000-0000-4000-8000-0000000000b6', 'H24 Ex Legacy', '10', 1);

-- Old-client parity: finish_workout did not tighten the direct-insert path.
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a240000-0000-4000-8000-000000000002', true);

select lives_ok(
  $$insert into public.workout_completions (id, member_id, workout_day_id, status)
    values ('7a240000-0000-4000-8000-0000000000d5', '7a240000-0000-4000-8000-000000000002',
            '7a240000-0000-4000-8000-0000000000b5', 'completed')$$,
  '22 the old two-insert client path still succeeds alongside finish_workout');

set local role postgres;
select ok(
  (select wc.day_number = 5 and wc.block_name = 'H24 Day Five' and wc.plan_rev = 1
     from public.workout_completions wc where wc.id = '7a240000-0000-4000-8000-0000000000d5')
  and
  (select wc.day_number = 1 and wc.block_name = 'H24 Day One' and wc.plan_rev = 1
     from public.workout_completions wc
     join h24_result r on r.completion_id = wc.id where r.label = 'first'),
  '23 the old path and finish_workout produce the same snapshot shape');

-- ---------------------------------------------------------------------------
-- The migration's backfill, re-run against rows shaped like the legacy ones
-- (the snapshot columns did not exist before 20260921100000, so every
-- pre-existing row arrived at the backfill with all three null).
-- ---------------------------------------------------------------------------
insert into public.workout_completions (id, member_id, workout_day_id, status)
  values ('7a240000-0000-4000-8000-0000000000d6', '7a240000-0000-4000-8000-000000000002',
          '7a240000-0000-4000-8000-0000000000b6', 'completed');
insert into public.exercise_completions (id, workout_completion_id, exercise_id)
  values ('7a240000-0000-4000-8000-0000000000e6', '7a240000-0000-4000-8000-0000000000d6',
          '7a240000-0000-4000-8000-0000000000c6');

-- Strip the snapshots back to their pre-migration state.
update public.workout_completions
   set day_number = null, block_name = null, plan_rev = null
 where id = '7a240000-0000-4000-8000-0000000000d6';
update public.exercise_completions
   set exercise_name = null
 where id = '7a240000-0000-4000-8000-0000000000e6';

-- Verbatim from 20260921100000 section 3.
update public.workout_completions wc
set day_number = wd.day_number,
    block_name = wd.block_name,
    plan_rev = wp.rev
from public.workout_days wd
join public.workout_plans wp on wp.id = wd.workout_plan_id
where wd.id = wc.workout_day_id
  and (wc.day_number is null or wc.block_name is null or wc.plan_rev is null);

update public.exercise_completions ec
set exercise_name = e.name
from public.exercises e
where e.id = ec.exercise_id
  and ec.exercise_name is null;

select is((select day_number from public.workout_completions where id = '7a240000-0000-4000-8000-0000000000d6'),
  6, '24 the backfill fills day_number on a legacy completion');
select is((select block_name from public.workout_completions where id = '7a240000-0000-4000-8000-0000000000d6'),
  'H24 Day Six', '25 the backfill fills block_name on a legacy completion');
select is((select plan_rev from public.workout_completions where id = '7a240000-0000-4000-8000-0000000000d6'),
  1, '26 the backfill fills plan_rev on a legacy completion');
select is((select exercise_name from public.exercise_completions where id = '7a240000-0000-4000-8000-0000000000e6'),
  'H24 Ex Legacy', '27 the backfill fills exercise_name on a legacy tick');

-- ---------------------------------------------------------------------------
-- Concurrency mechanism: another session committed the completion first.
-- finish_workout's ON CONFLICT DO NOTHING inserts nothing and the read-back
-- returns that row with already_logged = true, which is exactly what the loser
-- of a genuine race sees under READ COMMITTED once the winner commits.
-- ---------------------------------------------------------------------------
insert into public.workout_completions (id, member_id, workout_day_id, status)
  values ('7a240000-0000-4000-8000-0000000000d7', '7a240000-0000-4000-8000-000000000002',
          '7a240000-0000-4000-8000-0000000000b7', 'completed');

set local role authenticated;
select set_config('request.jwt.claim.sub', '7a240000-0000-4000-8000-000000000002', true);

select results_eq(
  $$select completion_id, already_logged
      from public.finish_workout('7a240000-0000-4000-8000-0000000000b7')$$,
  $$values ('7a240000-0000-4000-8000-0000000000d7'::uuid, true)$$,
  '28 a completion another session already committed is returned, not re-inserted');

set local role postgres;
select * from finish();
rollback;
