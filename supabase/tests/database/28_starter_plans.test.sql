-- ============================================================================
-- 28_starter_plans.test.sql
--
-- Pins migration 20260921113000_starter_plans.sql and the seeded starter:
--   * plan_templates — validated on write, at most one starter, readable by
--     staff only, writable by admins only
--   * choose_coach() hands a plan-less member the starter plan, ONCE: a double
--     submit, a re-pick of the same coach and a coach switch never duplicate
--     it, and a member who already has a plan keeps theirs untouched
--   * provenance: source 'starter' + needs_tailoring, cleared by publishing
--   * apply_starter_template() refuses to be called directly by a client
--
-- Run with: psql -X -f supabase/tests/database/28_starter_plans.test.sql
--        or supabase test db supabase/tests/database/28_starter_plans.test.sql
-- One transaction, rolled back. Fixture prefix 7a28... is unique to this file.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(30);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'h28-' || u.n || '@test.invalid', 'x', now(), now()
from (values
  ('7a280000-0000-4000-8000-000000000001'::uuid, 1),  -- coach A
  ('7a280000-0000-4000-8000-000000000002'::uuid, 2),  -- coach B
  ('7a280000-0000-4000-8000-000000000003'::uuid, 3),  -- member, no plan
  ('7a280000-0000-4000-8000-000000000004'::uuid, 4),  -- member, already has a plan
  ('7a280000-0000-4000-8000-000000000006'::uuid, 6)   -- admin
) as u(id, n);

insert into public.profiles (id, role, coach_id, full_name) values
  ('7a280000-0000-4000-8000-000000000001', 'coach',  null, 'H28 Coach A'),
  ('7a280000-0000-4000-8000-000000000002', 'coach',  null, 'H28 Coach B'),
  ('7a280000-0000-4000-8000-000000000003', 'member', null, 'H28 Fresh Member'),
  ('7a280000-0000-4000-8000-000000000004', 'member', null, 'H28 Coached Member'),
  ('7a280000-0000-4000-8000-000000000006', 'admin',  null, 'H28 Admin');

-- The member who already has a real, coach-authored plan.
insert into public.workout_plans (id, member_id, coach_id, title) values
  ('7a280000-0000-4000-8000-0000000000a4', '7a280000-0000-4000-8000-000000000004',
   '7a280000-0000-4000-8000-000000000001', 'H28 Existing Plan');

-- ---------------------------------------------------------------------------
-- The template library.
-- ---------------------------------------------------------------------------

select is(
  (select count(*) from public.plan_templates where is_starter),
  1::bigint, '01 exactly one starter template is seeded');

select throws_ok(
  $$insert into public.plan_templates (title, template, is_starter)
    values ('H28 Second Starter', (select template from public.plan_templates where is_starter), true)$$,
  '23505', null, '02 a second starter template is refused — "the" starter must be unambiguous');

select throws_ok(
  $$insert into public.plan_templates (title, template)
    values ('H28 Broken', '{"title":"x","days":"not an array"}'::jsonb)$$,
  '22023', null, '03 a template that is not a valid plan draft is refused on write');

select lives_ok(
  $$insert into public.plan_templates (id, title, template)
    values ('7a280000-0000-4000-8000-0000000000f1',
            'H28 Valid Non-Starter',
            (select template from public.plan_templates where is_starter))$$,
  '04 a valid non-starter template is accepted');

set local role authenticated;
select set_config('request.jwt.claim.sub', '7a280000-0000-4000-8000-000000000003', true);

select is(auth.uid(), '7a280000-0000-4000-8000-000000000003'::uuid,
  '05 the member block really runs as the member');

select is(
  (select count(*) from public.plan_templates),
  0::bigint, '06 a member cannot see the template library at all');

-- The template below is deliberately VALID: validation runs in a BEFORE
-- trigger, so an invalid one would be refused for the wrong reason and the
-- assertion would prove nothing about RLS.
select throws_ok(
  $$insert into public.plan_templates (title, template)
    values ('H28 Member Write',
      '{"title":"x","days":[{"id":null,"day_number":1,"block_name":"b","exercises":[]}]}'::jsonb)$$,
  '42501', null, '07 a member cannot write templates');

select set_config('request.jwt.claim.sub', '7a280000-0000-4000-8000-000000000001', true);

select ok(
  (select count(*) > 0 from public.plan_templates),
  '08 a coach can read the template library');

select throws_ok(
  $$insert into public.plan_templates (title, template)
    values ('H28 Coach Write', (select template from public.plan_templates where is_starter))$$,
  '42501', null, '09 a coach cannot write templates — that is an admin job');

select set_config('request.jwt.claim.sub', '7a280000-0000-4000-8000-000000000006', true);

select lives_ok(
  $$insert into public.plan_templates (title, template)
    values ('H28 Admin Write', (select template from public.plan_templates where is_starter))$$,
  '10 an admin can write templates');

-- ---------------------------------------------------------------------------
-- apply_starter_template() is not a client API.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', '7a280000-0000-4000-8000-000000000003', true);

select throws_ok(
  $$select public.apply_starter_template('7a280000-0000-4000-8000-000000000003',
                                         '7a280000-0000-4000-8000-000000000001')$$,
  '42501', null, '11 a member cannot mint themselves a plan by calling it directly');

