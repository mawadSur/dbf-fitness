-- ============================================================================
-- 01_role_integrity.test.sql
--
-- Regression suite for the role & ownership integrity hardening
-- (supabase/migrations/20260919152000_role_and_ownership_integrity.sql).
--
-- Covers the six foreman-reproduced holes (T1-T6) plus every finding the three
-- read-only security auditors raised, exercised as member / expired member /
-- coach / admin / stranger / anon.
--
-- Run with:  supabase test db
-- The whole file is one transaction and is rolled back, so it never mutates the
-- demo seed. Fixtures use the 5f1a… prefix so they can never collide with seed
-- rows or with another agent's fixtures.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;

-- SET LOCAL survives the SET ROLE switches below, so unqualified references to
-- public tables and to the pgTAP assertions both resolve for every identity.
set local search_path = public, extensions;

select no_plan();

-- ---------------------------------------------------------------------------
-- Fixtures. Created as the superuser (RLS bypassed) and rolled back at the end.
--
-- Seed rows this suite leans on:
--   Dana   11111111-…  coach              (no subscription row: staff)
--   Jordan 22222222-…  member of Dana     subscription ACTIVE
--   Sam    66666666-…  member of Dana     subscription GRACE
--   Riley  99999999-…  member of Dana     subscription EXPIRED
--   Group  77777777-…  created_by Dana
--   Class  88888888-…  coach_id Dana
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('5f1a0000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 's1-stranger@test.invalid', 'x', now(), now()),
  ('5f1a0000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 's1-admin@test.invalid',    'x', now(), now()),
  ('5f1a0000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 's1-coachb@test.invalid',   'x', now(), now()),
  ('5f1a0000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 's1-memberb@test.invalid',  'x', now(), now()),
  ('5f1a0000-0000-4000-8000-000000000008', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 's1-danaspare@test.invalid','x', now(), now());

insert into public.profiles (id, role, coach_id, full_name) values
  ('5f1a0000-0000-4000-8000-000000000001', 'member', null,                                   'S1 Stranger'),
  ('5f1a0000-0000-4000-8000-000000000002', 'admin',  null,                                   'S1 Admin'),
  ('5f1a0000-0000-4000-8000-000000000003', 'coach',  null,                                   'S1 Coach B'),
  ('5f1a0000-0000-4000-8000-000000000004', 'member', '5f1a0000-0000-4000-8000-000000000003', 'S1 Member B'),
  -- A Dana member deliberately left WITHOUT a workout plan. Since 20260921100000
  -- (plan_integrity) workout_plans is unique per member, so the "coach may create
  -- a plan for her own member" control below needs a member who has none yet;
  -- Jordan already owns the seed plan 33333333-….
  ('5f1a0000-0000-4000-8000-000000000008', 'member', '11111111-1111-1111-1111-111111111111', 'S1 Dana Spare');

-- Coach B's member pays, so any refusal below is about tenancy, never about money.
insert into public.subscriptions (member_id, status, current_period_end)
values ('5f1a0000-0000-4000-8000-000000000004', 'active', now() + interval '30 days');

insert into public.live_classes (id, coach_id, title, agora_channel_name, starts_at, status) values
  ('5f1a0000-0000-4000-8000-0000000000c2', '5f1a0000-0000-4000-8000-000000000003',
   'S1 Coach B Class', 's1-coachb-chan', now() + interval '1 day', 'scheduled');

insert into public.groups (id, name, description, created_by) values
  ('5f1a0000-0000-4000-8000-0000000000b1', 'S1 Coach B Crew', 'Coach B tenant', '5f1a0000-0000-4000-8000-000000000003');

-- Workout plans: one in Coach B's tenant. Dana's tenant reuses Jordan's SEED
-- plan 33333333-… rather than adding a second one: since 20260921100000
-- (plan_integrity) workout_plans carries unique (member_id), so a member has
-- exactly one plan. The seed plan already has the tenancy this suite needs
-- (member Jordan, coach Dana), and its days are numbered 1-3.
insert into public.workout_plans (id, member_id, coach_id, title) values
  ('5f1a0000-0000-4000-8000-0000000000e3', '5f1a0000-0000-4000-8000-000000000004', '5f1a0000-0000-4000-8000-000000000003', 'S1 Coach B Plan');

insert into public.workout_days (id, workout_plan_id, day_number, block_name) values
  ('5f1a0000-0000-4000-8000-0000000000e2', '33333333-3333-3333-3333-333333333333', 4, 'S1 Dana Day'),
  ('5f1a0000-0000-4000-8000-0000000000e4', '5f1a0000-0000-4000-8000-0000000000e3', 1, 'S1 Coach B Day');

-- Diet plans, same two tenants.
insert into public.diet_plans (id, coach_id, title) values
  ('5f1a0000-0000-4000-8000-0000000000f1', '11111111-1111-1111-1111-111111111111', 'S1 Dana Diet'),
  ('5f1a0000-0000-4000-8000-0000000000f3', '5f1a0000-0000-4000-8000-000000000003', 'S1 Coach B Diet');

insert into public.diet_items (id, diet_plan_id, name, order_index) values
  ('5f1a0000-0000-4000-8000-0000000000f2', '5f1a0000-0000-4000-8000-0000000000f1', 'S1 Dana Item', 1),
  ('5f1a0000-0000-4000-8000-0000000000f4', '5f1a0000-0000-4000-8000-0000000000f3', 'S1 Coach B Item', 1);

insert into public.diet_plan_assignments (diet_plan_id, member_id) values
  ('5f1a0000-0000-4000-8000-0000000000f1', '22222222-2222-2222-2222-222222222222'),
  ('5f1a0000-0000-4000-8000-0000000000f3', '5f1a0000-0000-4000-8000-000000000004');

-- A recording Dana legitimately owns on her own class.
insert into public.recordings (id, live_class_id, uploaded_by, storage_path, status) values
  ('5f1a0000-0000-4000-8000-0000000000a1', '88888888-8888-8888-8888-888888888888',
   '11111111-1111-1111-1111-111111111111',
   '11111111-1111-1111-1111-111111111111/s1/take.mp4', 'uploading');

-- An abuse report strictly inside Dana's tenant.
insert into public.moderation_reports (id, reporter_id, reported_user_id, reason) values
  ('5f1a0000-0000-4000-8000-0000000000d2', '22222222-2222-2222-2222-222222222222',
   '66666666-6666-6666-6666-666666666666', 's1 fixture: private report body');


-- ===========================================================================
-- T1 — a member cannot promote themselves (profiles.role)
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

select is(current_user::text, 'authenticated', 'T1 identity: current_user is authenticated');
select is(auth.uid(), '22222222-2222-2222-2222-222222222222'::uuid, 'T1 identity: auth.uid() is Jordan');

select throws_ok(
  $$ update public.profiles set role = 'admin' where id = '22222222-2222-2222-2222-222222222222' $$,
  '42501', null,
  'T1 member cannot UPDATE their own profiles.role to admin');

select throws_ok(
  $$ update public.profiles set role = 'coach' where id = '22222222-2222-2222-2222-222222222222' $$,
  '42501', null,
  'T1 member cannot UPDATE their own profiles.role to coach');

-- Bulk update: RLS narrows it to the caller's own row, then the trigger fires.
select throws_ok(
  $$ update public.profiles set role = 'admin' $$,
  '42501', null,
  'T1 bulk UPDATE of every profiles.role is refused');

-- Upsert-merge: the INSERT arm is rejected outright for a privileged role value.
select throws_ok(
  $$ insert into public.profiles (id, role, full_name)
     values ('22222222-2222-2222-2222-222222222222', 'admin', 'Jordan Lee')
     on conflict (id) do update set role = 'admin' $$,
  '42501', null,
  'T1 upsert with role=admin is refused by the INSERT policy');

-- Upsert-merge that sneaks past the INSERT arm with role='member' and escalates
-- in the DO UPDATE arm: the BEFORE UPDATE trigger still stops it.
select throws_ok(
  $$ insert into public.profiles (id, role, full_name)
     values ('22222222-2222-2222-2222-222222222222', 'member', 'Jordan Lee')
     on conflict (id) do update set role = 'admin' $$,
  '42501', null,
  'T1 upsert ON CONFLICT DO UPDATE SET role=admin is refused by the guard trigger');

select is(
  (select role from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'member',
  'T1 after every attempt Jordan is still a member');

-- Benign self-edits must keep working — the guard is column-scoped, not a lockout.
select lives_ok(
  $$ update public.profiles set full_name = 'Jordan Lee (edited)' where id = '22222222-2222-2222-2222-222222222222' $$,
  'T1 member may still edit their own full_name');

select lives_ok(
  $$ update public.profiles set avatar_url = 'https://example.test/a.png' where id = '22222222-2222-2222-2222-222222222222' $$,
  'T1 member may still edit their own avatar_url');


-- ===========================================================================
-- T2 — a member cannot re-parent themselves (profiles.coach_id)
-- ===========================================================================
select throws_ok(
  $$ update public.profiles set coach_id = '5f1a0000-0000-4000-8000-000000000003'
     where id = '22222222-2222-2222-2222-222222222222' $$,
  '42501', null,
  'T2 member cannot attach themselves to another coach');

select throws_ok(
  $$ update public.profiles set coach_id = null where id = '22222222-2222-2222-2222-222222222222' $$,
  '42501', null,
  'T2 member cannot detach themselves from their coach');

select throws_ok(
  $$ update public.profiles set coach_id = '22222222-2222-2222-2222-222222222222'
     where id = '22222222-2222-2222-2222-222222222222' $$,
  '42501', null,
  'T2 member cannot make themselves their own coach');

select is(
  (select coach_id from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'T2 Jordan is still coached by Dana');

-- A member cannot rewrite somebody else's row either: RLS filters it to zero rows.
with u as (
  update public.profiles set full_name = 's1 tamper'
  where id = '66666666-6666-6666-6666-666666666666'
  returning 1
)
select is((select count(*) from u), 0::bigint, 'T2 member cannot UPDATE another member''s profile at all');


-- ===========================================================================
-- T4 — a client cannot self-register as admin / coach / pre-attached member
-- ===========================================================================
set local role postgres;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('5f1a0000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 's1-signup@test.invalid', 'x', now(), now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '5f1a0000-0000-4000-8000-000000000005', true);

select throws_ok(
  $$ insert into public.profiles (id, role, full_name)
     values ('5f1a0000-0000-4000-8000-000000000005', 'admin', 'S1 Signup') $$,
  '42501', null,
  'T4 fresh account cannot insert its profile with role=admin');

select throws_ok(
  $$ insert into public.profiles (id, role, full_name)
     values ('5f1a0000-0000-4000-8000-000000000005', 'coach', 'S1 Signup') $$,
  '42501', null,
  'T4 fresh account cannot insert its profile with role=coach');

select throws_ok(
  $$ insert into public.profiles (id, role, coach_id, full_name)
     values ('5f1a0000-0000-4000-8000-000000000005', 'member', '11111111-1111-1111-1111-111111111111', 'S1 Signup') $$,
  '42501', null,
  'T4 fresh account cannot pick its own coach_id at sign-up');

select throws_ok(
  $$ insert into public.profiles (id, role, full_name)
     values ('5f1a0000-0000-4000-8000-000000000001', 'member', 'S1 Impersonation') $$,
  '42501', null,
  'T4 fresh account cannot insert a profile for somebody else''s id');

-- The legitimate sign-up shape (what app/(auth)/sign-up.tsx sends) still works.
select lives_ok(
  $$ insert into public.profiles (id, role, full_name)
     values ('5f1a0000-0000-4000-8000-000000000005', 'member', 'S1 Signup') $$,
  'T4 the legitimate sign-up insert (role=member, no coach_id) still succeeds');


-- ===========================================================================
-- T3 — a member cannot mint their own live class and walk through the gate
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);

select is(auth.uid(), '99999999-9999-9999-9999-999999999999'::uuid, 'T3 identity: auth.uid() is Riley (expired)');
select is((select state from public.get_subscription_state()), 'expired',
  'T3 Riley''s subscription state is expired');

select throws_ok(
  $$ insert into public.live_classes (id, coach_id, title, agora_channel_name, starts_at)
     values ('5f1a0000-0000-4000-8000-0000000000c9', '99999999-9999-9999-9999-999999999999',
             'S1 Rogue Class', 's1-rogue-chan', now() + interval '1 hour') $$,
  '42501', null,
  'T3 expired member cannot INSERT a live_classes row for themselves');

select ok(
  not public.can_join_live_class('88888888-8888-8888-8888-888888888888'),
  'T3 expired member cannot join their coach''s class (subscription gate holds)');

select ok(
  not public.can_use_live_class_presence_topic('live:88888888-8888-8888-8888-888888888888'),
  'T3 expired member is refused the class presence topic');

-- …and the participants table agrees with the RPC.
select throws_ok(
  $$ insert into public.live_class_participants (live_class_id, member_id)
     values ('88888888-8888-8888-8888-888888888888', '99999999-9999-9999-9999-999999999999') $$,
  '42501', null,
  'T3 expired member cannot insert a live_class_participants row');

-- An entitled member of the same coach still gets through (no over-tightening).
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select ok(public.can_join_live_class('88888888-8888-8888-8888-888888888888'),
  'T3 control: ACTIVE member of that coach can still join');
select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', true);
select ok(public.can_join_live_class('88888888-8888-8888-8888-888888888888'),
  'T3 control: GRACE member of that coach can still join');

-- The coach herself: allowed, and specifically because she holds the coach role.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select ok(public.can_join_live_class('88888888-8888-8888-8888-888888888888'),
  'T3 control: the class coach can join her own class');
-- RETURNING is mandatory here, not decoration. src/features/liveClasses/api.ts
-- createLiveClass uses supabase-js `.insert().select()`, i.e. PostgREST
-- `Prefer: return=representation`, which runs the SELECT policy against the INSERT
-- statement's own snapshot. Round 1 of this suite asserted a BARE insert and therefore
-- passed 146/146 while the real app path returned HTTP 403 (see R2-4 in
-- 20260919152200_role_integrity_round2_fixes.sql). Do not drop the RETURNING.
select lives_ok(
  $$ insert into public.live_classes (id, coach_id, title, agora_channel_name, starts_at)
     values ('5f1a0000-0000-4000-8000-0000000000c8', '11111111-1111-1111-1111-111111111111',
             'S1 Dana Class', 's1-dana-chan', now() + interval '1 hour')
     returning id $$,
  'T3 control: a real coach can still schedule a class (INSERT ... RETURNING, the app path)');

-- Cross-tenant: Dana may not join Coach B's class, and may not schedule for him.
select ok(not public.can_join_live_class('5f1a0000-0000-4000-8000-0000000000c2'),
  'T3 a coach cannot join an unrelated coach''s class');
select throws_ok(
  $$ insert into public.live_classes (coach_id, title, agora_channel_name, starts_at)
     values ('5f1a0000-0000-4000-8000-000000000003', 'S1 Forged', 's1-forged', now()) $$,
  '42501', null,
  'T3 a coach cannot create a class owned by another coach');


-- ===========================================================================
-- T6 — admins are staff everywhere the code already assumed they were
-- ===========================================================================
select set_config('request.jwt.claim.sub', '5f1a0000-0000-4000-8000-000000000002', true);

select ok(public.is_admin(),           'T6 is_admin() is true for the admin fixture');
select ok(public.is_coach_or_admin(),  'T6 is_coach_or_admin() is true for the admin fixture');
select is((select state from public.get_subscription_state()), 'staff',
  'T6 admin''s subscription state is staff');
select ok(public.can_join_live_class('88888888-8888-8888-8888-888888888888'),
  'T6 admin can join any class (Dana''s)');
select ok(public.can_join_live_class('5f1a0000-0000-4000-8000-0000000000c2'),
  'T6 admin can join any class (Coach B''s)');
select ok(public.can_use_live_class_presence_topic('live:88888888-8888-8888-8888-888888888888'),
  'T6 admin is granted the class presence topic');
select cmp_ok((select count(*) from public.profiles), '>=', 4::bigint,
  'T6 admin has a read path on profiles (was 1 = self only)');
select cmp_ok((select count(*) from public.subscriptions), '>=', 3::bigint,
  'T6 admin has a read path on subscriptions');


-- ===========================================================================
-- T5 / auditor — privilege that came only from "owner column = auth.uid()"
-- ===========================================================================
-- A plain member with no coach role may not create coach-owned objects, even
-- when they name themselves as the owner.
select set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);

select throws_ok(
  $$ insert into public.workout_plans (member_id, coach_id, title)
     values ('99999999-9999-9999-9999-999999999999', '99999999-9999-9999-9999-999999999999', 'S1 Self Plan') $$,
  '42501', null,
  'T5 member cannot INSERT a workout_plan naming themselves as coach');

select throws_ok(
  $$ insert into public.diet_plans (coach_id, title)
     values ('99999999-9999-9999-9999-999999999999', 'S1 Self Diet') $$,
  '42501', null,
  'T5 member cannot INSERT a diet_plan naming themselves as coach');

select throws_ok(
  $$ insert into public.groups (name, created_by)
     values ('S1 Member Group', '99999999-9999-9999-9999-999999999999') $$,
  '42501', null,
  'T5 member cannot INSERT a group (group creation is a coach action)');

select throws_ok(
  $$ insert into public.recordings (live_class_id, uploaded_by, status)
     values ('88888888-8888-8888-8888-888888888888', '99999999-9999-9999-9999-999999999999', 'uploading') $$,
  '42501', null,
  'T5 member cannot INSERT a recordings row');

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('recordings', '99999999-9999-9999-9999-999999999999/s1/blob.mp4', '99999999-9999-9999-9999-999999999999') $$,
  '42501', null,
  'T5 member cannot upload into the private recordings bucket');

-- Coaches keep every one of those abilities inside their own tenant.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

-- Targets the spare Dana member, not Jordan: workout_plans is unique per member
-- since 20260921100000 and Jordan already owns the seed plan.
select lives_ok(
  $$ insert into public.workout_plans (member_id, coach_id, title)
     values ('5f1a0000-0000-4000-8000-000000000008', '11111111-1111-1111-1111-111111111111', 'S1 Coach Plan') $$,
  'T5 control: coach can create a plan for her own member');

select lives_ok(
  $$ insert into public.groups (name, created_by) values ('S1 Dana Group', '11111111-1111-1111-1111-111111111111') $$,
  'T5 control: coach can create a group');

select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('recordings', '11111111-1111-1111-1111-111111111111/s1/blob.mp4', '11111111-1111-1111-1111-111111111111') $$,
  'T5 control: coach can upload into her own storage prefix');

-- …but not for somebody else's member (auditor: "plans pushed into any stranger's account").
select throws_ok(
  $$ insert into public.workout_plans (member_id, coach_id, title)
     values ('5f1a0000-0000-4000-8000-000000000004', '11111111-1111-1111-1111-111111111111', 'S1 Cross Plan') $$,
  '42501', null,
  'auditor: coach cannot assign a workout plan to another coach''s member');

select throws_ok(
  $$ insert into public.diet_plan_assignments (diet_plan_id, member_id)
     values ('5f1a0000-0000-4000-8000-0000000000f1', '5f1a0000-0000-4000-8000-000000000004') $$,
  '42501', null,
  'auditor: coach cannot assign a diet plan to another coach''s member');


-- ===========================================================================
-- auditor — storage_path is no longer attacker-chosen (service-role signing IDOR)
-- ===========================================================================
-- Still Dana. Her own prefix is fine; anything else is a CHECK violation, so the
-- transcription pipeline can never be handed another tenant's object key.
select throws_ok(
  $$ insert into public.recordings (live_class_id, uploaded_by, storage_path, status)
     values ('88888888-8888-8888-8888-888888888888', '11111111-1111-1111-1111-111111111111',
             '99999999-9999-9999-9999-999999999999/private/victim.m4a', 'uploading') $$,
  '23514', null,
  'auditor: recordings.storage_path outside the uploader''s prefix is rejected');

select throws_ok(
  $$ insert into public.recordings (live_class_id, uploaded_by, storage_path, status)
     values ('88888888-8888-8888-8888-888888888888', '11111111-1111-1111-1111-111111111111',
             '11111111-1111-1111-1111-111111111111/../9999/victim.m4a', 'uploading') $$,
  '23514', null,
  'auditor: recordings.storage_path containing ".." is rejected');

select ok(
  not has_column_privilege('authenticated', 'public.recordings', 'storage_path', 'SELECT'),
  'auditor: authenticated has no column-level SELECT on recordings.storage_path');
select ok(
  not has_column_privilege('anon', 'public.recordings', 'storage_path', 'SELECT'),
  'auditor: anon has no column-level SELECT on recordings.storage_path');
select ok(
  has_column_privilege('authenticated', 'public.recordings', 'status', 'SELECT'),
  'auditor control: authenticated can still read recordings.status');

-- A recording stays welded to the class it was created for.
select throws_ok(
  $$ update public.recordings set live_class_id = '5f1a0000-0000-4000-8000-0000000000c2'
     where id = '5f1a0000-0000-4000-8000-0000000000a1' $$,
  '42501', null,
  'auditor: recordings.live_class_id cannot be re-pointed at another coach''s class');

select throws_ok(
  $$ update public.recordings set uploaded_by = '5f1a0000-0000-4000-8000-000000000003'
     where id = '5f1a0000-0000-4000-8000-0000000000a1' $$,
  '42501', null,
  'auditor: recordings.uploaded_by cannot be changed');

-- workout_notes.created_by can no longer be forged.
select throws_ok(
  $$ insert into public.workout_notes (recording_id, created_by, edited_content)
     values ('5f1a0000-0000-4000-8000-0000000000a1', '5f1a0000-0000-4000-8000-000000000003', null) $$,
  '42501', null,
  'auditor: workout_notes.created_by cannot be stamped with another user''s id');

-- recording_coach_id() is no longer an id->coach oracle for strangers.
select set_config('request.jwt.claim.sub', '5f1a0000-0000-4000-8000-000000000001', true);
select is(public.recording_coach_id('5f1a0000-0000-4000-8000-0000000000a1'), null::uuid,
  'auditor: recording_coach_id() returns null for an unrelated caller');
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select is(public.recording_coach_id('5f1a0000-0000-4000-8000-0000000000a1'),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'auditor control: recording_coach_id() still answers for the recording''s own coach');


-- ===========================================================================
-- auditor — groups: no self-join into a foreign tenant, no global enumeration
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', '5f1a0000-0000-4000-8000-000000000001', true);

select is((select count(*) from public.groups), 0::bigint,
  'auditor: a stranger enumerates zero groups (was: every group)');
select is((select count(*) from public.live_classes), 0::bigint,
  'auditor: a stranger enumerates zero live classes (was: every class + agora_channel_name)');

select ok(not public.can_join_group('77777777-7777-7777-7777-777777777777'),
  'auditor: can_join_group() is false for a stranger');

select throws_ok(
  $$ insert into public.group_members (group_id, member_id)
     values ('77777777-7777-7777-7777-777777777777', '5f1a0000-0000-4000-8000-000000000001') $$,
  '42501', null,
  'auditor: a stranger cannot self-join another coach''s group');

select is((select count(*) from public.get_group_roster('77777777-7777-7777-7777-777777777777')), 0::bigint,
  'auditor: get_group_roster() still leaks nothing to a non-member');

select ok(not public.can_use_group_presence_topic('group:77777777-7777-7777-7777-777777777777'),
  'auditor: a stranger is refused the group presence topic');
select ok(not public.can_use_presence_topic('group:77777777-7777-7777-7777-777777777777'),
  'auditor: realtime.messages predicate agrees for a stranger');

-- A member of the same coach still joins and still reads the roster.
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select ok(public.can_join_group('77777777-7777-7777-7777-777777777777'),
  'auditor control: Dana''s member may still join Dana''s group');
select cmp_ok((select count(*) from public.get_group_roster('77777777-7777-7777-7777-777777777777')), '>=', 1::bigint,
  'auditor control: a real group member still sees the roster');
select cmp_ok((select count(*) from public.live_classes), '>=', 1::bigint,
  'auditor control: Dana''s member still sees Dana''s classes');
select ok(public.can_use_presence_topic('group:77777777-7777-7777-7777-777777777777'),
  'auditor control: a real group member still gets the presence topic');


-- ===========================================================================
-- auditor — moderation_reports are tenant-scoped, not global
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', '5f1a0000-0000-4000-8000-000000000003', true);

select is((select count(*) from public.moderation_reports
           where id = '5f1a0000-0000-4000-8000-0000000000d2'), 0::bigint,
  'auditor: an unrelated coach cannot read another tenant''s abuse report');

with u as (
  update public.moderation_reports set status = 'dismissed'
  where id = '5f1a0000-0000-4000-8000-0000000000d2' returning 1
)
select is((select count(*) from u), 0::bigint,
  'auditor: an unrelated coach cannot dismiss another tenant''s abuse report');

-- 20260921131000 (moderation_admin) narrowed the moderator from "a coach with a
-- relationship" to the ADMIN only, so the reporter's own coach is now refused
-- too. The tenancy assertions above still hold; what changed is that being the
-- reporter's coach is no longer sufficient.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select is((select count(*) from public.moderation_reports
           where id = '5f1a0000-0000-4000-8000-0000000000d2'), 0::bigint,
  'auditor: the reporter''s coach no longer sees the report (admin-only since 20260921131000)');
with u as (
  update public.moderation_reports set status = 'dismissed'
  where id = '5f1a0000-0000-4000-8000-0000000000d2' returning 1
)
select is((select count(*) from u), 0::bigint,
  'auditor: the reporter''s coach no longer actions the report');

-- Positive control, so the refusals above cannot pass just because the row is
-- unreachable: the admin still reads and actions it.
select set_config('request.jwt.claim.sub', '5f1a0000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.moderation_reports
           where id = '5f1a0000-0000-4000-8000-0000000000d2'), 1::bigint,
  'auditor control: the admin sees the report');
