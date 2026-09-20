-- ============================================================================
-- 11_definer_functions.test.sql
--
-- The stateful SECURITY DEFINER helpers and the two triggers that no other
-- pgTAP file references. The fixture-free half of the same audit -- the pure
-- validators and the anon crash sweep -- lives in 17_validators_and_crash_sweep.
--
-- Objects under test (re-derived from the live catalog, not from the audit):
--   role probes  is_pipeline_role, is_coach_assignment_context
--   definers     can_read_workout_note, is_fellow_group_member,
--                is_coach_of_diet_plan, is_member_of_diet_plan,
--                get_my_coach, list_coaches, choose_coach
--   triggers     coach_profiles_touch_updated_at,
--                workout_notes_sync_recording_status
--   structural   apply_realtime_presence_policies (asserted, never executed --
--                it is DDL and other workers share this database)
--
-- Run with: supabase test db supabase/tests/database/11_definer_functions.test.sql
-- One transaction, rolled back. Fixture prefix 7a11… is unique to this file.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;

-- SET LOCAL survives the SET ROLE switches below, so public.* and the pgTAP
-- assertions both resolve under every identity this file assumes.
set local search_path = public, extensions;

select plan(58);

-- ---------------------------------------------------------------------------
-- Fixtures (superuser, RLS bypassed, rolled back at the end).
--   ..01 coach A   ..02 member A1 ACTIVE   ..03 member A2 EXPIRED
--   ..04 coach B   ..05 member B1 ACTIVE   ..06 admin   ..07 stranger
--   ..08 member A3 ACTIVE, no coach yet (choose_coach subject)
--   ..09 coach C, accepting_members = false
--   ..c1 coach A's class   ..a1 published recording   ..a2 draft recording
--   ..b1 published note    ..b2 unpublished note      ..b3 trigger subject
--   ..e1 coach A's group   ..f1 coach A's diet plan
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'fn11-' || u.n || '@test.invalid', 'x', now(), now()
from (values
  ('7a110000-0000-4000-8000-000000000001'::uuid, 1),
  ('7a110000-0000-4000-8000-000000000002'::uuid, 2),
  ('7a110000-0000-4000-8000-000000000003'::uuid, 3),
  ('7a110000-0000-4000-8000-000000000004'::uuid, 4),
  ('7a110000-0000-4000-8000-000000000005'::uuid, 5),
  ('7a110000-0000-4000-8000-000000000006'::uuid, 6),
  ('7a110000-0000-4000-8000-000000000007'::uuid, 7),
  ('7a110000-0000-4000-8000-000000000008'::uuid, 8),
  ('7a110000-0000-4000-8000-000000000009'::uuid, 9)
) as u(id, n);

insert into public.profiles (id, role, coach_id, full_name) values
  ('7a110000-0000-4000-8000-000000000001', 'coach',  null,                                   'S11 Coach A'),
  ('7a110000-0000-4000-8000-000000000002', 'member', '7a110000-0000-4000-8000-000000000001', 'S11 Member A1'),
  ('7a110000-0000-4000-8000-000000000003', 'member', '7a110000-0000-4000-8000-000000000001', 'S11 Member A2 Expired'),
  ('7a110000-0000-4000-8000-000000000004', 'coach',  null,                                   'S11 Coach B'),
  ('7a110000-0000-4000-8000-000000000005', 'member', '7a110000-0000-4000-8000-000000000004', 'S11 Member B1'),
  ('7a110000-0000-4000-8000-000000000006', 'admin',  null,                                   'S11 Admin'),
  ('7a110000-0000-4000-8000-000000000007', 'member', null,                                   'S11 Stranger'),
  ('7a110000-0000-4000-8000-000000000008', 'member', null,                                   'S11 Member A3 Unassigned'),
  ('7a110000-0000-4000-8000-000000000009', 'coach',  null,                                   'S11 Coach C Closed');

insert into public.subscriptions (member_id, status, current_period_end) values
  ('7a110000-0000-4000-8000-000000000002', 'active',   now() + interval '30 days'),
  -- 40 days past period end: well outside the 10-day grace window.
  ('7a110000-0000-4000-8000-000000000003', 'past_due', now() - interval '40 days'),
  ('7a110000-0000-4000-8000-000000000005', 'active',   now() + interval '30 days'),
  ('7a110000-0000-4000-8000-000000000008', 'active',   now() + interval '30 days');

