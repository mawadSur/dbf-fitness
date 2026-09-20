-- ============================================================================
-- 22_exercise_image_key.test.sql
--
-- Pins migration 20260919155000: exercises.image_key (bundled pictogram key).
-- Run with: supabase test db supabase/tests/database/22_exercise_image_key.test.sql
-- One transaction, rolled back. Fixture prefix 7a22... is unique to this file.
--
-- Fixtures: ..01 coach C1 (plan owner)  ..02 coach C2 (other coach)
--           ..03 member M1 (C1, active sub, plan member)
--           ..04 member E (C1, EXPIRED sub, plan member of a second plan)
--           ..05 stranger member (no coach)
--           ..06 platform ADMIN who coaches nobody and owns no plan
--
-- MUTANT (confirmed in a rolled-back transaction, see the report):
--   alter table public.exercises drop constraint exercises_image_key_format;
--   -> the five/six CHECK-rejection assertions turn RED.
-- A second mutant, replacing exercises_write_coach with `using (true) with check (true)`,
-- turns the other-coach / member / expired / stranger / anon assertions RED.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(33);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'h22-' || u.n || '@test.invalid', 'x', now(), now()
from (values
  ('7a220000-0000-4000-8000-000000000001'::uuid, 1),
  ('7a220000-0000-4000-8000-000000000002'::uuid, 2),
  ('7a220000-0000-4000-8000-000000000003'::uuid, 3),
  ('7a220000-0000-4000-8000-000000000004'::uuid, 4),
  ('7a220000-0000-4000-8000-000000000005'::uuid, 5),
  ('7a220000-0000-4000-8000-000000000006'::uuid, 6)
) as u(id, n);

insert into public.profiles (id, role, coach_id, full_name) values
  ('7a220000-0000-4000-8000-000000000001', 'coach',  null, 'H22 Coach One'),
  ('7a220000-0000-4000-8000-000000000002', 'coach',  null, 'H22 Coach Two'),
  ('7a220000-0000-4000-8000-000000000003', 'member', '7a220000-0000-4000-8000-000000000001', 'H22 Member'),
  ('7a220000-0000-4000-8000-000000000004', 'member', '7a220000-0000-4000-8000-000000000001', 'H22 Expired'),
  ('7a220000-0000-4000-8000-000000000005', 'member', null, 'H22 Stranger'),
  ('7a220000-0000-4000-8000-000000000006', 'admin',  null, 'H22 Admin');

insert into public.subscriptions (member_id, status, current_period_end) values
  ('7a220000-0000-4000-8000-000000000003', 'active',   now() + interval '20 days'),
  ('7a220000-0000-4000-8000-000000000004', 'past_due', now() - interval '30 days');

insert into public.workout_plans (id, member_id, coach_id, title) values
  ('7a220000-0000-4000-8000-0000000000a1', '7a220000-0000-4000-8000-000000000003', '7a220000-0000-4000-8000-000000000001', 'H22 Plan M1'),
  ('7a220000-0000-4000-8000-0000000000a2', '7a220000-0000-4000-8000-000000000004', '7a220000-0000-4000-8000-000000000001', 'H22 Plan E');
insert into public.workout_days (id, workout_plan_id, day_number, block_name, duration_minutes) values
  ('7a220000-0000-4000-8000-0000000000b1', '7a220000-0000-4000-8000-0000000000a1', 1, 'H22 Day M1', 20),
  ('7a220000-0000-4000-8000-0000000000b2', '7a220000-0000-4000-8000-0000000000a2', 1, 'H22 Day E', 20);
insert into public.exercises (id, workout_day_id, name, reps_or_duration, order_index) values
  ('7a220000-0000-4000-8000-0000000000c1', '7a220000-0000-4000-8000-0000000000b1', 'H22 Ex1', '10', 1),
  ('7a220000-0000-4000-8000-0000000000c2', '7a220000-0000-4000-8000-0000000000b2', 'H22 Ex2', '10', 1);

-- 1-2 column shape ----------------------------------------------------------
select col_type_is('public', 'exercises', 'image_key', 'text', '1 image_key is text');
select col_is_null('public', 'exercises', 'image_key', '2 image_key is nullable');

-- 3-5 CHECK accepts valid keys (superuser) -----------------------------------
select lives_ok($$update public.exercises set image_key = 'push-up' where id = '7a220000-0000-4000-8000-0000000000c1'$$, '3 CHECK accepts push-up');
select lives_ok($$update public.exercises set image_key = 'a' where id = '7a220000-0000-4000-8000-0000000000c1'$$, '4 CHECK accepts a single char');
select lives_ok($$update public.exercises set image_key = repeat('a', 40) where id = '7a220000-0000-4000-8000-0000000000c1'$$, '5 CHECK accepts exactly 40 chars');