with u as (
  update public.moderation_reports set status = 'dismissed'
  where id = '5f1a0000-0000-4000-8000-0000000000d2' returning 1
)
select is((select count(*) from u), 1::bigint,
  'auditor control: the admin can action the report');

-- A moderator may not close a report filed against themselves.
set local role postgres;
insert into public.moderation_reports (id, reporter_id, reported_user_id, reason)
values ('5f1a0000-0000-4000-8000-0000000000d3', '22222222-2222-2222-2222-222222222222',
        '11111111-1111-1111-1111-111111111111', 's1 fixture: report against the coach');
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
with u as (
  update public.moderation_reports set status = 'dismissed'
  where id = '5f1a0000-0000-4000-8000-0000000000d3' returning 1
)
select is((select count(*) from u), 0::bigint,
  'auditor: a moderator cannot dismiss a report filed against themselves');


-- ===========================================================================
-- auditor — workout_completions: no forged scores, no foreign days, no fiction
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

select throws_ok(
  $$ insert into public.workout_completions (member_id, workout_day_id, status)
     values ('22222222-2222-2222-2222-222222222222', '5f1a0000-0000-4000-8000-0000000000e4', 'completed') $$,
  '42501', null,
  'auditor: a member cannot log a completion against another coach''s workout day');

select throws_ok(
  $$ insert into public.workout_completions (member_id, workout_day_id, status, effort_score, scored_by)
     values ('22222222-2222-2222-2222-222222222222', '5f1a0000-0000-4000-8000-0000000000e2',
             'completed', 10, '11111111-1111-1111-1111-111111111111') $$,
  '42501', null,
  'auditor: a member cannot fabricate effort_score / scored_by on insert');

