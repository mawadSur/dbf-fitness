-- ============================================================================
-- 25_exercise_prescription.test.sql
--
-- Pins migration 20260921110000_exercise_prescription.sql:
--   * the CHECK bounds on every structured column
--   * the fill trigger in BOTH directions — structured write re-derives
--     reps_or_duration, legacy write parses structure out of the text
--   * BACKWARD COMPATIBILITY: a pre-D1b client that writes only
--     reps_or_duration still succeeds and reads back byte-for-byte
--   * the backfill statements, replayed here on legacy-shaped rows inside the
--     rolled-back transaction
--   * anon can call every new function directly without a segfault
--
-- Run with: psql -X -f supabase/tests/database/25_exercise_prescription.test.sql
--        or supabase test db supabase/tests/database/25_exercise_prescription.test.sql
-- One transaction, rolled back. Fixture prefix 7a25... is unique to this file.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(34);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'h25-' || u.n || '@test.invalid', 'x', now(), now()
from (values
  ('7a250000-0000-4000-8000-000000000001'::uuid, 1),
  ('7a250000-0000-4000-8000-000000000003'::uuid, 3)
) as u(id, n);

insert into public.profiles (id, role, coach_id, full_name) values
  ('7a250000-0000-4000-8000-000000000001', 'coach',  null, 'H25 Coach'),
  ('7a250000-0000-4000-8000-000000000003', 'member', '7a250000-0000-4000-8000-000000000001', 'H25 Member');

insert into public.workout_plans (id, member_id, coach_id, title) values
  ('7a250000-0000-4000-8000-0000000000a1', '7a250000-0000-4000-8000-000000000003',
   '7a250000-0000-4000-8000-000000000001', 'H25 Plan');

insert into public.workout_days (id, workout_plan_id, day_number, block_name) values
  ('7a250000-0000-4000-8000-0000000000b1', '7a250000-0000-4000-8000-0000000000a1', 1, 'H25 Day');

set local role postgres;

-- ---------------------------------------------------------------------------
-- Bounds. Each one is a separate CHECK the coach can hit by typing.
-- ---------------------------------------------------------------------------

select throws_ok(
  $$insert into public.exercises (workout_day_id, name, reps_or_duration, order_index, prescription_mode, sets, reps_min)
    values ('7a250000-0000-4000-8000-0000000000b1','H25 x','x',1,'reps',21,10)$$,
  '23514', null, '01 sets above 20 is rejected');

select throws_ok(
  $$insert into public.exercises (workout_day_id, name, reps_or_duration, order_index, prescription_mode, reps_min)
    values ('7a250000-0000-4000-8000-0000000000b1','H25 x','x',1,'reps',101)$$,
  '23514', null, '02 reps above 100 is rejected');

select throws_ok(
  $$insert into public.exercises (workout_day_id, name, reps_or_duration, order_index, prescription_mode, seconds)
    values ('7a250000-0000-4000-8000-0000000000b1','H25 x','x',1,'seconds',3601)$$,
  '23514', null, '03 seconds above 3600 is rejected');

select throws_ok(
  $$insert into public.exercises (workout_day_id, name, reps_or_duration, order_index, prescription_mode, reps_min, rest_seconds)
    values ('7a250000-0000-4000-8000-0000000000b1','H25 x','x',1,'reps',10,601)$$,
  '23514', null, '04 rest above 600 is rejected');

select throws_ok(
  $$insert into public.exercises (workout_day_id, name, reps_or_duration, order_index, prescription_mode, reps_min, weight)
    values ('7a250000-0000-4000-8000-0000000000b1','H25 x','x',1,'reps',10,1001)$$,
  '23514', null, '05 weight above 1000 is rejected');

select throws_ok(
  $$insert into public.exercises (workout_day_id, name, reps_or_duration, order_index, prescription_mode, distance_m)
    values ('7a250000-0000-4000-8000-0000000000b1','H25 x','x',1,'distance',100001)$$,
  '23514', null, '06 distance above 100000 m is rejected');

select throws_ok(
  $$insert into public.exercises (workout_day_id, name, reps_or_duration, order_index, prescription_mode, reps_min, reps_max)
    values ('7a250000-0000-4000-8000-0000000000b1','H25 x','x',1,'range',12,8)$$,
  '23514', null, '07 reps_max below reps_min is rejected');

select throws_ok(
  $$insert into public.exercises (workout_day_id, name, reps_or_duration, order_index, prescription_mode)
    values ('7a250000-0000-4000-8000-0000000000b1','H25 x','x',1,'tabata')$$,
  '23514', null, '08 an unknown prescription_mode is rejected');

select throws_ok(
  $$insert into public.exercises (workout_day_id, name, reps_or_duration, order_index, weight_unit, prescription_mode, reps_min)
    values ('7a250000-0000-4000-8000-0000000000b1','H25 x','x',1,'stone','reps',10)$$,
  '23514', null, '09 a weight unit other than kg/lb is rejected');