insert into public.coach_profiles (coach_id, bio, specialties, accepting_members) values
  ('7a110000-0000-4000-8000-000000000001', 'S11 bio A', array['strength'], true),
  ('7a110000-0000-4000-8000-000000000009', 'S11 bio C', array['mobility'], false);

insert into public.live_classes (id, coach_id, title, agora_channel_name, starts_at, status) values
  ('7a110000-0000-4000-8000-0000000000c1', '7a110000-0000-4000-8000-000000000001',
   'S11 Coach A Class', 's11-coach-a-chan', now() + interval '1 hour', 'scheduled');

insert into public.recordings (id, live_class_id, uploaded_by, storage_path, status) values
  ('7a110000-0000-4000-8000-0000000000a1', '7a110000-0000-4000-8000-0000000000c1',
   '7a110000-0000-4000-8000-000000000001',
   '7a110000-0000-4000-8000-000000000001/s11-published.m4a', 'published'),
  ('7a110000-0000-4000-8000-0000000000a2', '7a110000-0000-4000-8000-0000000000c1',
   '7a110000-0000-4000-8000-000000000001',
   '7a110000-0000-4000-8000-000000000001/s11-draft.m4a', 'draft');

insert into public.workout_notes (id, recording_id, created_by, draft_content, edited_content, published_at) values
  ('7a110000-0000-4000-8000-0000000000b1', '7a110000-0000-4000-8000-0000000000a1',
   '7a110000-0000-4000-8000-000000000001',
   '{"title":"S11 Day","items":[{"key":"a","text":"Squat","kind":"exercise","sets":3,"reps":"8"}]}',
   null, now()),
  ('7a110000-0000-4000-8000-0000000000b2', '7a110000-0000-4000-8000-0000000000a1',
   '7a110000-0000-4000-8000-000000000001',
   '{"title":"S11 Draft","items":[{"key":"b","text":"Press","kind":"exercise"}]}',
   null, null);

insert into public.groups (id, name, description, created_by) values
  ('7a110000-0000-4000-8000-0000000000e1', 'S11 Group A', null,
   '7a110000-0000-4000-8000-000000000001');
insert into public.group_members (group_id, member_id) values
  ('7a110000-0000-4000-8000-0000000000e1', '7a110000-0000-4000-8000-000000000002'),
  ('7a110000-0000-4000-8000-0000000000e1', '7a110000-0000-4000-8000-000000000003');

insert into public.diet_plans (id, coach_id, title) values
  ('7a110000-0000-4000-8000-0000000000f1', '7a110000-0000-4000-8000-000000000001', 'S11 Diet Plan');
insert into public.diet_plan_assignments (diet_plan_id, member_id) values
  ('7a110000-0000-4000-8000-0000000000f1', '7a110000-0000-4000-8000-000000000002');

-- ===========================================================================
-- is_pipeline_role / is_coach_assignment_context -- the two role probes the
-- write guards depend on. If either one answered `true` for `authenticated`,
-- every client-write guard in the schema would be a no-op.
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a110000-0000-4000-8000-000000000002', true);

select is(auth.uid(), '7a110000-0000-4000-8000-000000000002'::uuid,
          'identity: caller is member A1');
select is(public.is_pipeline_role(), false,
          'is_pipeline_role: false under the authenticated role');
select is(public.is_coach_assignment_context('7a110000-0000-4000-8000-000000000002'), false,
          'is_coach_assignment_context: false under authenticated with no GUC');
select set_config('app.coach_choice_member',
                  '7a110000-0000-4000-8000-000000000002', true);
select is(public.is_coach_assignment_context('7a110000-0000-4000-8000-000000000002'), false,
          'is_coach_assignment_context: a client that forges the GUC still gets false');
select set_config('app.coach_choice_member', '', true);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is(public.is_pipeline_role(), false,
          'is_pipeline_role: false under the anon role');