select lives_ok(
  $$ insert into public.workout_completions (member_id, workout_day_id, status)
     values ('22222222-2222-2222-2222-222222222222', '5f1a0000-0000-4000-8000-0000000000e2', 'completed') $$,
  'auditor control: a member can still log their own completion');

-- completed_at is a server clock, not a client field.
select ok(
  (select completed_at from public.workout_completions
    where member_id = '22222222-2222-2222-2222-222222222222'
      and workout_day_id = '5f1a0000-0000-4000-8000-0000000000e2') > now() - interval '1 minute',
  'auditor: completed_at is stamped server-side on insert');

select throws_ok(
  $$ update public.workout_completions set completed_at = now() - interval '40 days'
     where member_id = '22222222-2222-2222-2222-222222222222'
       and workout_day_id = '5f1a0000-0000-4000-8000-0000000000e2' $$,
  '42501', null,
  'auditor: a member cannot back-date completed_at to manufacture a streak');

select throws_ok(
  $$ update public.workout_completions set effort_score = 10, scored_by = '11111111-1111-1111-1111-111111111111'
     where member_id = '22222222-2222-2222-2222-222222222222'
       and workout_day_id = '5f1a0000-0000-4000-8000-0000000000e2' $$,
  '42501', null,
  'auditor: a member cannot forge a coach effort score on their own row');

select throws_ok(
  $$ update public.workout_completions set workout_day_id = '5f1a0000-0000-4000-8000-0000000000e4'
     where member_id = '22222222-2222-2222-2222-222222222222'
       and workout_day_id = '5f1a0000-0000-4000-8000-0000000000e2' $$,
  '42501', null,
  'auditor: a member cannot move a completion onto another coach''s day');

select throws_ok(
  $$ insert into public.workout_completions (member_id, workout_day_id, status)
     values ('22222222-2222-2222-2222-222222222222', '5f1a0000-0000-4000-8000-0000000000e2', 'completed') $$,
  '23505', null,
  'auditor: a second completion for the same (member, day) on the SAME UTC date is impossible');

-- The coach scores — as herself, and only on her own member's day.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select lives_ok(
  $$ update public.workout_completions set effort_score = 7, scored_by = '11111111-1111-1111-1111-111111111111'
     where workout_day_id = '5f1a0000-0000-4000-8000-0000000000e2' $$,
  'auditor control: the plan''s coach can still record an effort score');

select throws_ok(
  $$ update public.workout_completions set effort_score = 9, scored_by = '5f1a0000-0000-4000-8000-000000000003'
     where workout_day_id = '5f1a0000-0000-4000-8000-0000000000e2' $$,
  '42501', null,
  'auditor: a coach cannot attribute a score to a different coach');


-- ===========================================================================
-- auditor — milestones cannot be self-awarded
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

select throws_ok(
  $$ insert into public.milestones (member_id, tier)
     values ('22222222-2222-2222-2222-222222222222', 'thirty_day_streak') $$,
  '42501', null,
  'auditor: a member cannot award themselves an unearned milestone');

select throws_ok(
  $$ insert into public.milestones (member_id, tier)
     values ('66666666-6666-6666-6666-666666666666', 'first_day') $$,
  '42501', null,
  'auditor: a member cannot award a milestone to somebody else');

select ok(public.has_earned_milestone('22222222-2222-2222-2222-222222222222', 'first_day'),
  'auditor control: has_earned_milestone() recognises the one completion logged above');
select lives_ok(
  $$ insert into public.milestones (member_id, tier)
     values ('22222222-2222-2222-2222-222222222222', 'first_day') $$,
  'auditor control: a genuinely earned milestone is still accepted');