select throws_ok(
  $$select public.apply_starter_template('7a280000-0000-4000-8000-000000000004',
                                         '7a280000-0000-4000-8000-000000000001')$$,
  '42501', null, '12 ... nor one for somebody else');

-- ---------------------------------------------------------------------------
-- choose_coach() hands out the starter plan.
-- ---------------------------------------------------------------------------

select lives_ok(
  $$select public.choose_coach('7a280000-0000-4000-8000-000000000001')$$,
  '13 a plan-less member picks a coach');

set local role postgres;

select is(
  (select source || '/' || needs_tailoring::text || '/' || rev
   from public.workout_plans where member_id = '7a280000-0000-4000-8000-000000000003'),
  'starter/true/1', '14 they now have a starter plan flagged for tailoring at rev 1');

select is(
  (select title from public.workout_plans where member_id = '7a280000-0000-4000-8000-000000000003'),
  (select title from public.plan_templates where is_starter),
  '15 the plan carries the starter template''s title');

select is(
  (select count(*) from public.workout_days wd
   join public.workout_plans wp on wp.id = wd.workout_plan_id
   where wp.member_id = '7a280000-0000-4000-8000-000000000003'),
  3::bigint, '16 the starter materialised its three days');

select is(
  (select count(*) from public.exercises e
   join public.workout_days wd on wd.id = e.workout_day_id
   join public.workout_plans wp on wp.id = wd.workout_plan_id
   where wp.member_id = '7a280000-0000-4000-8000-000000000003'),
  9::bigint, '17 ... and nine exercises');

select is(
  (select count(*) from public.exercises e
   join public.workout_days wd on wd.id = e.workout_day_id
   join public.workout_plans wp on wp.id = wd.workout_plan_id
   where wp.member_id = '7a280000-0000-4000-8000-000000000003'
     and (e.prescription_mode is null or e.reps_or_duration is null)),
  0::bigint, '18 every materialised exercise has a mode and rendered text');

select is(
  (select count(*) from public.exercises e
   join public.workout_days wd on wd.id = e.workout_day_id
   join public.workout_plans wp on wp.id = wd.workout_plan_id
   where wp.member_id = '7a280000-0000-4000-8000-000000000003'
     and (e.exercise_key is null or e.image_key is null)),
  0::bigint, '19 ... and a pictogram key the app can draw');

-- Idempotency. Re-picking the same coach is choose_coach's early return; the
-- plan must survive both that and a coach switch untouched.
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a280000-0000-4000-8000-000000000003', true);
select public.choose_coach('7a280000-0000-4000-8000-000000000001');
select public.choose_coach('7a280000-0000-4000-8000-000000000002');
set local role postgres;

select is(
  (select count(*) from public.workout_plans
   where member_id = '7a280000-0000-4000-8000-000000000003'),
  1::bigint, '20 re-picking the same coach and then switching never duplicates the plan');

select is(
  (select coach_id from public.profiles where id = '7a280000-0000-4000-8000-000000000003'),
  '7a280000-0000-4000-8000-000000000002'::uuid, '21 the switch itself did happen');

select is(
  (select source || '/' || needs_tailoring::text
   from public.workout_plans where member_id = '7a280000-0000-4000-8000-000000000003'),
  'starter/true', '22 the plan is untouched by the switch — the new coach inherits it');

-- A member who already has a plan keeps it.
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a280000-0000-4000-8000-000000000004', true);
select public.choose_coach('7a280000-0000-4000-8000-000000000001');
set local role postgres;

select is(
  (select id::text || '/' || source || '/' || needs_tailoring::text || '/' || title
   from public.workout_plans where member_id = '7a280000-0000-4000-8000-000000000004'),
  '7a280000-0000-4000-8000-0000000000a4/coach/false/H28 Existing Plan',
  '23 a member who already had a plan keeps exactly that plan');

-- ---------------------------------------------------------------------------
-- Provenance columns.
-- ---------------------------------------------------------------------------

select is(
  (select source from public.workout_plans where id = '7a280000-0000-4000-8000-0000000000a4'),
  'coach', '24 source defaults to coach for a plan written the old way');

select throws_ok(
  $$update public.workout_plans set source = 'telepathy'
     where id = '7a280000-0000-4000-8000-0000000000a4'$$,
  '23514', null, '25 an unknown source value is refused');

update public.workout_plans set rev = rev + 1
 where member_id = '7a280000-0000-4000-8000-000000000003';

select is(
  (select needs_tailoring from public.workout_plans
   where member_id = '7a280000-0000-4000-8000-000000000003'),
  false, '26 publishing (any rev bump) clears needs_tailoring');

update public.workout_plans set title = title
 where member_id = '7a280000-0000-4000-8000-000000000003';

select is(
  (select rev from public.workout_plans where member_id = '7a280000-0000-4000-8000-000000000003'),
  2, '27 an ordinary update does not bump the revision');

-- ---------------------------------------------------------------------------
-- anon. Refuse, never crash.
-- ---------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select is(auth.uid(), null, '28 the anon block really has no identity');

select throws_ok(
  $$select public.apply_starter_template('7a280000-0000-4000-8000-000000000003',
                                         '7a280000-0000-4000-8000-000000000001')$$,
  '42501', null, '29 anon calling apply_starter_template is refused, not crashed');

select is(
  (select count(*) from public.plan_templates),
  0::bigint, '30 anon reads no templates');

select * from finish();
rollback;