reset role;
select is(public.is_pipeline_role(), true,
          'is_pipeline_role: true for the pipeline/superuser role');
select is(public.is_coach_assignment_context(null), false,
          'is_coach_assignment_context: a null member is always false');
select set_config('app.coach_choice_member',
                  '7a110000-0000-4000-8000-000000000002', true);
select is(public.is_coach_assignment_context('7a110000-0000-4000-8000-000000000002'), true,
          'is_coach_assignment_context: true only inside the sanctioned window');
select is(public.is_coach_assignment_context('7a110000-0000-4000-8000-000000000003'), false,
          'is_coach_assignment_context: the window covers one member, not the table');
select set_config('app.coach_choice_member', '', true);
-- Regression: once the window closes the answer must be false, never NULL,
-- so `and not is_coach_assignment_context(...)` in the guard trigger holds.
select is(public.is_coach_assignment_context('7a110000-0000-4000-8000-000000000002'),
          false,
          'is_coach_assignment_context: false (not NULL) once the window closes');
select ok(public.is_coach_assignment_context('7a110000-0000-4000-8000-000000000002')
            is distinct from true,
          'is_coach_assignment_context: at least never TRUE once the window closes');

-- ===========================================================================
-- can_read_workout_note -- the gate on member checklist progress. Published +
-- entitled + same tenant, or you manage the recording. Nothing else.
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a110000-0000-4000-8000-000000000001', true);
select is(auth.uid(), '7a110000-0000-4000-8000-000000000001'::uuid,
          'identity: caller is coach A');
select is(public.can_read_workout_note('7a110000-0000-4000-8000-0000000000b1'), true,
          'can_read_workout_note: the recording coach reads a published note');
select is(public.can_read_workout_note('7a110000-0000-4000-8000-0000000000b2'), true,
          'can_read_workout_note: the recording coach reads their own unpublished note');

select set_config('request.jwt.claim.sub', '7a110000-0000-4000-8000-000000000002', true);
select is(public.can_read_workout_note('7a110000-0000-4000-8000-0000000000b1'), true,
          'can_read_workout_note: an ACTIVE member of that coach reads the published note');
select is(public.can_read_workout_note('7a110000-0000-4000-8000-0000000000b2'), false,
          'can_read_workout_note: the same member cannot read the UNPUBLISHED note');

select set_config('request.jwt.claim.sub', '7a110000-0000-4000-8000-000000000003', true);
select is(public.can_read_workout_note('7a110000-0000-4000-8000-0000000000b1'), false,
          'can_read_workout_note: an EXPIRED member of that coach is denied');

select set_config('request.jwt.claim.sub', '7a110000-0000-4000-8000-000000000005', true);
select is(public.can_read_workout_note('7a110000-0000-4000-8000-0000000000b1'), false,
          'can_read_workout_note: another coach''s member is denied');

select set_config('request.jwt.claim.sub', '7a110000-0000-4000-8000-000000000004', true);
select is(public.can_read_workout_note('7a110000-0000-4000-8000-0000000000b1'), false,
          'can_read_workout_note: a coach of another tenant is denied');

select set_config('request.jwt.claim.sub', '7a110000-0000-4000-8000-000000000006', true);
select is(public.can_read_workout_note('7a110000-0000-4000-8000-0000000000b1'), false,
          'can_read_workout_note: an admin is NOT a shortcut into another tenant''s notes');

select set_config('request.jwt.claim.sub', '7a110000-0000-4000-8000-000000000007', true);
select is(public.can_read_workout_note('7a110000-0000-4000-8000-0000000000b1'), false,
          'can_read_workout_note: a coachless stranger is denied');
select is(public.can_read_workout_note('7a110000-0000-4000-8000-00000000dead'), false,
          'can_read_workout_note: an unknown note id is false, not an error');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is(auth.uid(), null::uuid, 'identity: anon has a null auth.uid()');
select is(public.can_read_workout_note('7a110000-0000-4000-8000-0000000000b1'), false,
          'can_read_workout_note: anon is denied cleanly');