-- ===========================================================================
-- auditor — diet_checkins are scoped to assigned items and a sane date window
-- ===========================================================================
select throws_ok(
  $$ insert into public.diet_checkins (member_id, diet_item_id, checkin_date)
     values ('22222222-2222-2222-2222-222222222222', '5f1a0000-0000-4000-8000-0000000000f4', current_date) $$,
  '42501', null,
  'auditor: a member cannot check in against another coach''s diet item');

select throws_ok(
  $$ insert into public.diet_checkins (member_id, diet_item_id, checkin_date)
     values ('22222222-2222-2222-2222-222222222222', '5f1a0000-0000-4000-8000-0000000000f2', current_date - 200) $$,
  '42501', null,
  'auditor: a member cannot back-date a diet check-in 200 days');

select throws_ok(
  $$ insert into public.diet_checkins (member_id, diet_item_id, checkin_date)
     values ('22222222-2222-2222-2222-222222222222', '5f1a0000-0000-4000-8000-0000000000f2', current_date + 30) $$,
  '42501', null,
  'auditor: a member cannot pre-date a diet check-in 30 days');

select lives_ok(
  $$ insert into public.diet_checkins (member_id, diet_item_id, checkin_date)
     values ('22222222-2222-2222-2222-222222222222', '5f1a0000-0000-4000-8000-0000000000f2', current_date) $$,
  'auditor control: a member can still check in on their own assigned item today');


-- ===========================================================================
-- auditor — unbounded text / row counts
-- ===========================================================================
select throws_ok(
  $$ insert into public.push_tokens (user_id, expo_push_token)
     values ('22222222-2222-2222-2222-222222222222', repeat('x', 100000)) $$,
  '23514', null,
  'auditor: a 100k-character push token is rejected by a length CHECK');

select throws_ok(
  $$ update public.profiles set full_name = repeat('x', 5000)
     where id = '22222222-2222-2222-2222-222222222222' $$,
  '23514', null,
  'auditor: profiles.full_name is length-bounded');

select throws_ok(
  $$ insert into public.moderation_reports (reporter_id, reported_user_id, reason)
     values ('22222222-2222-2222-2222-222222222222', '66666666-6666-6666-6666-666666666666', repeat('x', 5000)) $$,
  '23514', null,
  'auditor: moderation_reports.reason is length-bounded');

select throws_ok(
  $$ insert into public.push_tokens (user_id, expo_push_token)
     select '22222222-2222-2222-2222-222222222222', 's1-token-' || g from generate_series(1, 60) g $$,
  '54000', null,
  'auditor: push_tokens are row-capped per user');


-- ===========================================================================
-- auditor — is_privileged_writer() must not be satisfiable by a client role
-- ===========================================================================
select ok(not public.is_privileged_writer(),
  'guard: is_privileged_writer() is false for authenticated');
select ok(not public.is_coach_or_admin(),
  'guard: is_coach_or_admin() is false for a plain member');
select ok(not public.is_admin(),
  'guard: is_admin() is false for a plain member');

set local role postgres;
select ok(public.is_privileged_writer(),
  'guard control: is_privileged_writer() is true for postgres (so seed.sql still applies)');
select lives_ok(
  $$ update public.profiles set role = 'coach' where id = '5f1a0000-0000-4000-8000-000000000001' $$,
  'guard control: postgres can still assign roles (service-role / seed path)');
select lives_ok(
  $$ update public.profiles set coach_id = '11111111-1111-1111-1111-111111111111'
     where id = '5f1a0000-0000-4000-8000-000000000001' $$,
  'guard control: postgres can still assign coach_id (service-role / seed path)');


-- ===========================================================================
-- auditor — server-side profile provisioning (20260919152100)
-- ===========================================================================
set local role postgres;

-- The seed path: a privileged writer creating auth.users must NOT be
-- provisioned, so supabase/seed.sql keeps authoring its own demo roles.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('5f1a0000-0000-4000-8000-0000000005ed', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 's1-seedpath@test.invalid', 'x', now(), now());

select is((select count(*) from public.profiles where id = '5f1a0000-0000-4000-8000-0000000005ed'), 0::bigint,
  'provisioning: postgres-authored auth.users rows are NOT auto-provisioned (seed.sql is unaffected)');

select lives_ok(
  $$ insert into public.profiles (id, role, coach_id, full_name)
     values ('5f1a0000-0000-4000-8000-0000000005ed', 'coach', null, 'S1 Seed Coach') $$,
  'provisioning: seed.sql can still author a coach profile for that user');

select ok(
  exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
            join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'auth' and c.relname = 'users'
             and t.tgname = 'handle_new_auth_user' and not t.tgisinternal),
  'provisioning: the AFTER INSERT trigger is installed on auth.users');

-- The GoTrue path. auth.users is owned by supabase_auth_admin and `postgres` on
-- this stack is not a superuser, so the suite cannot SET ROLE to the real
-- writer. Instead the trigger FUNCTION is fired from a temp table with the same
-- shape, as `authenticated` — a role for which is_privileged_writer() is false,
-- exactly like supabase_auth_admin. The auth.users rows the profiles FK needs
-- are created as postgres first (and, per the assertion above, are not
-- provisioned by that path).
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('5f1a0000-0000-4000-8000-000000000a71', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 's1-gotrue@test.invalid',  'x', now(), now()),
  ('5f1a0000-0000-4000-8000-000000000a72', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 's1-noname@test.invalid',  'x', now(), now()),
  ('5f1a0000-0000-4000-8000-000000000a73', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 's1-metarole@test.invalid','x', now(), now());

create temporary table s1_fake_auth_users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb
) on commit drop;

create trigger handle_new_auth_user
  after insert on s1_fake_auth_users
  for each row execute function public.handle_new_auth_user();

grant insert on s1_fake_auth_users to authenticated;

set local role authenticated;
select ok(not public.is_privileged_writer(),
  'provisioning: the simulated GoTrue writer is not a privileged writer');

insert into s1_fake_auth_users (id, email, raw_user_meta_data) values
  ('5f1a0000-0000-4000-8000-000000000a71', 's1-gotrue@test.invalid',  '{"full_name":"S1 GoTrue Person"}'::jsonb),
  ('5f1a0000-0000-4000-8000-000000000a72', 's1-noname@test.invalid',  null),
  ('5f1a0000-0000-4000-8000-000000000a73', 's1-metarole@test.invalid',
     '{"full_name":"S1 Meta","role":"admin","coach_id":"11111111-1111-1111-1111-111111111111"}'::jsonb);

set local role postgres;
select is((select role from public.profiles where id = '5f1a0000-0000-4000-8000-000000000a71'), 'member',
  'provisioning: a sign-up is provisioned with role=member');
select is((select coach_id from public.profiles where id = '5f1a0000-0000-4000-8000-000000000a71'), null::uuid,
  'provisioning: a sign-up is provisioned with coach_id=null');
select is((select full_name from public.profiles where id = '5f1a0000-0000-4000-8000-000000000a71'), 'S1 GoTrue Person',
  'provisioning: full_name comes from raw_user_meta_data');

-- A sign-up that sent no metadata must still produce a valid row rather than
-- failing registration on the NOT NULL / length CHECK.
select is((select full_name from public.profiles where id = '5f1a0000-0000-4000-8000-000000000a72'), 's1-noname',
  'provisioning: full_name falls back to the email local part when metadata is absent');

-- raw_user_meta_data is client-editable, so it must not be able to pick a role.
select is((select role from public.profiles where id = '5f1a0000-0000-4000-8000-000000000a73'), 'member',
  'provisioning: user_metadata.role is ignored (raw_user_meta_data is client-editable)');
select is((select coach_id from public.profiles where id = '5f1a0000-0000-4000-8000-000000000a73'), null::uuid,
  'provisioning: user_metadata.coach_id is ignored');


-- ===========================================================================
-- anon — every predicate must refuse, and none may crash the backend
-- (a role calling a SECURITY DEFINER function it lacks EXECUTE on segfaults
--  this Postgres build, so each function is called three times here)
-- ===========================================================================
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select is(auth.uid(), null::uuid, 'anon: auth.uid() is null');

select lives_ok($$ select public.is_coach_or_admin(), public.is_coach_or_admin(), public.is_coach_or_admin() $$,
  'anon x3: is_coach_or_admin() does not crash');
select lives_ok($$ select public.is_admin(), public.is_admin(), public.is_admin() $$,
  'anon x3: is_admin() does not crash');
select lives_ok($$ select public.is_privileged_writer(), public.is_privileged_writer(), public.is_privileged_writer() $$,
  'anon x3: is_privileged_writer() does not crash');
select lives_ok($$ select public.can_see_live_class('88888888-8888-8888-8888-888888888888'),
                          public.can_see_live_class('88888888-8888-8888-8888-888888888888'),
                          public.can_see_live_class('88888888-8888-8888-8888-888888888888') $$,
  'anon x3: can_see_live_class() does not crash');
select lives_ok($$ select public.can_join_live_class('88888888-8888-8888-8888-888888888888'),
                          public.can_join_live_class('88888888-8888-8888-8888-888888888888'),
                          public.can_join_live_class('88888888-8888-8888-8888-888888888888') $$,
  'anon x3: can_join_live_class() does not crash');
select lives_ok($$ select public.can_join_group('77777777-7777-7777-7777-777777777777'),
                          public.can_join_group('77777777-7777-7777-7777-777777777777'),
                          public.can_join_group('77777777-7777-7777-7777-777777777777') $$,
  'anon x3: can_join_group() does not crash');
select lives_ok($$ select public.can_use_presence_topic('group:77777777-7777-7777-7777-777777777777'),
                          public.can_use_presence_topic('live:88888888-8888-8888-8888-888888888888'),
                          public.can_use_presence_topic('nonsense') $$,
  'anon x3: can_use_presence_topic() does not crash');
select lives_ok($$ select public.recording_coach_id('5f1a0000-0000-4000-8000-0000000000a1'),
                          public.recording_coach_id('5f1a0000-0000-4000-8000-0000000000a1'),
                          public.recording_coach_id('5f1a0000-0000-4000-8000-0000000000a1') $$,
  'anon x3: recording_coach_id() does not crash');
select lives_ok($$ select public.owns_workout_day('5f1a0000-0000-4000-8000-0000000000e2'),
                          public.is_coach_of_workout_day('5f1a0000-0000-4000-8000-0000000000e2'),
                          public.is_assigned_diet_item('5f1a0000-0000-4000-8000-0000000000f2') $$,
  'anon x3: workout/diet ownership helpers do not crash');
