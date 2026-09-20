-- ============================================================================
-- 02_coach_directory_notes_gating.test.sql
--
-- Regression suite for
--   supabase/migrations/20260919153000_coach_directory_and_notes_gating.sql
--
--   1. coach_profiles + its self-only RLS and its bounds
--   2. list_coaches() / get_my_coach() / choose_coach()
--   3. the ONE sanctioned hole in profiles_guard_privileged_columns
--      (is_coach_assignment_context) -- and proof that the T1/T2 escalations
--      and a direct `update profiles set coach_id = ...` are STILL refused
--   4. published notes / recordings / checklist progress behind
--      has_live_access() (active + grace read, expired + no-subscription do not)
--   5. crash safety: every new function called x3 as anon
--
-- Run with:  supabase test db supabase/tests/database/02_coach_directory_notes_gating.test.sql
-- The whole file is ONE transaction and is rolled back, so it never mutates the
-- demo seed. Fixtures use the c1b0… prefix so they cannot collide with the seed,
-- with 01_role_integrity's 5f1a… rows, or with another agent's fixtures. Every
-- assertion is about a c1b0… fixture or about a named seed row, never about a
-- global count, because other agents share this database.
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
--   Dana   11111111-…  coach, accepting            (staff: no subscription row)
--   Marcus aaaaaaaa-…  coach, accepting, 0 members
--   Jordan 22222222-…  member of Dana              subscription ACTIVE
--   Sam    66666666-…  member of Dana              subscription GRACE (past_due)
--   Riley  99999999-…  member of Dana              subscription EXPIRED
--
-- Fixtures:
--   c1b0…01  Coach A       accepting, 2 members (member_count arithmetic)
--   c1b0…02  Coach Closed  accepting_members = false
--   c1b0…03  Admin         (must never appear in the directory)
--   c1b0…04  Free Member   no coach, no subscription  (choose_coach happy path)
--   c1b0…05  Paid Stranger member of Coach A, ACTIVE  (refusals are tenancy, not money)
--   c1b0…07  NoSub Member  member of Dana, NO subscription row (state 'none')
--   c1b0…08  Coach A member #1
--   c1b0…09  Coach A member #2
--   c1b0…0a  Switcher      member of Dana, ACTIVE (switches away mid-suite)
--   c1b0…a1  recording     Dana, status 'published'
--   c1b0…b1  note          published
--   c1b0…b2  note          DRAFT (published_at null)
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('c1b00000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c1b-coacha@test.invalid',   'x', now(), now()),
  ('c1b00000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c1b-coachclosed@test.invalid','x', now(), now()),
  ('c1b00000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c1b-admin@test.invalid',    'x', now(), now()),
  ('c1b00000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c1b-free@test.invalid',     'x', now(), now()),
  ('c1b00000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c1b-stranger@test.invalid', 'x', now(), now()),
  ('c1b00000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c1b-coachempty@test.invalid','x', now(), now()),
  ('c1b00000-0000-4000-8000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c1b-nosub@test.invalid',    'x', now(), now()),
  ('c1b00000-0000-4000-8000-000000000008', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c1b-am1@test.invalid',      'x', now(), now()),
  ('c1b00000-0000-4000-8000-000000000009', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c1b-am2@test.invalid',      'x', now(), now()),
  ('c1b00000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c1b-switcher@test.invalid', 'x', now(), now());

insert into public.profiles (id, role, coach_id, full_name) values
  ('c1b00000-0000-4000-8000-000000000001', 'coach',  null,                                   'C1B Coach A'),
  ('c1b00000-0000-4000-8000-000000000002', 'coach',  null,                                   'C1B Coach Closed'),
  ('c1b00000-0000-4000-8000-000000000003', 'admin',  null,                                   'C1B Admin'),
  ('c1b00000-0000-4000-8000-000000000004', 'member', null,                                   'C1B Free Member'),
  ('c1b00000-0000-4000-8000-000000000005', 'member', 'c1b00000-0000-4000-8000-000000000001', 'C1B Paid Stranger'),
  ('c1b00000-0000-4000-8000-000000000006', 'coach',  null,                                   'C1B Coach Empty'),
  ('c1b00000-0000-4000-8000-000000000007', 'member', '11111111-1111-1111-1111-111111111111', 'C1B NoSub Member'),
  ('c1b00000-0000-4000-8000-000000000008', 'member', 'c1b00000-0000-4000-8000-000000000001', 'C1B Coach A Member 1'),
  ('c1b00000-0000-4000-8000-000000000009', 'member', 'c1b00000-0000-4000-8000-000000000001', 'C1B Coach A Member 2'),
  ('c1b00000-0000-4000-8000-00000000000a', 'member', '11111111-1111-1111-1111-111111111111', 'C1B Switcher');

insert into public.coach_profiles (coach_id, bio, specialties, accepting_members) values
  ('c1b00000-0000-4000-8000-000000000001', 'C1B Coach A bio', array['Strength','Mobility'], true),
  ('c1b00000-0000-4000-8000-000000000002', 'C1B closed books', array['Powerlifting'],       false);

-- Paying members, so every refusal below is about tenancy or entitlement by design.
insert into public.subscriptions (member_id, status, current_period_end) values
  ('c1b00000-0000-4000-8000-000000000005', 'active', now() + interval '30 days'),
  ('c1b00000-0000-4000-8000-00000000000a', 'active', now() + interval '30 days');

-- Dana's published recording, one published note and one draft note.
insert into public.recordings (id, uploaded_by, storage_path, status) values
  ('c1b00000-0000-4000-8000-0000000000a1',
   '11111111-1111-1111-1111-111111111111',
   '11111111-1111-1111-1111-111111111111/c1b-session.m4a',
   'published');

insert into public.workout_notes (id, recording_id, created_by, edited_content, published_at) values
  ('c1b00000-0000-4000-8000-0000000000b1',
   'c1b00000-0000-4000-8000-0000000000a1',
   '11111111-1111-1111-1111-111111111111',
   '{"title":"C1B Session","items":[{"key":"warmup","text":"Row 500m easy","kind":"note"}]}',
   now()),
  ('c1b00000-0000-4000-8000-0000000000b2',
   'c1b00000-0000-4000-8000-0000000000a1',
   '11111111-1111-1111-1111-111111111111',
   '{"title":"C1B Draft","items":[{"key":"squat","text":"Back squat","kind":"exercise"}]}',
   null);

-- A tick Riley (expired) recorded while still paying: SELECT of it must survive.
insert into public.workout_note_progress (member_id, note_id, item_key) values
  ('99999999-9999-9999-9999-999999999999', 'c1b00000-0000-4000-8000-0000000000b1', 'warmup');

-- ===========================================================================
-- A. coach_profiles: shape, bounds, and the directory never leaks email
-- ===========================================================================

select has_table('public', 'coach_profiles', 'A coach_profiles exists');
select col_is_pk('public', 'coach_profiles', 'coach_id', 'A coach_profiles.coach_id is the primary key');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.coach_profiles'::regclass),
  'A coach_profiles has RLS enabled');

select throws_ok(
  $$ insert into public.coach_profiles (coach_id, bio)
     values ('c1b00000-0000-4000-8000-000000000003', repeat('x', 501)) $$,
  '23514', null,
  'A bio longer than 500 characters is refused by coach_profiles_bio_bounds');

select lives_ok(
  $$ insert into public.coach_profiles (coach_id, bio)
     values ('c1b00000-0000-4000-8000-000000000003', repeat('x', 500))
     on conflict (coach_id) do update set bio = excluded.bio $$,
  'A a bio of exactly 500 characters is accepted');

select throws_ok(
  $$ update public.coach_profiles
        set specialties = array['a','b','c','d','e','f','g','h','i']
      where coach_id = 'c1b00000-0000-4000-8000-000000000001' $$,
  '23514', null,
  'A more than 8 specialties is refused');

select throws_ok(
  $$ update public.coach_profiles
        set specialties = array[repeat('y', 31)]
      where coach_id = 'c1b00000-0000-4000-8000-000000000001' $$,
  '23514', null,
  'A a specialty longer than 30 characters is refused');

select lives_ok(
  $$ update public.coach_profiles
        set specialties = array[repeat('y', 30),'b','c','d','e','f','g','h']
      where coach_id = 'c1b00000-0000-4000-8000-000000000001' $$,
  'A exactly 8 specialties of exactly 30 characters are accepted');

select lives_ok(
  $$ update public.coach_profiles set specialties = '{}'::text[]
      where coach_id = 'c1b00000-0000-4000-8000-000000000001' $$,
  'A the empty specialties array (the column default) is accepted');

-- Restore Coach A's specialties for the directory assertions below.
update public.coach_profiles
   set specialties = array['Strength','Mobility']
 where coach_id = 'c1b00000-0000-4000-8000-000000000001';

-- Neither RPC may ever project profiles.email or any other private column.
select ok(
  pg_get_function_result('public.list_coaches()'::regprocedure) not like '%email%',
  'A list_coaches() does not return an email column');
select ok(
  pg_get_function_result('public.get_my_coach()'::regprocedure) not like '%email%',
  'A get_my_coach() does not return an email column');
select is(
  pg_get_function_result('public.list_coaches()'::regprocedure),
  'TABLE(coach_id uuid, full_name text, bio text, specialties text[], accepting_members boolean, member_count integer)',
  'A list_coaches() projects exactly the six directory columns');
select is(
  pg_get_function_result('public.get_my_coach()'::regprocedure),
  'TABLE(coach_id uuid, full_name text, bio text, specialties text[], accepting_members boolean)',
  'A get_my_coach() projects exactly the five directory columns');

-- ===========================================================================
-- B. coach_profiles RLS: a coach/admin owns exactly one row -- their own
-- ===========================================================================

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1b00000-0000-4000-8000-000000000001', true);
select is(current_user::text, 'authenticated', 'B identity: current_user is authenticated');
select is(auth.uid(), 'c1b00000-0000-4000-8000-000000000001'::uuid, 'B identity: auth.uid() is Coach A');

select is(
  (select count(*) from public.coach_profiles)::int, 1,
  'B a coach sees exactly one coach_profiles row: their own');
select is(
  (select coach_id from public.coach_profiles),
  'c1b00000-0000-4000-8000-000000000001'::uuid,
  'B ... and it is their own row');
select is(
  (select count(*) from public.coach_profiles
    where coach_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')::int, 0,
  'B a coach cannot read another coach''s directory row');

select lives_ok(
  $$ update public.coach_profiles set bio = 'C1B Coach A edited'
      where coach_id = 'c1b00000-0000-4000-8000-000000000001' $$,
  'B a coach may edit their own directory row');
select is(
  (select bio from public.coach_profiles where coach_id = 'c1b00000-0000-4000-8000-000000000001'),
  'C1B Coach A edited',
  'B ... and the edit lands');

-- Another coach's row is invisible, so an UPDATE aimed at it matches nothing.
-- (A data-modifying CTE may not sit inside a scalar subquery, so the statement runs on
-- its own and the superuser re-reads the target row as the oracle.)
select lives_ok(
  $$ update public.coach_profiles set bio = 'hijacked'
      where coach_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'B an UPDATE aimed at another coach''s directory row raises nothing (RLS matches none)');
reset role;
select isnt(
  (select bio from public.coach_profiles
    where coach_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'hijacked',
  'B a coach cannot UPDATE another coach''s directory row');
set local role authenticated;

select throws_ok(
  $$ insert into public.coach_profiles (coach_id, bio)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'impersonation') $$,
  '42501', null,
  'B a coach cannot INSERT a directory row for another coach');

-- Members are given nothing on the table itself; they use the RPCs.
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select is(
  (select count(*) from public.coach_profiles)::int, 0,
  'B a member reads zero rows from coach_profiles directly');
select throws_ok(
  $$ insert into public.coach_profiles (coach_id, bio)
     values ('22222222-2222-2222-2222-222222222222', 'I am a coach now') $$,
  '42501', null,
  'B a member cannot INSERT themselves a directory row');

-- SET LOCAL role does NOT clear the JWT GUC, and auth.uid() reads only that GUC — so a
-- bare `set local role anon` would still look signed-in. Clear the claim as well.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is(
  (select count(*) from public.coach_profiles)::int, 0,
  'B anon reads zero rows from coach_profiles');

-- ===========================================================================
-- C. list_coaches()
-- ===========================================================================

set local role authenticated;

-- Jordan (member, active)
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select is(
  (select count(*) from public.list_coaches()
    where coach_id = '11111111-1111-1111-1111-111111111111')::int, 1,
  'C Jordan sees Dana in the directory');
select is(
  (select count(*) from public.list_coaches()
    where coach_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')::int, 1,
  'C Jordan sees Marcus in the directory');
select is(
  (select count(*) from public.list_coaches()
    where coach_id = 'c1b00000-0000-4000-8000-000000000003')::int, 0,
  'C admins are never listed as coaches');
select is(
  (select count(*) from public.list_coaches()
    where coach_id = '22222222-2222-2222-2222-222222222222')::int, 0,
  'C members are never listed as coaches');

-- Coach A's members: Paid Stranger (…05), Coach A Member 1 (…08), Coach A Member 2 (…09).
select is(
  (select member_count from public.list_coaches()
    where coach_id = 'c1b00000-0000-4000-8000-000000000001'), 3,
  'C member_count counts exactly that coach''s members');
-- Asserted about a fixture coach, not about seed Marcus: other agents share this
-- database and any of them may hand Marcus a member mid-run.
select is(
  (select member_count from public.list_coaches()
    where coach_id = 'c1b00000-0000-4000-8000-000000000006'), 0,
  'C a coach with no members reports member_count 0');
-- Coach Empty has no coach_profiles row at all: the left join must still list them.
select is(
  (select specialties from public.list_coaches()
    where coach_id = 'c1b00000-0000-4000-8000-000000000006'), '{}'::text[],
  'C a coach with no directory row is listed with empty specialties');
select ok(
  (select accepting_members from public.list_coaches()
    where coach_id = 'c1b00000-0000-4000-8000-000000000006'),
  'C ... and defaults to accepting_members = true');
-- The oracle must be read with RLS off: as a member, `select … from profiles` only
-- returns the caller's own row, so comparing against it would compare 4 with 1.
select set_config(
  'app.c1b_dana_members',
  (select member_count from public.list_coaches()
    where coach_id = '11111111-1111-1111-1111-111111111111')::text,
  true);
reset role;
select is(
  current_setting('app.c1b_dana_members')::integer,
  (select count(*)::integer from public.profiles p
    where p.coach_id = '11111111-1111-1111-1111-111111111111' and p.role = 'member'),
  'C Dana''s member_count matches the profiles table');
set local role authenticated;

select is(
  (select bio from public.list_coaches()
    where coach_id = 'c1b00000-0000-4000-8000-000000000001'),
  'C1B Coach A edited',
  'C the coach''s own bio is what members see');
select ok(
  (select accepting_members from public.list_coaches()
    where coach_id = 'c1b00000-0000-4000-8000-000000000002') is false,
  'C a coach with closed books is still listed, flagged not accepting');
select ok(
  (select count(*) from public.list_coaches()) >= 4,
  'C the directory holds at least the four known coaches');

-- Ordering is by full_name.
-- lag() over () walks the rows in the order list_coaches() emitted them; a window
-- function may not appear inside another window's definition, hence the plain frame.
select ok(
  coalesce(
    (select bool_and(full_name >= prev)
       from (select full_name, lag(full_name) over () as prev from public.list_coaches()) s
      where prev is not null),
    true),
  'C the directory is ordered by full_name');

-- Sam (grace), Riley (expired), a member with no coach, a coach, an admin and a
-- stranger all get the directory: picking a coach must never be paywalled.
select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', true);
select ok((select count(*) from public.list_coaches()) >= 4, 'C Sam (grace) sees the directory');
select set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
select ok((select count(*) from public.list_coaches()) >= 4, 'C Riley (expired) sees the directory');
select set_config('request.jwt.claim.sub', 'c1b00000-0000-4000-8000-000000000004', true);
select ok((select count(*) from public.list_coaches()) >= 4, 'C a member with no coach sees the directory');
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select ok((select count(*) from public.list_coaches()) >= 4, 'C a coach sees the directory');
select set_config('request.jwt.claim.sub', 'c1b00000-0000-4000-8000-000000000003', true);
select ok((select count(*) from public.list_coaches()) >= 4, 'C an admin sees the directory');

-- A signed-in user with NO profile row at all.
select set_config('request.jwt.claim.sub', 'c1b00000-0000-4000-8000-0000000000ff', true);
select lives_ok(
  $$ select * from public.list_coaches() $$,
  'C a JWT with no profile row does not error');

-- SET LOCAL role does NOT clear the JWT GUC, and auth.uid() reads only that GUC — so a
-- bare `set local role anon` would still look signed-in. Clear the claim as well.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is((select count(*) from public.list_coaches())::int, 0, 'C anon gets an empty directory');

-- ===========================================================================
-- D. get_my_coach()
-- ===========================================================================

set local role authenticated;

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select is((select count(*) from public.get_my_coach())::int, 1, 'D Jordan has one coach row');
select is(
  (select coach_id from public.get_my_coach()),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'D ... and it is Dana');
select is(
  (select full_name from public.get_my_coach()), 'Coach Dana Reyes',
  'D get_my_coach projects the coach''s name, which profiles RLS hides from a member');
select is(
  (select count(*) from public.profiles
    where id = '11111111-1111-1111-1111-111111111111')::int, 0,
  'D ... and the member still cannot read that profiles row directly');

select set_config('request.jwt.claim.sub', 'c1b00000-0000-4000-8000-000000000004', true);
select is((select count(*) from public.get_my_coach())::int, 0,
  'D a member with no coach gets zero rows, not an error');

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select is((select count(*) from public.get_my_coach())::int, 0,
  'D a coach has no coach of their own');

-- SET LOCAL role does NOT clear the JWT GUC, and auth.uid() reads only that GUC — so a
-- bare `set local role anon` would still look signed-in. Clear the claim as well.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is((select count(*) from public.get_my_coach())::int, 0, 'D anon gets zero rows');

-- ===========================================================================
-- E. choose_coach() -- the happy paths
-- ===========================================================================

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1b00000-0000-4000-8000-000000000004', true);

select lives_ok(
  $$ select public.choose_coach('11111111-1111-1111-1111-111111111111') $$,
  'E a member with no coach picks Dana');
select is(
  (select coach_id from public.get_my_coach()),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'E ... and get_my_coach now reports Dana');

select lives_ok(
  $$ select public.choose_coach('11111111-1111-1111-1111-111111111111') $$,
  'E re-picking the CURRENT coach is an idempotent no-op success');

select lives_ok(
  $$ select public.choose_coach('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
  'E switching to Marcus later is allowed');
select is(
  (select coach_id from public.get_my_coach()),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'E ... and the switch lands');

-- The assignment window is closed again the moment choose_coach returns.
select throws_ok(
  $$ update public.profiles
        set coach_id = '11111111-1111-1111-1111-111111111111'
      where id = 'c1b00000-0000-4000-8000-000000000004' $$,
  '42501', null,
  'E the app.coach_choice_member window is cleared: a direct coach_id UPDATE in the SAME transaction is still refused');

-- ===========================================================================
-- F. choose_coach() -- every refusal, with the machine-readable message the
--    TypeScript client (mapChooseCoachError) switches on
-- ===========================================================================

select set_config('request.jwt.claim.sub', 'c1b00000-0000-4000-8000-000000000004', true);

select throws_ok(
  $$ select public.choose_coach('c1b00000-0000-4000-8000-000000000004') $$,
  'P0001', 'coach_not_found', 'F picking YOURSELF is coach_not_found');
select throws_ok(
  $$ select public.choose_coach('22222222-2222-2222-2222-222222222222') $$,
  'P0001', 'coach_not_found', 'F picking another MEMBER is coach_not_found');
select throws_ok(
  $$ select public.choose_coach('c1b00000-0000-4000-8000-000000000003') $$,
  'P0001', 'coach_not_found', 'F picking an ADMIN is coach_not_found');
select throws_ok(
  $$ select public.choose_coach('c1b00000-0000-4000-8000-0000000000fe') $$,
  'P0001', 'coach_not_found', 'F picking a random uuid is coach_not_found');
select throws_ok(
  $$ select public.choose_coach(null) $$,
  'P0001', 'coach_not_found', 'F picking NULL is coach_not_found');
select throws_ok(
  $$ select public.choose_coach('c1b00000-0000-4000-8000-000000000002') $$,
  'P0001', 'coach_not_accepting', 'F a coach with closed books is coach_not_accepting');

select is(
  (select coach_id from public.get_my_coach()),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'F after every refusal the member still has the coach they had');

-- Coaches and admins are not members and cannot be coached.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select throws_ok(
  $$ select public.choose_coach('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
  'P0001', 'not_a_member', 'F a COACH caller is not_a_member');
select set_config('request.jwt.claim.sub', 'c1b00000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$ select public.choose_coach('11111111-1111-1111-1111-111111111111') $$,
  'P0001', 'not_a_member', 'F an ADMIN caller is not_a_member');
select set_config('request.jwt.claim.sub', 'c1b00000-0000-4000-8000-0000000000ff', true);
select throws_ok(
  $$ select public.choose_coach('11111111-1111-1111-1111-111111111111') $$,
  'P0001', 'not_a_member', 'F a JWT with no profile row is not_a_member');

-- SET LOCAL role does NOT clear the JWT GUC, and auth.uid() reads only that GUC — so a
-- bare `set local role anon` would still look signed-in. Clear the claim as well.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$ select public.choose_coach('11111111-1111-1111-1111-111111111111') $$,
  'P0001', 'not_authenticated', 'F anon is not_authenticated');

-- ===========================================================================
-- G. The profiles guard still holds: T1/T2 escalations stay blocked
-- ===========================================================================

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

select throws_ok(
  $$ update public.profiles set coach_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      where id = '22222222-2222-2222-2222-222222222222' $$,
  '42501', null,
  'G T2 a member STILL cannot re-parent themselves with a direct UPDATE');
select throws_ok(
  $$ update public.profiles set coach_id = null
      where id = '22222222-2222-2222-2222-222222222222' $$,
  '42501', null,
  'G T2 a member STILL cannot detach themselves from their coach');
select throws_ok(
  $$ update public.profiles set coach_id = '22222222-2222-2222-2222-222222222222'
      where id = '22222222-2222-2222-2222-222222222222' $$,
  '42501', null,
  'G T2 a member STILL cannot make themselves their own coach');
select throws_ok(
  $$ update public.profiles set role = 'admin'
      where id = '22222222-2222-2222-2222-222222222222' $$,
  '42501', null,
  'G T1 a member STILL cannot promote themselves to admin');
select throws_ok(
  $$ update public.profiles set role = 'coach'
      where id = '22222222-2222-2222-2222-222222222222' $$,
  '42501', null,
  'G T1 a member STILL cannot promote themselves to coach');
select throws_ok(
  $$ update public.profiles set coach_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '42501', null,
  'G T2 a bulk coach_id UPDATE is refused');
select throws_ok(
  $$ insert into public.profiles (id, role, full_name)
     values ('22222222-2222-2222-2222-222222222222', 'member', 'Jordan Lee')
     on conflict (id) do update set coach_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '42501', null,
  'G T2 upsert ON CONFLICT DO UPDATE SET coach_id is refused by the guard trigger');

-- Forging the GUC by hand gets a client nowhere: current_user is 'authenticated'.
select ok(
  not public.is_coach_assignment_context('22222222-2222-2222-2222-222222222222'),
  'G is_coach_assignment_context is false for a plain authenticated caller');
select set_config('app.coach_choice_member', '22222222-2222-2222-2222-222222222222', true);
select ok(
  not public.is_coach_assignment_context('22222222-2222-2222-2222-222222222222'),
  'G ... and still false when the caller sets the GUC themselves');
select throws_ok(
  $$ update public.profiles set coach_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      where id = '22222222-2222-2222-2222-222222222222' $$,
  '42501', null,
  'G ... so a hand-set GUC does NOT open the coach_id freeze');
select set_config('app.coach_choice_member', '', true);

-- Another member's row stays untouchable, and benign self-edits still work.
select lives_ok(
  $$ update public.profiles set full_name = 'pwned'
      where id = '66666666-6666-6666-6666-666666666666' $$,
  'G an UPDATE aimed at another member''s profile raises nothing (RLS matches none)');
reset role;
select isnt(
  (select full_name from public.profiles where id = '66666666-6666-6666-6666-666666666666'),
  'pwned',
  'G a member cannot UPDATE another member''s profile at all');
set local role authenticated;
select lives_ok(
  $$ update public.profiles set full_name = 'Jordan Lee'
      where id = '22222222-2222-2222-2222-222222222222' $$,
  'G a member may still edit their own full_name');
select is(
  (select coach_id from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'G after every attempt Jordan is still coached by Dana');

-- ===========================================================================
-- H. Published notes / recordings are behind has_live_access()
-- ===========================================================================

-- Jordan: ACTIVE -> reads
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select ok(public.has_live_access(auth.uid()), 'H Jordan (active) has live access');
select is(
  (select count(*) from public.workout_notes
    where id = 'c1b00000-0000-4000-8000-0000000000b1')::int, 1,
  'H Jordan (active) reads Dana''s published note');
select is(
  (select count(*) from public.recordings
    where id = 'c1b00000-0000-4000-8000-0000000000a1')::int, 1,
  'H Jordan (active) reads the published recording row');
select is(
  (select count(*) from public.workout_notes
    where id = 'c1b00000-0000-4000-8000-0000000000b2')::int, 0,
  'H ... but never the DRAFT note');

-- Sam: GRACE -> reads
select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', true);
select ok(public.has_live_access(auth.uid()), 'H Sam (grace) has live access');
select is(
  (select count(*) from public.workout_notes
    where id = 'c1b00000-0000-4000-8000-0000000000b1')::int, 1,
  'H Sam (grace) reads Dana''s published note');
select is(
  (select count(*) from public.recordings
    where id = 'c1b00000-0000-4000-8000-0000000000a1')::int, 1,
  'H Sam (grace) reads the published recording row');

-- Riley: EXPIRED -> blocked, silently (0 rows, not an error)
select set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
select ok(not public.has_live_access(auth.uid()), 'H Riley (expired) has no live access');
select is(
  (select count(*) from public.workout_notes
    where id = 'c1b00000-0000-4000-8000-0000000000b1')::int, 0,
  'H Riley (expired) reads ZERO notes -- 0 rows, not an error');
select is(
  (select count(*) from public.recordings
    where id = 'c1b00000-0000-4000-8000-0000000000a1')::int, 0,
  'H Riley (expired) cannot see the recording row or its storage_path');
select ok(
  not public.can_read_published_notes('c1b00000-0000-4000-8000-0000000000a1'),
  'H can_read_published_notes is false for Riley');
select ok(
  not public.can_read_workout_note('c1b00000-0000-4000-8000-0000000000b1'),
  'H can_read_workout_note is false for Riley');

-- A member of Dana with NO subscription row at all (state 'none')
select set_config('request.jwt.claim.sub', 'c1b00000-0000-4000-8000-000000000007', true);
select ok(not public.has_live_access(auth.uid()), 'H a member with no subscription row has no live access');
select is(
  (select count(*) from public.workout_notes
    where id = 'c1b00000-0000-4000-8000-0000000000b1')::int, 0,
  'H a member with no subscription reads ZERO notes');
select is(
  (select count(*) from public.recordings
    where id = 'c1b00000-0000-4000-8000-0000000000a1')::int, 0,
  'H ... and zero recordings');

-- Dana: the owning coach reads AND edits, subscription or not
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select ok(public.has_live_access(auth.uid()), 'H Dana is staff, so has_live_access is true without a subscription');
select is(
  (select count(*) from public.workout_notes
    where recording_id = 'c1b00000-0000-4000-8000-0000000000a1')::int, 2,
  'H Dana reads BOTH her notes, published and draft');
select lives_ok(
  $$ update public.workout_notes
        set edited_content = '{"title":"C1B Session","items":[{"key":"warmup","text":"Row 750m easy","kind":"note"}]}'
      where id = 'c1b00000-0000-4000-8000-0000000000b1' $$,
  'H Dana may still edit her published note');
select is(
  (select count(*) from public.recordings
    where id = 'c1b00000-0000-4000-8000-0000000000a1')::int, 1,
  'H Dana reads her recording row');

-- Marcus: another coach, paid up, sees nothing of Dana's
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
select is(
  (select count(*) from public.workout_notes
    where recording_id = 'c1b00000-0000-4000-8000-0000000000a1')::int, 0,
  'H Marcus (another coach) sees none of Dana''s notes');
select is(
  (select count(*) from public.recordings
    where id = 'c1b00000-0000-4000-8000-0000000000a1')::int, 0,
  'H Marcus sees none of Dana''s recordings');

-- A paying member of another coach sees nothing either: entitlement is not tenancy
select set_config('request.jwt.claim.sub', 'c1b00000-0000-4000-8000-000000000005', true);
select ok(public.has_live_access(auth.uid()), 'H the stranger is fully paid up');
select is(
  (select count(*) from public.workout_notes
    where id = 'c1b00000-0000-4000-8000-0000000000b1')::int, 0,
  'H ... and still sees zero of Dana''s notes (wrong coach)');

-- SET LOCAL role does NOT clear the JWT GUC, and auth.uid() reads only that GUC — so a
-- bare `set local role anon` would still look signed-in. Clear the claim as well.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is(
  (select count(*) from public.workout_notes
    where id = 'c1b00000-0000-4000-8000-0000000000b1')::int, 0,
  'H anon sees zero notes');
select is(
  (select count(*) from public.recordings
    where id = 'c1b00000-0000-4000-8000-0000000000a1')::int, 0,
  'H anon sees zero recordings');

-- ===========================================================================
-- I. workout_note_progress: writes need live access, reading your own does not
-- ===========================================================================

set local role authenticated;

-- Jordan (active) may tick, edit and untick
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select lives_ok(
  $$ insert into public.workout_note_progress (member_id, note_id, item_key)
     values ('22222222-2222-2222-2222-222222222222',
             'c1b00000-0000-4000-8000-0000000000b1', 'warmup') $$,
  'I Jordan (active) may tick a checklist item');
select lives_ok(
  $$ update public.workout_note_progress
        set checked_at = timestamptz '2026-01-02 03:04:05+00'
      where member_id = '22222222-2222-2222-2222-222222222222'
        and note_id = 'c1b00000-0000-4000-8000-0000000000b1' $$,
  'I Jordan (active) may update their tick');
select is(
  (select checked_at from public.workout_note_progress
    where member_id = '22222222-2222-2222-2222-222222222222'
      and note_id = 'c1b00000-0000-4000-8000-0000000000b1'),
  timestamptz '2026-01-02 03:04:05+00',
  'I ... and the update actually lands on the row');

-- Sam (grace) may tick too: grace is full access
select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', true);
select lives_ok(
  $$ insert into public.workout_note_progress (member_id, note_id, item_key)
     values ('66666666-6666-6666-6666-666666666666',
             'c1b00000-0000-4000-8000-0000000000b1', 'warmup') $$,
  'I Sam (grace) may tick a checklist item');

-- Riley (expired): writes refused, but their existing ticks stay readable
select set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
select throws_ok(
  $$ insert into public.workout_note_progress (member_id, note_id, item_key)
     values ('99999999-9999-9999-9999-999999999999',
             'c1b00000-0000-4000-8000-0000000000b1', 'cooldown') $$,
  '42501', null,
  'I Riley (expired) may NOT tick a checklist item');
select is(
  (select count(*) from public.workout_note_progress
    where member_id = '99999999-9999-9999-9999-999999999999'
      and note_id = 'c1b00000-0000-4000-8000-0000000000b1')::int, 1,
  'I Riley (expired) can still READ the tick they made while paying');
select lives_ok(
  $$ update public.workout_note_progress set item_key = 'moved'
      where member_id = '99999999-9999-9999-9999-999999999999' $$,
  'I Riley (expired): the UPDATE raises nothing (the USING clause matches no rows)');
select is(
  (select count(*) from public.workout_note_progress
    where member_id = '99999999-9999-9999-9999-999999999999'
      and item_key = 'moved')::int, 0,
  'I Riley (expired) may NOT update their own progress');
select lives_ok(
  $$ delete from public.workout_note_progress
      where member_id = '99999999-9999-9999-9999-999999999999' $$,
  'I Riley (expired): the DELETE raises nothing (the USING clause matches no rows)');
select is(
  (select count(*) from public.workout_note_progress
    where member_id = '99999999-9999-9999-9999-999999999999')::int, 1,
  'I Riley (expired) may NOT delete their own progress');

-- A member with no subscription row is refused the same way
select set_config('request.jwt.claim.sub', 'c1b00000-0000-4000-8000-000000000007', true);
select throws_ok(
  $$ insert into public.workout_note_progress (member_id, note_id, item_key)
     values ('c1b00000-0000-4000-8000-000000000007',
             'c1b00000-0000-4000-8000-0000000000b1', 'warmup') $$,
  '42501', null,
  'I a member with no subscription may NOT tick a checklist item');

-- Nobody may park progress on somebody else's id
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select throws_ok(
  $$ insert into public.workout_note_progress (member_id, note_id, item_key)
     values ('66666666-6666-6666-6666-666666666666',
             'c1b00000-0000-4000-8000-0000000000b1', 'forged') $$,
  '42501', null,
  'I a member may not write progress under another member''s id');

-- ===========================================================================
-- J. Switching coach revokes access to the old coach's notes
-- ===========================================================================

select set_config('request.jwt.claim.sub', 'c1b00000-0000-4000-8000-00000000000a', true);
select is(
  (select count(*) from public.workout_notes
    where id = 'c1b00000-0000-4000-8000-0000000000b1')::int, 1,
  'J the switcher (Dana''s member, active) reads Dana''s published note');

select lives_ok(
  $$ select public.choose_coach('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
  'J the switcher moves to Marcus');

select is(
  (select count(*) from public.workout_notes
    where id = 'c1b00000-0000-4000-8000-0000000000b1')::int, 0,
  'J ... and immediately loses access to Dana''s note');
select is(
  (select count(*) from public.recordings
    where id = 'c1b00000-0000-4000-8000-0000000000a1')::int, 0,
  'J ... and to Dana''s recording');
select throws_ok(
  $$ insert into public.workout_note_progress (member_id, note_id, item_key)
     values ('c1b00000-0000-4000-8000-00000000000a',
             'c1b00000-0000-4000-8000-0000000000b1', 'warmup') $$,
  '42501', null,
  'J ... and may no longer tick items on it');

-- ===========================================================================
-- K. Crash safety -- every new/replaced function, x3, as anon and as a member
-- (common.md: a role calling a SECURITY DEFINER function it lacks EXECUTE on
--  segfaults this Postgres build, so these must return, not crash)
-- ===========================================================================

-- SET LOCAL role does NOT clear the JWT GUC, and auth.uid() reads only that GUC — so a
-- bare `set local role anon` would still look signed-in. Clear the claim as well.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select lives_ok(
  $$ select count(*) from (
       select * from public.list_coaches()
       union all select * from public.list_coaches()
       union all select * from public.list_coaches()) s $$,
  'K list_coaches() x3 as anon does not crash');
select lives_ok(
  $$ select count(*) from (
       select * from public.get_my_coach()
       union all select * from public.get_my_coach()
       union all select * from public.get_my_coach()) s $$,
  'K get_my_coach() x3 as anon does not crash');
select lives_ok(
  $$ select public.is_coach_assignment_context('11111111-1111-1111-1111-111111111111'),
            public.is_coach_assignment_context('11111111-1111-1111-1111-111111111111'),
            public.is_coach_assignment_context('11111111-1111-1111-1111-111111111111') $$,
  'K is_coach_assignment_context() x3 as anon does not crash');
select lives_ok(
  $$ select public.is_valid_specialties(array['a']),
            public.is_valid_specialties(array['a']),
            public.is_valid_specialties(array['a']) $$,
  'K is_valid_specialties() x3 as anon does not crash');
select lives_ok(
  $$ select public.can_read_published_notes('c1b00000-0000-4000-8000-0000000000a1'),
            public.can_read_published_notes('c1b00000-0000-4000-8000-0000000000a1'),
            public.can_read_published_notes('c1b00000-0000-4000-8000-0000000000a1') $$,
  'K can_read_published_notes() x3 as anon does not crash');
select lives_ok(
  $$ select public.can_read_workout_note('c1b00000-0000-4000-8000-0000000000b1'),
            public.can_read_workout_note('c1b00000-0000-4000-8000-0000000000b1'),
            public.can_read_workout_note('c1b00000-0000-4000-8000-0000000000b1') $$,
  'K can_read_workout_note() x3 as anon does not crash');
-- choose_coach raises by design for anon; the point is that it RAISES rather than crashes.
select throws_ok(
  $$ select public.choose_coach('11111111-1111-1111-1111-111111111111') $$,
  'P0001', 'not_authenticated', 'K choose_coach() as anon raises cleanly (call 1 of 3)');
select throws_ok(
  $$ select public.choose_coach('11111111-1111-1111-1111-111111111111') $$,
  'P0001', 'not_authenticated', 'K choose_coach() as anon raises cleanly (call 2 of 3)');
select throws_ok(
  $$ select public.choose_coach('11111111-1111-1111-1111-111111111111') $$,
  'P0001', 'not_authenticated', 'K choose_coach() as anon raises cleanly (call 3 of 3)');

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select lives_ok(
  $$ select count(*) from (
       select * from public.list_coaches()
       union all select * from public.list_coaches()
       union all select * from public.list_coaches()) s $$,
  'K list_coaches() x3 as a member does not crash');

set local role postgres;

select * from finish();

rollback;