-- ===========================================================================
-- is_fellow_group_member / is_coach_of_diet_plan / is_member_of_diet_plan
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a110000-0000-4000-8000-000000000002', true);
select is(public.is_fellow_group_member('7a110000-0000-4000-8000-0000000000e1'), true,
          'is_fellow_group_member: a member of the group is a fellow');
select is(public.is_member_of_diet_plan('7a110000-0000-4000-8000-0000000000f1'), true,
          'is_member_of_diet_plan: the assigned member is a member of the plan');
select is(public.is_coach_of_diet_plan('7a110000-0000-4000-8000-0000000000f1'), false,
          'is_coach_of_diet_plan: the assigned member is not its coach');

select set_config('request.jwt.claim.sub', '7a110000-0000-4000-8000-000000000001', true);
select is(public.is_coach_of_diet_plan('7a110000-0000-4000-8000-0000000000f1'), true,
          'is_coach_of_diet_plan: the owning coach is recognised');
select is(public.is_fellow_group_member('7a110000-0000-4000-8000-0000000000e1'), false,
          'is_fellow_group_member: the group creator is not a member of it');

select set_config('request.jwt.claim.sub', '7a110000-0000-4000-8000-000000000005', true);
select is(public.is_fellow_group_member('7a110000-0000-4000-8000-0000000000e1'), false,
          'is_fellow_group_member: another tenant''s member is not a fellow');
select is(public.is_coach_of_diet_plan('7a110000-0000-4000-8000-0000000000f1'), false,
          'is_coach_of_diet_plan: another tenant''s member is denied');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is(public.is_fellow_group_member('7a110000-0000-4000-8000-0000000000e1'), false,
          'is_fellow_group_member: anon is denied');
select is(public.is_member_of_diet_plan('7a110000-0000-4000-8000-0000000000f1'), false,
          'is_member_of_diet_plan: anon is denied');

-- ===========================================================================
-- get_my_coach / list_coaches -- the coach-directory reads.
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a110000-0000-4000-8000-000000000002', true);
select is((select count(*)::int from public.get_my_coach()), 1,
          'get_my_coach: an assigned member gets exactly one row');
select is((select c.full_name || '|' || coalesce(c.bio, '-') || '|' || c.accepting_members::text
             from public.get_my_coach() c),
          'S11 Coach A|S11 bio A|true',
          'get_my_coach: the row carries the coach profile, not just the id');

select set_config('request.jwt.claim.sub', '7a110000-0000-4000-8000-000000000007', true);
select is((select count(*)::int from public.get_my_coach()), 0,
          'get_my_coach: a member with no coach gets zero rows, not an error');

select set_config('request.jwt.claim.sub', '7a110000-0000-4000-8000-000000000002', true);
select is((select count(*)::int from public.list_coaches() c
            where c.coach_id::text like '7a11%'), 3,
          'list_coaches: an authenticated member sees this file''s three coaches');
select is((select c.member_count from public.list_coaches() c
            where c.coach_id = '7a110000-0000-4000-8000-000000000001'), 2,
          'list_coaches: member_count counts only role=member assignees (A1, A2)');
select is((select c.accepting_members from public.list_coaches() c
            where c.coach_id = '7a110000-0000-4000-8000-000000000009'), false,
          'list_coaches: a closed coach is listed with accepting_members = false');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is((select count(*)::int from public.list_coaches()), 0,
          'list_coaches: anon gets zero rows (no public coach directory)');
select is((select count(*)::int from public.get_my_coach()), 0,
          'get_my_coach: anon gets zero rows');

-- ===========================================================================
-- choose_coach -- the only sanctioned client write to profiles.coach_id.
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a110000-0000-4000-8000-000000000008', true);

select throws_ok(
  $$select public.choose_coach('7a110000-0000-4000-8000-000000000009')$$,
  'P0001', 'coach_not_accepting',
  'choose_coach: a coach with accepting_members = false is refused');
select throws_ok(
  $$select public.choose_coach('7a110000-0000-4000-8000-000000000002')$$,
  'P0001', 'coach_not_found',
  'choose_coach: a member id is not a coach id');
select throws_ok(
  $$select public.choose_coach(null)$$,
  'P0001', 'coach_not_found',
  'choose_coach: a null coach id is refused');