select lives_ok($$ select public.has_earned_milestone('22222222-2222-2222-2222-222222222222', 'first_day'),
                          public.has_earned_milestone('22222222-2222-2222-2222-222222222222', 'seven_day_streak'),
                          public.has_earned_milestone('22222222-2222-2222-2222-222222222222', 'thirty_day_streak') $$,
  'anon x3: has_earned_milestone() does not crash');
select lives_ok($$ select public.has_live_access('22222222-2222-2222-2222-222222222222'),
                          public.has_live_access('22222222-2222-2222-2222-222222222222'),
                          public.has_live_access('22222222-2222-2222-2222-222222222222') $$,
  'anon x3: has_live_access() does not crash');
select lives_ok($$ select count(*) from (
                     select * from public.get_subscription_state()
                     union all select * from public.get_subscription_state()
                     union all select * from public.get_subscription_state()) s $$,
  'anon x3: get_subscription_state() does not crash');
select lives_ok($$ select count(*) from (
                     select * from public.get_group_roster('77777777-7777-7777-7777-777777777777')
                     union all select * from public.get_group_roster('77777777-7777-7777-7777-777777777777')
                     union all select * from public.get_group_roster('77777777-7777-7777-7777-777777777777')) s $$,
  'anon x3: get_group_roster() does not crash');

-- …and they all answer "no".
select ok(not public.is_coach_or_admin(),  'anon: is_coach_or_admin() is false');
select ok(not public.is_admin(),           'anon: is_admin() is false');
select ok(not public.is_privileged_writer(), 'anon: is_privileged_writer() is false');
select ok(not public.can_join_live_class('88888888-8888-8888-8888-888888888888'), 'anon: can_join_live_class() is false');
select ok(not public.can_see_live_class('88888888-8888-8888-8888-888888888888'),  'anon: can_see_live_class() is false');
select ok(not public.can_join_group('77777777-7777-7777-7777-777777777777'),      'anon: can_join_group() is false');
select ok(not public.can_use_presence_topic('group:77777777-7777-7777-7777-777777777777'), 'anon: can_use_presence_topic() is false');
select is(public.recording_coach_id('5f1a0000-0000-4000-8000-0000000000a1'), null::uuid, 'anon: recording_coach_id() is null');
select is((select state from public.get_subscription_state()), 'none', 'anon: subscription state is none');
select is((select count(*) from public.profiles), 0::bigint,      'anon: reads zero profiles');
select is((select count(*) from public.groups), 0::bigint,        'anon: reads zero groups');
select is((select count(*) from public.live_classes), 0::bigint,  'anon: reads zero live classes');
select is((select count(*) from public.recordings), 0::bigint,    'anon: reads zero recordings');
select is((select count(*) from public.workout_notes), 0::bigint, 'anon: reads zero workout notes');


-- ===========================================================================
-- Function hardening invariants (auditor low-severity items)
-- ===========================================================================
set local role postgres;

select is(
  (select count(*)::int from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('is_coach_or_admin', 'is_admin', 'can_see_live_class', 'can_join_group',
                        'can_use_presence_topic', 'recording_coach_id', 'has_earned_milestone',
                        'owns_workout_day', 'is_coach_of_workout_day', 'is_assigned_diet_item')
      and p.prosecdef
      and array_to_string(p.proconfig, ',') like '%search_path=%'),
  10,
  'hardening: every new authorization helper is SECURITY DEFINER with a pinned search_path');

select ok(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('push_tokens_touch_updated_at', 'subscriptions_touch_updated_at',
                        'can_use_presence_topic', 'profiles_guard_privileged_columns',
                        'recordings_guard_client_writes', 'workout_completions_guard_client_writes')
      and array_to_string(p.proacl, ',') ~ '(^|,)=X/'),
  'hardening: no PUBLIC EXECUTE left on the guard / touch / presence functions');

-- anon and authenticated must KEEP execute (revoking it segfaults this build).
select ok(has_function_privilege('authenticated', 'public.can_use_presence_topic(text)', 'EXECUTE'),
  'hardening: authenticated still holds EXECUTE on can_use_presence_topic (never revoke)');
select ok(has_function_privilege('anon', 'public.is_coach_or_admin(uuid)', 'EXECUTE'),
  'hardening: anon still holds EXECUTE on is_coach_or_admin (never revoke)');

-- ===========================================================================
-- ROUND 2 — regressions and residual oracles found by the re-attack
-- (fixes live in 20260919152200_role_integrity_round2_fixes.sql)
--
-- NOTE: by this point the suite has already promoted fixture …0001 to 'coach'
-- and re-parented it, so this section creates its OWN fixtures rather than
-- leaning on any earlier identity.
-- ===========================================================================
set local role postgres;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('5f1a0000-0000-4000-8000-0000000000a2'::uuid, '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 's1-r2-member@test.invalid', 'x', now(), now());

insert into public.profiles (id, role, coach_id, full_name)
values ('5f1a0000-0000-4000-8000-0000000000a2'::uuid, 'member', null, 'S1 R2 Plain Member');

-- A group whose creator is a plain member: models both "created before the
-- coach-only INSERT policy" and "creator has since been demoted".
insert into public.groups (id, name, description, created_by)
values ('5f1a0000-0000-4000-8000-0000000000a3'::uuid, 'S1 R2 Member Group', 'owned by a non-coach',
        '5f1a0000-0000-4000-8000-0000000000a2'::uuid);

-- ---------------------------------------------------------------------------
-- R2-1 — repeating a workout must stay possible (the core daily loop).
-- Round 1's unique (member_id, workout_day_id) was a LIFETIME cap, so a member
-- could never redo a day and the 7/30-day streak milestones were unreachable.
-- ---------------------------------------------------------------------------
select hasnt_index('public', 'workout_completions', 'workout_completions_member_day_key',
  'R2-1: the lifetime (member, day) unique key is gone');
-- 20260921112000 (timezone_local_dates) re-keyed this from the UTC calendar date
-- to the member's LOCAL calendar date. The per-day cap is unchanged in strength;
-- only the date it buckets on moved, so the old name must be gone and the new
-- one present.
select hasnt_index('public', 'workout_completions', 'workout_completions_member_day_date_key',
  'R2-1: the UTC-calendar-date unique key is gone');
select has_index('public', 'workout_completions', 'workout_completions_member_day_local_key',
  'R2-1: replaced by a per-LOCAL-calendar-date unique key');

-- The same day on three different dates is the whole point: streaks need it.
-- (An earlier section of this suite already logged Jordan/e2 for TODAY, so these
--  use older dates — the assertion is about repeating a day, not about today.)
select lives_ok(
  $$ insert into public.workout_completions (member_id, workout_day_id, status, completed_at) values
       ('22222222-2222-2222-2222-222222222222', '5f1a0000-0000-4000-8000-0000000000e2', 'completed', now() - interval '10 days'),
       ('22222222-2222-2222-2222-222222222222', '5f1a0000-0000-4000-8000-0000000000e2', 'completed', now() - interval '9 days'),
       ('22222222-2222-2222-2222-222222222222', '5f1a0000-0000-4000-8000-0000000000e2', 'completed', now() - interval '8 days') $$,
  'R2-1: the same workout day can be completed on three different dates (streaks reachable)');

-- ...but the anti-flood intent of the original constraint is kept. All 150 rows
-- share one date that no other case uses, so the conflict is unambiguously the
-- flood colliding with itself rather than with a pre-existing row.
select throws_ok(
  $$ insert into public.workout_completions (member_id, workout_day_id, status, completed_at)
     select '22222222-2222-2222-2222-222222222222', '5f1a0000-0000-4000-8000-0000000000e2', 'completed', now() - interval '20 days'
     from generate_series(1, 150) $$,
  '23505', null,
  'R2-1: 150 completions of one day in one statement still fail (anti-flood kept)');

set local role authenticated;
select set_config('request.jwt.claim.sub', '5f1a0000-0000-4000-8000-000000000004', true);

-- As a real client: first completion today succeeds, a second one the same day does not.
select lives_ok(
  $$ insert into public.workout_completions (member_id, workout_day_id, status)
     values ('5f1a0000-0000-4000-8000-000000000004', '5f1a0000-0000-4000-8000-0000000000e4', 'completed') $$,
  'R2-1 control: a member can log today''s workout');
select throws_ok(
  $$ insert into public.workout_completions (member_id, workout_day_id, status)
     values ('5f1a0000-0000-4000-8000-000000000004', '5f1a0000-0000-4000-8000-0000000000e4', 'completed') $$,
  '23505', null,
  'R2-1: the same member/day twice on the same UTC date is still rejected');

-- The case above and the three-dates case earlier are BOTH insufficient on their
-- own to prove the core loop, and the gap is subtle enough that it deserves its
-- own fixture: the three-dates insert runs as postgres, and only a privileged
-- writer may choose completed_at (workout_completions_guard_client_writes forces
-- `new.completed_at := now()` for everyone else). So that case proves the INDEX
-- permits several dates, not that a MEMBER can ever reach a second date.
-- Conversely the control above only shows today-then-today-again.
--
-- The actual regression the auditors reported is neither: a member who did day X
-- on earlier dates taps "Finish Workout" for day X again today. That is the path
-- round 1 broke with 23505, and it is reproduced here end to end - backdated
-- history written as postgres (as real history would have accumulated), then the
-- repeat performed as the member with a server-assigned completed_at.
reset role;
insert into public.workout_days (id, workout_plan_id, day_number, block_name)
values ('5f1a0000-0000-4000-8000-0000000000e5', '5f1a0000-0000-4000-8000-0000000000e3', 2, 'S1 R2 Repeat Day');

insert into public.workout_completions (member_id, workout_day_id, status, completed_at)
select '5f1a0000-0000-4000-8000-000000000004', '5f1a0000-0000-4000-8000-0000000000e5', 'completed',
       now() - (n || ' days')::interval
from generate_series(1, 7) n;

set local role authenticated;
select set_config('request.jwt.claim.sub', '5f1a0000-0000-4000-8000-000000000004', true);

select lives_ok(
  $$ insert into public.workout_completions (member_id, workout_day_id, status)
     values ('5f1a0000-0000-4000-8000-000000000004', '5f1a0000-0000-4000-8000-0000000000e5', 'completed') $$,
  'R2-1: a member can repeat a workout day they already completed on earlier dates (round 1: 23505)');

select is(
  (select count(*)::int from public.workout_completions
    where member_id = '5f1a0000-0000-4000-8000-000000000004'
      and workout_day_id = '5f1a0000-0000-4000-8000-0000000000e5'),
  8,
  'R2-1: and the repeat actually landed - 8 completions of one day across 8 dates');

-- The lifetime cap also made the streak tiers unreachable, so assert the payoff
-- directly rather than inferring it from the row count.
select is(public.has_earned_milestone('5f1a0000-0000-4000-8000-000000000004', 'seven_day_streak'), true,
  'R2-1: the seven_day_streak milestone is reachable again (was capped at plan length)');

-- ---------------------------------------------------------------------------
-- R2-2 — has_earned_milestone() was an unauthenticated activity oracle.
-- Every assertion below also pins the result to NOT NULL: SQL three-valued
-- logic would otherwise turn the gate into a `null` vs `false` oracle, which is
-- just as distinguishing over PostgREST.
-- ---------------------------------------------------------------------------
set local role postgres;
insert into public.workout_completions (member_id, workout_day_id, status, completed_at)
values ('5f1a0000-0000-4000-8000-000000000004', '5f1a0000-0000-4000-8000-0000000000e4', 'completed', now() - interval '3 days');

set local role authenticated;
select set_config('request.jwt.claim.sub', '5f1a0000-0000-4000-8000-0000000000a2', true);
select is(public.has_earned_milestone('5f1a0000-0000-4000-8000-000000000004', 'first_day'), false,
  'R2-2: an unrelated member cannot learn whether another member has trained');
select is(public.has_earned_milestone('5f1a0000-0000-4000-8000-000000000004', 'seven_day_streak'), false,
  'R2-2: nor whether they hold a 7-day streak');

select set_config('request.jwt.claim.sub', '5f1a0000-0000-4000-8000-000000000004', true);
select is(public.has_earned_milestone('5f1a0000-0000-4000-8000-000000000004', 'first_day'), true,
  'R2-2 control: the member themselves still gets a real answer (milestones INSERT policy)');

select set_config('request.jwt.claim.sub', '5f1a0000-0000-4000-8000-000000000003', true);
select is(public.has_earned_milestone('5f1a0000-0000-4000-8000-000000000004', 'first_day'), true,
  'R2-2 control: their own coach still gets a real answer');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is(public.has_earned_milestone('5f1a0000-0000-4000-8000-000000000004', 'first_day'), false,
  'R2-2: anon gets false, not null, and not the truth');

-- ---------------------------------------------------------------------------
-- R2-3 — is_coach_or_admin(uuid) / is_admin(uuid) were staff-role oracles.
-- ---------------------------------------------------------------------------
select is(public.is_coach_or_admin('11111111-1111-1111-1111-111111111111'), false,
  'R2-3: anon probing a real coach gets false (not true, not null)');
select is(public.is_coach_or_admin('22222222-2222-2222-2222-222222222222'), false,
  'R2-3: anon probing a real member gets false — the two are indistinguishable');
select is(public.is_admin('5f1a0000-0000-4000-8000-000000000002'), false,
  'R2-3: anon probing a real admin gets false');

set local role authenticated;
select set_config('request.jwt.claim.sub', '5f1a0000-0000-4000-8000-0000000000a2', true);
select is(public.is_coach_or_admin('11111111-1111-1111-1111-111111111111'), false,
  'R2-3: a plain member cannot probe a foreign uid for staff-ness');
select is(public.is_coach_or_admin(), false,
  'R2-3 control: the zero-arg form still answers about the caller (member -> false)');

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select is(public.is_coach_or_admin(), true,
  'R2-3 control: the zero-arg form every policy uses is unchanged for a coach');
-- SUPERSEDED BY R3-3 (see the round 3 block below). R2 left a caller-ROLE arm in the
-- gate, so any coach could enumerate which uuids are staff — data profiles RLS hides
-- from them. The gate is now relationship-based, so an UNRELATED staff uid resolves to
-- false. Tightening, not a weakening: every in-tree call site is zero-arg, asserted
-- immediately above and again in R3-3.
select is(public.is_coach_or_admin('5f1a0000-0000-4000-8000-000000000003'), false,
  'R2-3/R3-3: staff may no longer resolve an UNRELATED staff uid (the oracle is closed)');

-- ---------------------------------------------------------------------------
-- R2-5 — INSERT ... RETURNING on groups (the supabase-js .insert().select()
-- idiom) must not trip the STABLE-helper snapshot defect. Twin of the
-- live_classes case asserted above.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.groups (name, description, created_by)
     values ('S1 R2 Coach Group', 'created via RETURNING', '11111111-1111-1111-1111-111111111111')
     returning id $$,
  'R2-5: a coach can create a group with INSERT ... RETURNING (the app path)');