select throws_ok(
  $$insert into public.exercises (workout_day_id, name, reps_or_duration, order_index, exercise_key)
    values ('7a250000-0000-4000-8000-0000000000b1','H25 x','x',1,'Not Kebab Case')$$,
  '23514', null, '10 a non-kebab-case exercise_key is rejected');

select throws_ok(
  $$insert into public.exercises (workout_day_id, name, reps_or_duration, order_index, video_url)
    values ('7a250000-0000-4000-8000-0000000000b1','H25 x','x',1,'http://example.com/v.mp4')$$,
  '23514', null, '11 a plain-http video_url is rejected');

select lives_ok(
  $$insert into public.exercises (id, workout_day_id, name, reps_or_duration, order_index, video_url)
    values ('7a250000-0000-4000-8000-0000000000cf','7a250000-0000-4000-8000-0000000000b1','H25 https','10 reps',9,'https://example.com/v.mp4')$$,
  '12 an https video_url is accepted');

-- ---------------------------------------------------------------------------
-- Direction 1: a structured write re-derives the legacy text.
-- ---------------------------------------------------------------------------

insert into public.exercises (id, workout_day_id, name, reps_or_duration, order_index,
                              prescription_mode, sets, reps_min, reps_max, rest_seconds)
values ('7a250000-0000-4000-8000-0000000000c1', '7a250000-0000-4000-8000-0000000000b1',
        'H25 Structured', 'placeholder', 1, 'range', 3, 8, 12, 60);

select is(
  (select reps_or_duration from public.exercises where id = '7a250000-0000-4000-8000-0000000000c1'),
  '3x8-12 reps', '13 a structured insert overwrites the supplied text with the rendered one');

update public.exercises set seconds = 45, prescription_mode = 'seconds', reps_min = null, reps_max = null
 where id = '7a250000-0000-4000-8000-0000000000c1';

select is(
  (select reps_or_duration from public.exercises where id = '7a250000-0000-4000-8000-0000000000c1'),
  '3x45s', '14 changing the structure re-renders the text');

update public.exercises set weight = 20, weight_unit = 'kg'
 where id = '7a250000-0000-4000-8000-0000000000c1';

select is(
  (select reps_or_duration from public.exercises where id = '7a250000-0000-4000-8000-0000000000c1'),
  '3x45s @ 20kg', '15 a whole-number weight renders without a trailing decimal point');

update public.exercises set weight = 22.5, weight_unit = 'lb'
 where id = '7a250000-0000-4000-8000-0000000000c1';

select is(
  (select reps_or_duration from public.exercises where id = '7a250000-0000-4000-8000-0000000000c1'),
  '3x45s @ 22.5lb', '16 a fractional weight keeps its decimal');

select is(
  (select exercise_key from public.exercises where id = '7a250000-0000-4000-8000-0000000000c1'),
  'h25-structured', '17 exercise_key is derived from the name when not supplied');

-- ---------------------------------------------------------------------------
-- Direction 2: a LEGACY write keeps its text verbatim and gets structure
-- parsed out of it. This is the backward-compatibility guarantee.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '7a250000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$insert into public.exercises (id, workout_day_id, name, reps_or_duration, order_index)
    values ('7a250000-0000-4000-8000-0000000000c2','7a250000-0000-4000-8000-0000000000b1',
            'H25 Legacy','10 reps/leg',2)$$,
  '18 an old client writing only reps_or_duration still succeeds');

set local role postgres;

select is(
  (select reps_or_duration from public.exercises where id = '7a250000-0000-4000-8000-0000000000c2'),
  '10 reps/leg', '19 the old client reads back its own text byte-for-byte');

select is(
  (select prescription_mode || '/' || reps_min::text from public.exercises
    where id = '7a250000-0000-4000-8000-0000000000c2'),
  'per_side/10', '20 structure was parsed out of the legacy text');

insert into public.exercises (id, workout_day_id, name, reps_or_duration, order_index) values
  ('7a250000-0000-4000-8000-0000000000d1','7a250000-0000-4000-8000-0000000000b1','H25 L1','3x10',3),
  ('7a250000-0000-4000-8000-0000000000d2','7a250000-0000-4000-8000-0000000000b1','H25 L2','8-12 reps',4),
  ('7a250000-0000-4000-8000-0000000000d3','7a250000-0000-4000-8000-0000000000b1','H25 L3','2 min',5),
  ('7a250000-0000-4000-8000-0000000000d4','7a250000-0000-4000-8000-0000000000b1','H25 L4','400m',6),
  ('7a250000-0000-4000-8000-0000000000d5','7a250000-0000-4000-8000-0000000000b1','H25 L5','AMRAP 5 min',7),
  ('7a250000-0000-4000-8000-0000000000d6','7a250000-0000-4000-8000-0000000000b1','H25 L6','Hold until failure',8);