-- 6-11 CHECK rejects invalid keys ---------------------------------------------
select throws_ok($$update public.exercises set image_key = 'Push Up' where id = '7a220000-0000-4000-8000-0000000000c1'$$, '23514', null, '6 rejects "Push Up"');
select throws_ok($$update public.exercises set image_key = 'push_up' where id = '7a220000-0000-4000-8000-0000000000c1'$$, '23514', null, '7 rejects "push_up"');
select throws_ok($$update public.exercises set image_key = '-x' where id = '7a220000-0000-4000-8000-0000000000c1'$$, '23514', null, '8 rejects leading hyphen');
select throws_ok($$update public.exercises set image_key = '' where id = '7a220000-0000-4000-8000-0000000000c1'$$, '23514', null, '9 rejects empty string');
select throws_ok($$update public.exercises set image_key = repeat('a', 41) where id = '7a220000-0000-4000-8000-0000000000c1'$$, '23514', null, '10 rejects 41 chars');
select throws_ok($$update public.exercises set image_key = 'x-' where id = '7a220000-0000-4000-8000-0000000000c1'$$, '23514', null, '11 rejects trailing hyphen');

update public.exercises set image_key = null where id in ('7a220000-0000-4000-8000-0000000000c1', '7a220000-0000-4000-8000-0000000000c2');

-- 12-14 the plan's coach can set and clear ------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a220000-0000-4000-8000-000000000001', true);
select is(auth.uid(), '7a220000-0000-4000-8000-000000000001'::uuid, '12 identity is coach C1');
update public.exercises set image_key = 'burpee' where id = '7a220000-0000-4000-8000-0000000000c1';
set local role postgres;
select is((select image_key from public.exercises where id = '7a220000-0000-4000-8000-0000000000c1'), 'burpee', '13 plan coach set image_key');
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a220000-0000-4000-8000-000000000001', true);
update public.exercises set image_key = null where id = '7a220000-0000-4000-8000-0000000000c1';
set local role postgres;
select is((select image_key from public.exercises where id = '7a220000-0000-4000-8000-0000000000c1'), null, '14 plan coach cleared image_key');

-- 15-16 other coach cannot (write ignored) and cannot even read the row -------
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a220000-0000-4000-8000-000000000002', true);
update public.exercises set image_key = 'plank' where id = '7a220000-0000-4000-8000-0000000000c1';
set local role postgres;
select is((select image_key from public.exercises where id = '7a220000-0000-4000-8000-0000000000c1'), null, '15 other coach cannot set image_key');
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a220000-0000-4000-8000-000000000002', true);
select is((select count(*)::int from public.exercises where id = '7a220000-0000-4000-8000-0000000000c1'), 0, '16 other coach cannot see the exercise');
set local role postgres;

-- 17-18 plan's own (active) member cannot -------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a220000-0000-4000-8000-000000000003', true);
select is((select count(*)::int from public.exercises where id = '7a220000-0000-4000-8000-0000000000c1'), 1, '17 plan member can read own exercise (control)');
update public.exercises set image_key = 'plank' where id = '7a220000-0000-4000-8000-0000000000c1';
set local role postgres;
select is((select image_key from public.exercises where id = '7a220000-0000-4000-8000-0000000000c1'), null, '18 plan member cannot set image_key');

-- 19-20 expired member (of their own plan) cannot ------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a220000-0000-4000-8000-000000000004', true);
select is((select state from public.get_subscription_state()), 'expired', '19 expired member state is expired (control)');
update public.exercises set image_key = 'plank' where id = '7a220000-0000-4000-8000-0000000000c2';
set local role postgres;
select is((select image_key from public.exercises where id = '7a220000-0000-4000-8000-0000000000c2'), null, '20 expired member cannot set image_key');

-- 21-22 stranger cannot ---------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a220000-0000-4000-8000-000000000005', true);
update public.exercises set image_key = 'plank' where id = '7a220000-0000-4000-8000-0000000000c1';
set local role postgres;
select is((select image_key from public.exercises where id = '7a220000-0000-4000-8000-0000000000c1'), null, '21 stranger cannot set image_key');
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a220000-0000-4000-8000-000000000005', true);
select is((select count(*)::int from public.exercises where id in ('7a220000-0000-4000-8000-0000000000c1', '7a220000-0000-4000-8000-0000000000c2')), 0, '22 stranger cannot see the exercises');
set local role postgres;