-- ---------------------------------------------------------------------------
-- R2-6 — groups UPDATE/DELETE were privileged on created_by alone, so a
-- demoted (or never-promoted) creator kept full control.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '5f1a0000-0000-4000-8000-0000000000a2', true);

update public.groups set name = 'pwned by a non-coach'
 where id = '5f1a0000-0000-4000-8000-0000000000a3'::uuid;
select is(
  (select name from public.groups where id = '5f1a0000-0000-4000-8000-0000000000a3'::uuid),
  'S1 R2 Member Group',
  'R2-6: a non-coach creator can no longer rename their own group');

delete from public.groups where id = '5f1a0000-0000-4000-8000-0000000000a3'::uuid;
select isnt_empty(
  $$ select 1 from public.groups where id = '5f1a0000-0000-4000-8000-0000000000a3'::uuid $$,
  'R2-6: a non-coach creator can no longer delete their own group');

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select lives_ok(
  $$ update public.groups set description = 'still editable by its coach'
      where id = '77777777-7777-7777-7777-777777777777' $$,
  'R2-6 control: the owning coach can still edit her group');
select is(
  (select description from public.groups where id = '77777777-7777-7777-7777-777777777777'),
  'still editable by its coach',
  'R2-6 control: and the edit actually landed (policy did not silently filter it)');

-- ---------------------------------------------------------------------------
-- R2-7 — moderation_reports had a text bound but no row cap, so one member
-- could insert 20000 rows in a single statement.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

select throws_ok(
  $$ insert into public.moderation_reports (reporter_id, reported_user_id, reason)
     select '22222222-2222-2222-2222-222222222222', '66666666-6666-6666-6666-666666666666', 's1-r2-flood-' || g
     from generate_series(1, 5000) g $$,
  '54000', null,
  'R2-7: a 5000-row report flood in one statement is rejected');

-- The pair cap is exercised with a reporter this suite has not touched, so the
-- counts are exact regardless of what earlier sections did.
select set_config('request.jwt.claim.sub', '5f1a0000-0000-4000-8000-0000000000a2', true);

select lives_ok(
  $$ insert into public.moderation_reports (reporter_id, reported_user_id, reason)
     values ('5f1a0000-0000-4000-8000-0000000000a2', '66666666-6666-6666-6666-666666666666', 's1-r2 genuine first report') $$,
  'R2-7 control: a genuine report is accepted');
select lives_ok(
  $$ insert into public.moderation_reports (reporter_id, reported_user_id, reason)
     values ('5f1a0000-0000-4000-8000-0000000000a2', '66666666-6666-6666-6666-666666666666', 's1-r2 genuine second report') $$,
  'R2-7 control: and so is a second');
select lives_ok(
  $$ insert into public.moderation_reports (reporter_id, reported_user_id, reason)
     values ('5f1a0000-0000-4000-8000-0000000000a2', '66666666-6666-6666-6666-666666666666', 's1-r2 genuine third report') $$,
  'R2-7 control: and so is a third');
select throws_ok(
  $$ insert into public.moderation_reports (reporter_id, reported_user_id, reason)
     values ('5f1a0000-0000-4000-8000-0000000000a2', '66666666-6666-6666-6666-666666666666', 's1-r2 fourth report') $$,
  '54000', null,
  'R2-7: a fourth open report about the same member is refused');

select lives_ok(
  $$ insert into public.moderation_reports (reporter_id, reported_user_id, reason)
     values ('5f1a0000-0000-4000-8000-0000000000a2', '99999999-9999-9999-9999-999999999999', 's1-r2 different person') $$,
  'R2-7 control: the pair cap does not block reporting a DIFFERENT member');

-- Daily cap: top this reporter up to exactly 20 rows in 24h as a privileged
-- writer (exempt from the trigger, but the rows still count), then the next
-- CLIENT insert must fail on the daily bound. The final target is a pair with
-- no prior rows, so the refusal can only be the 24h cap, not the pair cap.
set local role postgres;
insert into public.moderation_reports (reporter_id, reported_user_id, reason)
select '5f1a0000-0000-4000-8000-0000000000a2', '11111111-1111-1111-1111-111111111111', 's1-r2 topup ' || g
from generate_series(
  1,
  20 - (select count(*)::int from public.moderation_reports
         where reporter_id = '5f1a0000-0000-4000-8000-0000000000a2'
           and created_at >= now() - interval '24 hours')
) g;

set local role authenticated;
select set_config('request.jwt.claim.sub', '5f1a0000-0000-4000-8000-0000000000a2', true);
select is(
  (select count(*)::int from public.moderation_reports
    where reporter_id = '5f1a0000-0000-4000-8000-0000000000a2'
      and created_at >= now() - interval '24 hours'),
  20,
  'R2-7 setup: the reporter now sits exactly on the 24h bound');
select throws_ok(
  $$ insert into public.moderation_reports (reporter_id, reported_user_id, reason)
     values ('5f1a0000-0000-4000-8000-0000000000a2', '5f1a0000-0000-4000-8000-000000000004', 's1-r2 over the daily cap') $$,
  '54000', null,
  'R2-7: the per-reporter 24h cap stops a slow-drip flood across many targets');

-- ---------------------------------------------------------------------------
-- R2-3/R2-2 crash safety — this build SIGSEGVs when a role calls a SECURITY
-- DEFINER function it lacks EXECUTE on, so each replaced function is called
-- three times as anon and must simply return false.
-- ---------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select lives_ok(
  $$ select public.is_coach_or_admin('11111111-1111-1111-1111-111111111111'),
            public.is_coach_or_admin('11111111-1111-1111-1111-111111111111'),
            public.is_coach_or_admin('11111111-1111-1111-1111-111111111111') $$,
  'R2 crash safety: is_coach_or_admin(uuid) x3 as anon does not crash the backend');
select lives_ok(
  $$ select public.is_admin('11111111-1111-1111-1111-111111111111'),
            public.is_admin('11111111-1111-1111-1111-111111111111'),
            public.is_admin('11111111-1111-1111-1111-111111111111') $$,
  'R2 crash safety: is_admin(uuid) x3 as anon does not crash the backend');
select lives_ok(
  $$ select public.has_earned_milestone(null, 'first_day'),
            public.has_earned_milestone(null, 'first_day'),
            public.has_earned_milestone(null, 'first_day') $$,
  'R2 crash safety: has_earned_milestone(null, …) x3 as anon does not crash the backend');