select lives_ok(
  $$select public.choose_coach('7a110000-0000-4000-8000-000000000001')$$,
  'choose_coach: an unassigned member may pick an accepting coach');
select is((select p.coach_id from public.profiles p
            where p.id = '7a110000-0000-4000-8000-000000000008'),
          '7a110000-0000-4000-8000-000000000001'::uuid,
          'choose_coach: the assignment actually landed on the caller''s own row');
select lives_ok(
  $$select public.choose_coach('7a110000-0000-4000-8000-000000000001')$$,
  'choose_coach: re-picking the same coach is idempotent, not an error');

-- The guard window must be shut again the instant choose_coach returns.
select throws_ok(
  $$update public.profiles set coach_id = '7a110000-0000-4000-8000-000000000004'
     where id = '7a110000-0000-4000-8000-000000000008'$$,
  '42501',
  'profiles.coach_id is assigned server-side; it cannot be changed by the account itself',
  'choose_coach: a direct coach_id update outside the function is still blocked');

select set_config('request.jwt.claim.sub', '7a110000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.choose_coach('7a110000-0000-4000-8000-000000000004')$$,
  'P0001', 'not_a_member',
  'choose_coach: a coach cannot assign themselves a coach');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$select public.choose_coach('7a110000-0000-4000-8000-000000000001')$$,
  'P0001', 'not_authenticated',
  'choose_coach: anon is refused before anything is read');

-- ===========================================================================
-- Triggers: coach_profiles_touch_updated_at and
-- workout_notes_sync_recording_status. Run as the pipeline role, because the
-- point here is the trigger body, not the policy in front of it.
-- ===========================================================================
reset role;

update public.coach_profiles
   set updated_at = now() - interval '5 days'
 where coach_id = '7a110000-0000-4000-8000-000000000001';
-- The line above itself fires the trigger, so read the "stale" value back the
-- only way that is honest: set it, then confirm the trigger overrode it.
select ok(
  (select cp.updated_at from public.coach_profiles cp
    where cp.coach_id = '7a110000-0000-4000-8000-000000000001') > now() - interval '1 minute',
  'coach_profiles_touch_updated_at: an explicit stale updated_at is overwritten with now()');

select is((select r.status from public.recordings r
            where r.id = '7a110000-0000-4000-8000-0000000000a2'), 'draft',
          'sync trigger: the draft recording starts as draft');

insert into public.workout_notes (id, recording_id, created_by, draft_content, published_at)
values ('7a110000-0000-4000-8000-0000000000b3', '7a110000-0000-4000-8000-0000000000a2',
        '7a110000-0000-4000-8000-000000000001',
        '{"title":"S11 Sync","items":[{"key":"c","text":"Row","kind":"exercise"}]}',
        now());
select is((select r.status from public.recordings r
            where r.id = '7a110000-0000-4000-8000-0000000000a2'), 'published',
          'sync trigger: INSERTing an already-published note flips draft -> published');

update public.workout_notes set published_at = null
 where id = '7a110000-0000-4000-8000-0000000000b3';
select is((select r.status from public.recordings r
            where r.id = '7a110000-0000-4000-8000-0000000000a2'), 'draft',
          'sync trigger: clearing published_at flips published -> draft');

update public.workout_notes set published_at = now()
 where id = '7a110000-0000-4000-8000-0000000000b3';
select is((select r.status from public.recordings r
            where r.id = '7a110000-0000-4000-8000-0000000000a2'), 'published',
          'sync trigger: re-publishing flips it back');

-- The trigger must not walk outside its own recording.
select is((select r.status from public.recordings r
            where r.id = '7a110000-0000-4000-8000-0000000000a1'), 'published',
          'sync trigger: the sibling recording is untouched');

-- ===========================================================================
-- apply_realtime_presence_policies -- structural only. It issues DDL against
-- realtime.messages; executing it here would take locks other workers need.
-- ===========================================================================
select has_function('public', 'apply_realtime_presence_policies', '{}'::text[],
                    'apply_realtime_presence_policies: still present');
select is((select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'apply_realtime_presence_policies'),
          true,
          'apply_realtime_presence_policies: is SECURITY DEFINER');

select * from finish();
rollback;