select is(
  (select string_agg(prescription_mode, ',' order by order_index) from public.exercises
    where workout_day_id = '7a250000-0000-4000-8000-0000000000b1' and order_index between 3 and 8),
  'reps,range,seconds,distance,amrap,notes',
  '21 every legacy text shape lands in the right mode');

select is(
  (select notes from public.exercises where id = '7a250000-0000-4000-8000-0000000000d6'),
  'Hold until failure', '22 unparseable text is preserved verbatim as notes');

select is(
  (select seconds from public.exercises where id = '7a250000-0000-4000-8000-0000000000d3'),
  120, '23 "2 min" parses to 120 seconds');

-- An UPDATE that touches neither representation must not reclassify anything.
update public.exercises set order_index = 33 where id = '7a250000-0000-4000-8000-0000000000d6';

select is(
  (select reps_or_duration from public.exercises where id = '7a250000-0000-4000-8000-0000000000d6'),
  'Hold until failure', '24 an unrelated update leaves the prescription alone');

-- ---------------------------------------------------------------------------
-- The backfill, replayed on LEGACY-SHAPED rows.
--
-- The guard GUC is what lets a row be given structure without rewriting the
-- coach's original text, so the assertion is on both halves at once.
-- ---------------------------------------------------------------------------

insert into public.exercises (id, workout_day_id, name, reps_or_duration, order_index)
values ('7a250000-0000-4000-8000-0000000000e1','7a250000-0000-4000-8000-0000000000b1','H25 Legacy Row','12 reps',40);

-- Put it back into the pre-migration shape the backfill was written for.
update public.exercises
   set prescription_mode = null, sets = null, reps_min = null, reps_max = null,
       seconds = null, distance_m = null, notes = null, exercise_key = null
 where id = '7a250000-0000-4000-8000-0000000000e1';

select is(
  (select prescription_mode from public.exercises where id = '7a250000-0000-4000-8000-0000000000e1'),
  null, '25 the legacy-shaped row starts with no structure');

select set_config('app.prescription_backfill', '1', true);

update public.exercises e
   set prescription_mode = p.parsed ->> 'mode',
       sets              = (p.parsed ->> 'sets')::int,
       reps_min          = (p.parsed ->> 'reps_min')::int,
       reps_max          = (p.parsed ->> 'reps_max')::int,
       seconds           = (p.parsed ->> 'seconds')::int,
       distance_m        = (p.parsed ->> 'distance_m')::int,
       notes             = p.parsed ->> 'notes',
       exercise_key      = coalesce(e.exercise_key, e.image_key, public.exercise_key_from_name(e.name))
  from (select id, public.parse_prescription_text(reps_or_duration) as parsed
          from public.exercises where prescription_mode is null) p
 where p.id = e.id;

select set_config('app.prescription_backfill', '', true);

select is(
  (select prescription_mode || '/' || reps_min::text || '/' || exercise_key
     from public.exercises where id = '7a250000-0000-4000-8000-0000000000e1'),
  'reps/12/h25-legacy-row', '26 the backfill fills structure and a canonical key');

select is(
  (select reps_or_duration from public.exercises where id = '7a250000-0000-4000-8000-0000000000e1'),
  '12 reps', '27 the backfill never rewrites the coach''s original text');

-- ---------------------------------------------------------------------------
-- Live rows carry the structure too: no exercise was left behind.
-- ---------------------------------------------------------------------------

select is(
  (select count(*) from public.exercises where prescription_mode is null),
  0::bigint, '28 no exercise row anywhere is left without a prescription_mode');

-- ---------------------------------------------------------------------------
-- Direct anon calls. NEVER revoke EXECUTE; prove the gate is in the body and
-- that the backend survives the call.
-- ---------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select is(current_user::text, 'anon', '29 the anon block really runs as anon');

select lives_ok(
  $$select public.exercise_key_from_name('Mountain Climbers')$$,
  '30 anon can call exercise_key_from_name without crashing the backend');

select is(
  (select public.exercise_key_from_name('Mountain Climbers')),
  'mountain-climber', '31 exercise_key_from_name matches the pictogram key');

select lives_ok(
  $$select public.parse_prescription_text('3x10')$$,
  '32 anon can call parse_prescription_text without crashing the backend');

select lives_ok(
  $$select public.format_prescription_text('reps', 3, 10)$$,
  '33 anon can call format_prescription_text without crashing the backend');

select is(
  (select count(*) from public.exercises where workout_day_id = '7a250000-0000-4000-8000-0000000000b1'),
  0::bigint, '34 anon sees none of this plan''s exercises through RLS');

select * from finish();
rollback;