select ok(has_function_privilege('anon', 'public.has_earned_milestone(uuid, text)', 'EXECUTE'),
  'R2: anon still holds EXECUTE on has_earned_milestone (never revoke — it segfaults this build)');
select ok(has_function_privilege('authenticated', 'public.is_admin(uuid)', 'EXECUTE'),
  'R2: authenticated still holds EXECUTE on is_admin (never revoke)');

-- ===========================================================================
-- ROUND 3 — the third attacker pass (migration 20260919152300).
--
-- R3 fixtures live under the 5f1a…06 / …0c1 / …a6 ids so they cannot collide
-- with the T1-T6 / R2 fixtures above, and Coach 6 is used for the DEMOTION
-- case so that demoting them cannot disturb any earlier assertion.
-- ===========================================================================
set local role postgres;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('5f1a0000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 's1-coach6@test.invalid', 'x', now(), now());

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('5f1a0000-0000-4000-8000-000000000007', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 's1-outsider@test.invalid', 'x', now(), now());

insert into public.profiles (id, role, coach_id, full_name) values
  ('5f1a0000-0000-4000-8000-000000000006', 'coach', null, 'S1 Coach Six'),
  -- Unaffiliated on purpose: no coach, no subscription, no group, no class. The earlier
  -- blocks attach fixture …01 to Dana, so …01 can no longer play the stranger here.
  ('5f1a0000-0000-4000-8000-000000000007', 'member', null, 'S1 Outsider');

insert into public.live_classes (id, coach_id, title, agora_channel_name, starts_at, status) values
  ('5f1a0000-0000-4000-8000-0000000000c6', '5f1a0000-0000-4000-8000-000000000006',
   'S1 Coach Six Class', 's1-coach6-chan', now() + interval '1 day', 'scheduled');

insert into public.recordings (id, live_class_id, uploaded_by, storage_path, status) values
  ('5f1a0000-0000-4000-8000-0000000000a6', '5f1a0000-0000-4000-8000-0000000000c6',
   '5f1a0000-0000-4000-8000-000000000006',
   '5f1a0000-0000-4000-8000-000000000006/s1/take6.mp4', 'draft');

insert into public.transcripts (id, recording_id, raw_text, provider) values
  ('5f1a0000-0000-4000-8000-0000000000a7', '5f1a0000-0000-4000-8000-0000000000a6',
   'original transcript', 'test');

-- The stored object the coach owns by uid prefix (owns_recording_object).
insert into storage.objects (id, bucket_id, name, owner)
values (gen_random_uuid(), 'recordings',
        '5f1a0000-0000-4000-8000-000000000006/s1/take6.mp4',
        '5f1a0000-0000-4000-8000-000000000006');

-- A completion Jordan owns, on a day of its own inside Dana's plan, so it cannot
-- collide with workout_completions_member_day_local_key (one row per member, per
-- day, per LOCAL date since 20260921112000) against the completions the earlier
-- blocks created.
insert into public.workout_days (id, workout_plan_id, day_number, block_name) values
  ('5f1a0000-0000-4000-8000-000000000e30', '33333333-3333-3333-3333-333333333333', 5, 'S1 R3 Day');

insert into public.workout_completions (id, member_id, workout_day_id, status, completed_at)
values ('5f1a0000-0000-4000-8000-0000000000c1', '22222222-2222-2222-2222-222222222222',
        '5f1a0000-0000-4000-8000-000000000e30', 'completed', now());


-- ---------------------------------------------------------------------------
-- R3-1 (high) — a coach cannot re-attribute a completion to ANOTHER coach's
-- member. Reproduced before the fix: Dana ran
--   update workout_completions set member_id = <Coach B's member>, effort_score = 10
-- -> UPDATE 1, the victim then saw the row and has_earned_milestone() flipped to
-- true, so the victim could mint an unearned milestone. Cross-tenant WRITE.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

select is(auth.uid(), '11111111-1111-1111-1111-111111111111'::uuid, 'R3-1 identity: auth.uid() is Dana');
select ok(public.is_coach_or_admin(), 'R3-1 identity: Dana is staff');

select throws_ok(
  $$ update public.workout_completions
        set member_id = '5f1a0000-0000-4000-8000-000000000004'
      where id = '5f1a0000-0000-4000-8000-0000000000c1' $$,
  '42501', null,
  'R3-1 coach cannot re-attribute a completion to another coach''s member');

select throws_ok(
  $$ update public.workout_completions
        set member_id = '5f1a0000-0000-4000-8000-000000000004', effort_score = 10,
            scored_by = auth.uid()
      where id = '5f1a0000-0000-4000-8000-0000000000c1' $$,
  '42501', null,
  'R3-1 the exact reproduced statement (re-attribute + score) is refused');

-- Even inside her OWN tenant a coach may not move a row between members: the
-- freeze is on the column, for every non-privileged caller.
select throws_ok(
  $$ update public.workout_completions
        set member_id = '66666666-6666-6666-6666-666666666666'
      where id = '5f1a0000-0000-4000-8000-0000000000c1' $$,
  '42501', null,
  'R3-1 the member_id freeze applies to the coach''s own tenant too');

select is(
  (select member_id from public.workout_completions where id = '5f1a0000-0000-4000-8000-0000000000c1'),
  '22222222-2222-2222-2222-222222222222'::uuid,
  'R3-1 after every attempt the completion still belongs to Jordan');

-- NOT weakened: the legitimate coach action still works.
select lives_ok(
  $$ update public.workout_completions set effort_score = 8, scored_by = auth.uid()
      where id = '5f1a0000-0000-4000-8000-0000000000c1' $$,
  'R3-1 the plan''s coach may still score her own member''s completion');

-- Belt to the trigger's braces: the policy now carries the tenancy conjunct too.
select ok(
  (select with_check from pg_policies
    where schemaname = 'public' and tablename = 'workout_completions'
      and policyname = 'workout_completions_update_member_or_coach') like '%is_coach_of_member%',
  'R3-1 the UPDATE policy''s coach branch also requires is_coach_of_member(member_id)');

-- The victim side of the reproduction: no row leaked into Coach B's tenant.
set local role authenticated;
select set_config('request.jwt.claim.sub', '5f1a0000-0000-4000-8000-000000000004', true);

-- Scoped to THIS block's fixtures: earlier blocks legitimately leave completions of
-- their own in Coach B's tenant, and other agents share this database.
select is(
  (select count(*) from public.workout_completions
    where id = '5f1a0000-0000-4000-8000-0000000000c1'),
  0::bigint,
  'R3-1 the other coach''s member cannot see the completion that was aimed at them');

select is(
  (select count(*) from public.workout_completions
    where workout_day_id = '5f1a0000-0000-4000-8000-000000000e30'),
  0::bigint,
  'R3-1 …and nothing from Dana''s day leaked into their tenant, so no milestone is earned from it');


-- ---------------------------------------------------------------------------
-- R3-2 (medium) — a DEMOTED coach loses write access to notes, transcripts and
-- their stored objects, the same way R2-6 closed it for groups.
--
-- Reproduced before the fix: after `update profiles set role='member'`,
-- is_coach_or_admin() was false yet the coach still PUBLISHED a workout_note
-- (visible to every one of that coach's members through can_read_published_notes)
-- and rewrote the transcript.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '5f1a0000-0000-4000-8000-000000000006', true);

-- FIRST prove the fixture is genuinely writable WHILE the coach is still a coach,
-- so the refusals below cannot be an artefact of a broken fixture.
select ok(public.is_coach_or_admin(), 'R3-2 before demotion: Coach Six is staff');
select ok(public.can_manage_recording('5f1a0000-0000-4000-8000-0000000000a6'),
  'R3-2 before demotion: Coach Six can manage their recording');
select lives_ok(
  $$ insert into public.workout_notes (recording_id, created_by, edited_content, published_at)
     values ('5f1a0000-0000-4000-8000-0000000000a6', auth.uid(), '{"title":"S1 R3 legitimate","items":[{"key":"a","text":"Back squat","kind":"exercise"}]}', now()) $$,
  'R3-2 before demotion: Coach Six may publish a note');
select lives_ok(
  $$ update public.transcripts set raw_text = 'legitimate edit'
      where id = '5f1a0000-0000-4000-8000-0000000000a7' $$,
  'R3-2 before demotion: Coach Six may edit the transcript');

-- Demote, exactly as an admin would.
set local role postgres;
update public.profiles set role = 'member'
 where id = '5f1a0000-0000-4000-8000-000000000006';

set local role authenticated;
select set_config('request.jwt.claim.sub', '5f1a0000-0000-4000-8000-000000000006', true);

select ok(not public.is_coach_or_admin(), 'R3-2 after demotion: Coach Six is no longer staff');
select ok(public.can_manage_recording('5f1a0000-0000-4000-8000-0000000000a6'),
  'R3-2 after demotion: ownership alone still says "manage" — which is why the role gate is needed');

select throws_ok(
  $$ insert into public.workout_notes (recording_id, created_by, edited_content, published_at)
     values ('5f1a0000-0000-4000-8000-0000000000a6', auth.uid(), '{"title":"S1 R3 published","items":[{"key":"a","text":"Back squat","kind":"exercise"}]}', now()) $$,
  '42501', null,
  'R3-2 a demoted coach cannot PUBLISH a workout_note to their former members');

select throws_ok(
  $$ insert into public.workout_notes (recording_id, created_by, edited_content)
     values ('5f1a0000-0000-4000-8000-0000000000a6', auth.uid(), '{"title":"S1 R3 draft","items":[{"key":"a","text":"Back squat","kind":"exercise"}]}') $$,
  '42501', null,
  'R3-2 a demoted coach cannot write an unpublished workout_note either');

-- UPDATE/DELETE under a USING clause that no longer matches filters the rows out
-- rather than raising, so the assertion is "nothing was written".
with u as (
  update public.transcripts set raw_text = 'REWRITTEN AFTER DEMOTION'
   where id = '5f1a0000-0000-4000-8000-0000000000a7'
  returning 1
)
select is((select count(*) from u), 0::bigint,
  'R3-2 a demoted coach cannot rewrite the transcript');

select is(
  (select raw_text from public.transcripts where id = '5f1a0000-0000-4000-8000-0000000000a7'),
  'legitimate edit',
  'R3-2 the transcript still holds the text written while they were a coach');

with d as (
  delete from public.workout_notes
   where recording_id = '5f1a0000-0000-4000-8000-0000000000a6'
  returning 1
)
select is((select count(*) from d), 0::bigint,
  'R3-2 a demoted coach cannot delete the notes they wrote as a coach');

-- storage.objects carries a STATEMENT-level trigger (storage.protect_objects_delete)
-- that raises "Direct deletion from storage tables is not allowed" for EVERY caller,
-- including one the policy would have allowed, so a real DELETE cannot distinguish the
-- two outcomes here. The policy's predicate is therefore asserted directly, together
-- with the policy text itself below.
select ok(
  public.owns_recording_object('5f1a0000-0000-4000-8000-000000000006/s1/take6.mp4'),
  'R3-2 the demoted coach still OWNS the object by uid prefix — ownership alone is not enough');

select ok(
  not (public.owns_recording_object('5f1a0000-0000-4000-8000-000000000006/s1/take6.mp4')
       and public.is_coach_or_admin()),
  'R3-2 recordings_objects_delete_own''s predicate is false for a demoted coach');

-- The three policies now carry the role gate their siblings always had.
select ok(
  (select qual from pg_policies where schemaname = 'public' and tablename = 'workout_notes'
     and policyname = 'workout_notes_write_recording_coach') like '%is_coach_or_admin%',
  'R3-2 workout_notes_write_recording_coach requires is_coach_or_admin()');
select ok(
  (select qual from pg_policies where schemaname = 'public' and tablename = 'transcripts'
     and policyname = 'transcripts_write_recording_coach') like '%is_coach_or_admin%',
  'R3-2 transcripts_write_recording_coach requires is_coach_or_admin()');
select ok(
  (select qual from pg_policies where schemaname = 'storage' and tablename = 'objects'
     and policyname = 'recordings_objects_delete_own') like '%is_coach_or_admin%',
  'R3-2 recordings_objects_delete_own requires is_coach_or_admin()');

-- Restore Coach Six so nothing below depends on the demotion.
set local role postgres;
update public.profiles set role = 'coach'
 where id = '5f1a0000-0000-4000-8000-000000000006';


-- ---------------------------------------------------------------------------
-- R3-3 (low) — is_coach_or_admin(p_uid) / is_admin(p_uid) are no longer a
-- staff-role oracle for an UNRELATED coach. The gate is now relationship-based,
-- like every other helper in the schema.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

-- Dana and Coach B share no member, group, class or plan.
select ok(not public.is_coach_or_admin('5f1a0000-0000-4000-8000-000000000003'),
  'R3-3 a coach can no longer probe an UNRELATED coach''s staff role');
select ok(not public.is_admin('5f1a0000-0000-4000-8000-000000000002'),
  'R3-3 a coach can no longer probe an UNRELATED admin''s role');
select is(
  (select count(*) from public.profiles where id = '5f1a0000-0000-4000-8000-000000000003'),
  0::bigint,
  'R3-3 …and profiles RLS hides that same uuid from her, so the helper now agrees with it');

-- Refusals are `false`, never NULL: over PostgREST null would be the same oracle
-- in a three-valued disguise.
select ok(public.is_coach_or_admin('5f1a0000-0000-4000-8000-000000000003') is not null,
  'R3-3 a refused probe answers false, not null');
select ok(public.is_admin('5f1a0000-0000-4000-8000-000000000002') is not null,
  'R3-3 a refused is_admin probe answers false, not null');

-- The zero-arg form — the only form any policy or function in the tree uses — is
-- unchanged: p_uid = auth.uid() keeps the subject's own answer truthful.
select ok(public.is_coach_or_admin(), 'R3-3 zero-arg is unchanged for a coach');
select ok(public.is_coach_or_admin('11111111-1111-1111-1111-111111111111'),
  'R3-3 a coach may still ask about herself');

-- Relationship arm: a member may ask about their own coach, and vice versa.
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select ok(public.is_coach_or_admin('11111111-1111-1111-1111-111111111111'),
  'R3-3 a member still gets a real answer about their OWN coach');
select ok(not public.is_coach_or_admin('5f1a0000-0000-4000-8000-000000000003'),
  'R3-3 a member cannot probe an unrelated coach');
select ok(not public.is_coach_or_admin(), 'R3-3 zero-arg is unchanged for a member');

-- Admin arm stays unconditional: platform administration legitimately spans tenants.
set local role authenticated;
select set_config('request.jwt.claim.sub', '5f1a0000-0000-4000-8000-000000000002', true);
select ok(public.is_coach_or_admin('5f1a0000-0000-4000-8000-000000000003'),
  'R3-3 an admin may still ask about any coach');
select ok(public.is_coach_or_admin('11111111-1111-1111-1111-111111111111'),
  'R3-3 an admin may still ask about Dana');

-- A stranger gets nothing.
set local role authenticated;
select set_config('request.jwt.claim.sub', '5f1a0000-0000-4000-8000-000000000007', true);
select ok(not public.is_coach_or_admin('11111111-1111-1111-1111-111111111111'),
  'R3-3 a stranger cannot probe Dana''s role');
select ok(not public.is_admin('5f1a0000-0000-4000-8000-000000000002'),
  'R3-3 a stranger cannot probe the admin''s role');


-- ---------------------------------------------------------------------------
-- R3-4 (medium) — public.recordings_client is the select=*-safe surface.
--
-- The suggested fix (restore the table-level SELECT grant on public.recordings)
-- was REJECTED on validation: a published recording is readable by all of that
-- coach's members, so the grant would re-open the round-1 exfil. The column list
-- stays; the view is the escape hatch.
-- ---------------------------------------------------------------------------
select has_view('public', 'recordings_client', 'R3-4 public.recordings_client exists');

select ok(
  not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'recordings_client'
       and column_name = 'storage_path'),
  'R3-4 storage_path is structurally absent from the view');