-- 23-24 anon cannot ----------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
update public.exercises set image_key = 'plank' where id = '7a220000-0000-4000-8000-0000000000c1';
select is((select count(*)::int from public.exercises where id = '7a220000-0000-4000-8000-0000000000c1'), 0, '23 anon cannot see the exercise');
set local role postgres;
select is((select image_key from public.exercises where id = '7a220000-0000-4000-8000-0000000000c1'), null, '24 anon cannot set image_key');

-- 25 member cannot insert an exercise with an image_key on their plan -------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a220000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$insert into public.exercises (workout_day_id, name, reps_or_duration, order_index, image_key)
    values ('7a220000-0000-4000-8000-0000000000b1', 'H22 Sneaky', '1', 9, 'plank')$$,
  '42501', null, '25 member cannot insert an exercise carrying image_key');
set local role postgres;

-- 26-27 coach insert with a valid key works, invalid key rejected by CHECK ----------
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a220000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$insert into public.exercises (workout_day_id, name, reps_or_duration, order_index, image_key)
    values ('7a220000-0000-4000-8000-0000000000b1', 'H22 New', '1', 8, 'high-knees')$$,
  '26 plan coach can insert with a valid image_key');
select throws_ok(
  $$insert into public.exercises (workout_day_id, name, reps_or_duration, order_index, image_key)
    values ('7a220000-0000-4000-8000-0000000000b1', 'H22 Bad', '1', 7, 'High Knees')$$,
  '23514', null, '27 plan coach insert with an invalid image_key hits the CHECK');
set local role postgres;

-- 28 column comment documents the null fallback ---------------------------------------
select matches(col_description('public.exercises'::regclass, (select attnum from pg_attribute where attrelid = 'public.exercises'::regclass and attname = 'image_key')),
  'NULL means the client resolves', '28 column comment explains null');

-- 29-30 seed rows (skipped as vacuous if the demo seed is absent is NOT allowed: assert) -
select is((select count(*)::int from public.exercises where workout_day_id::text like '44444444-4444-4444-4444-4444444444%' and image_key is not null), 7, '29 all 7 seeded exercises carry an image_key');
select results_eq(
  $$select name, image_key from public.exercises where workout_day_id::text like '44444444-4444-4444-4444-4444444444%' order by name$$,
  $$values ('Bodyweight Squats'::text, 'bodyweight-squat'::text), ('Burpees', 'burpee'), ('High Knees', 'high-knees'),
           ('Mountain Climbers', 'mountain-climber'), ('Plank Hold', 'plank'), ('Push-Ups', 'push-up'), ('Walking Lunges', 'walking-lunge')$$,
  '30 seeded exercises carry the expected keys');

-- 31-33 a platform admin who is NOT the plan's coach ---------------------------------
--
-- The two policies deliberately disagree, and that IS the intended behaviour:
--   exercises_select_admin  using (is_admin())                       -> reads everything
--   exercises_write_coach   using/check (is_coach_or_admin()
--                             and is_coach_of_workout_day(day))      -> owner coach only
-- `is_coach_of_workout_day` matches `workout_plans.coach_id = auth.uid()` and has no
-- admin branch, so being an admin buys visibility for support/moderation but never the
-- right to rewrite another coach's programming. Asserted here so a later "admins can do
-- anything" shortcut in either policy turns this file red.
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a220000-0000-4000-8000-000000000006', true);
select is((select count(*)::int from public.exercises where id = '7a220000-0000-4000-8000-0000000000c1'), 1, '31 admin can READ an exercise on a plan they do not coach');
update public.exercises set image_key = 'plank' where id = '7a220000-0000-4000-8000-0000000000c1';
set local role postgres;
select is((select image_key from public.exercises where id = '7a220000-0000-4000-8000-0000000000c1'), null, '32 admin who is not the plan coach cannot set image_key');
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a220000-0000-4000-8000-000000000006', true);
select throws_ok(
  $$insert into public.exercises (workout_day_id, name, reps_or_duration, order_index, image_key)
    values ('7a220000-0000-4000-8000-0000000000b1', 'H22 Admin Ex', '1', 6, 'plank')$$,
  '42501', null, '33 admin cannot insert an exercise on a plan they do not coach');
set local role postgres;

select * from finish();
rollback;