select ok(
  (select reloptions::text from pg_class
    where oid = 'public.recordings_client'::regclass) like '%security_invoker=%',
  'R3-4 the view is security_invoker, so recordings'' RLS is enforced as the caller');

select ok(
  not exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'recordings'
       and privilege_type = 'SELECT' and grantee in ('anon', 'authenticated')),
  'R3-4 the table-level SELECT grant on recordings is deliberately still absent');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select is(
  (select count(*) from public.recordings_client where id = '5f1a0000-0000-4000-8000-0000000000a1'),
  1::bigint,
  'R3-4 the owning coach reads her own recording through the view');

set local role authenticated;
select set_config('request.jwt.claim.sub', '5f1a0000-0000-4000-8000-000000000003', true);
select is(
  (select count(*) from public.recordings_client where id = '5f1a0000-0000-4000-8000-0000000000a1'),
  0::bigint,
  'R3-4 the view does NOT leak another coach''s recording (security_invoker RLS holds)');

-- 20260919154100 hardened this further: anon no longer holds SELECT on the view at all
-- (it used to hold SELECT plus the INSERT/UPDATE/DELETE that CREATE VIEW picked up from
-- Supabase's default privileges). "anon reads nothing" is now enforced by the grant, not
-- only by RLS, so assert both the privilege and the runtime refusal.
select ok(
  not has_table_privilege('anon', 'public.recordings_client', 'SELECT'),
  'R3-4 anon holds no SELECT privilege on the view (20260919154100 revoked it)');

select ok(
  not exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'recordings_client'
       and grantee in ('anon', 'authenticated')
       and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')),
  'R3-4 no client role holds a write privilege on the auto-updatable view');

select ok(
  has_table_privilege('authenticated', 'public.recordings_client', 'SELECT'),
  'R3-4 authenticated keeps SELECT on the view (RLS still decides which rows)');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$ select count(*) from public.recordings_client $$,
  '42501', null,
  'R3-4 anon reads nothing through the view: the select is refused outright');


-- ---------------------------------------------------------------------------
-- R3-5 (low) — live_class_exists lets agora-rtc-token answer 403 not_entitled
-- instead of 404 class_not_found for a class the caller's RLS hides.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '5f1a0000-0000-4000-8000-000000000007', true);

select is(
  (select count(*) from public.live_classes where id = '88888888-8888-8888-8888-888888888888'),
  0::bigint,
  'R3-5 an unaffiliated member cannot SEE Dana''s class (this is what forced the wrong 404)');

select ok(public.live_class_exists('88888888-8888-8888-8888-888888888888'),
  'R3-5 …but live_class_exists says it exists, so the function can answer 403 not_entitled');

select ok(not public.can_join_live_class('88888888-8888-8888-8888-888888888888'),
  'R3-5 the existence helper grants NOTHING: can_join_live_class still refuses');

select ok(not public.live_class_exists('5f1a0000-0000-4000-8000-0000000000ff'),
  'R3-5 a class that really does not exist still answers false (404 class_not_found)');

select ok(not public.live_class_exists(null),
  'R3-5 a null class id answers false');

-- Crash safety: this build SIGSEGVs when a role calls a SECURITY DEFINER function
-- it lacks EXECUTE on, so every new function is called three times as anon.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select lives_ok(
  $$ select public.live_class_exists('88888888-8888-8888-8888-888888888888'),
            public.live_class_exists('88888888-8888-8888-8888-888888888888'),
            public.live_class_exists('88888888-8888-8888-8888-888888888888') $$,
  'R3 crash safety: live_class_exists(uuid) x3 as anon does not crash the backend');

select ok(not public.live_class_exists('88888888-8888-8888-8888-888888888888'),
  'R3-5 anon gets false from live_class_exists (the 401 path is unaffected)');

select ok(has_function_privilege('anon', 'public.live_class_exists(uuid)', 'EXECUTE'),
  'R3-5 anon still holds EXECUTE on live_class_exists (never revoke — it segfaults this build)');
select ok(has_function_privilege('authenticated', 'public.live_class_exists(uuid)', 'EXECUTE'),
  'R3-5 authenticated still holds EXECUTE on live_class_exists');

select lives_ok(
  $$ select public.is_coach_or_admin('11111111-1111-1111-1111-111111111111'),
            public.is_coach_or_admin('11111111-1111-1111-1111-111111111111'),
            public.is_coach_or_admin('11111111-1111-1111-1111-111111111111') $$,
  'R3 crash safety: the re-created is_coach_or_admin(uuid) x3 as anon does not crash');
select lives_ok(
  $$ select public.is_admin('5f1a0000-0000-4000-8000-000000000002'),
            public.is_admin('5f1a0000-0000-4000-8000-000000000002'),
            public.is_admin('5f1a0000-0000-4000-8000-000000000002') $$,
  'R3 crash safety: the re-created is_admin(uuid) x3 as anon does not crash');
set local role postgres;

select * from finish();

rollback;
