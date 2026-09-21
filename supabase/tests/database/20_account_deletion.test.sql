-- ============================================================================
-- 20_account_deletion.test.sql
--
-- The SQL half of in-app account deletion (Apple guideline 5.1.1(v)):
--   supabase/migrations/20260919154000_account_deletion.sql
--   supabase/functions/delete-account/
--
-- The Edge Function deletes an account with ONE statement — auth.admin.deleteUser
-- is a `delete from auth.users` — so every table has to give up the user's rows
-- through foreign keys. This suite proves that, and proves it GENERICALLY: the
-- completeness check is catalog-driven (every uuid column of every table in
-- public and storage), so a table added next week is covered without editing
-- this file, and a future migration that re-points an FK at `restrict` fails
-- here instead of in production.
--
-- What is asserted
--   A. no FK into auth.users / public.profiles can BLOCK a delete
--   B. groups.created_by really is ON DELETE CASCADE (the one FK 154000 changed)
--   C. deleting a MEMBER leaves zero references to their uuid, anywhere
--   D. deleting a COACH leaves zero references to their uuid in public.*, their
--      members survive with coach_id null, and the groups they created are gone
--   E. an unrelated coach + member are untouched by both deletes
--   F. storage.objects is NOT reachable by any cascade — which is exactly why
--      delete-account removes the `<uid>/` prefix through the Storage API first
--   G. profiles still has no DELETE policy: a client cannot delete a profile row
--      directly, only the service role via the Edge Function can
--   H. the guards 154000 leans on are intact and the new trigger is crash-safe
--   I. the delete run the way GoTrue runs it — with is_privileged_writer() FALSE,
--      which is the ONLY way the coach-with-a-scored-effort failure shows up.
--      C and D delete as postgres and can never catch it.
--
-- Run with:  supabase test db supabase/tests/database/20_account_deletion.test.sql
-- The whole file is ONE transaction and is rolled back, so it never mutates the
-- demo seed and leaves no fixtures. Fixtures use the ad00… prefix so they cannot
-- collide with the seed, with 01's 5f1a… rows, with 02's c1b0… rows, or with
-- another agent's. Every assertion is about an ad00… fixture or about the
-- catalog, never about a global row count, because other agents share this
-- database.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select no_plan();

-- ---------------------------------------------------------------------------
-- The generic completeness check.
--
-- ref_report() walks pg_attribute for every uuid column of every ordinary table
-- in public and storage, counts rows holding p_uid, and returns them as a sorted
-- text list — '' when the user is referenced nowhere. storage.objects.owner_id
-- is text rather than uuid, so it is checked explicitly; it is the only
-- non-uuid column in the system that holds a user id.
--
-- Returning a LIST rather than a count means a failure names the exact column
-- that still points at the deleted account.
-- ---------------------------------------------------------------------------
create function pg_temp.ref_report(p_uid uuid, p_schemas text[] default array['public','storage'])
returns text language plpgsql as $fn$
declare r record; c bigint; out_list text[] := '{}';
begin
  for r in
    select n.nspname as sch, c.relname as tbl, a.attname as col
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_type t on t.oid = a.atttypid
    where n.nspname = any (p_schemas)
      and c.relkind = 'r'
      and a.attnum > 0 and not a.attisdropped
      and t.typname = 'uuid'
    order by 1, 2, 3
  loop
    execute format('select count(*) from %I.%I where %I = $1', r.sch, r.tbl, r.col)
      into c using p_uid;
    if c > 0 then
      out_list := out_list || format('%s.%s.%s=%s', r.sch, r.tbl, r.col, c);
    end if;
  end loop;

  if 'storage' = any (p_schemas) then
    execute 'select count(*) from storage.objects where owner_id = $1' into c using p_uid::text;
    if c > 0 then out_list := out_list || format('storage.objects.owner_id=%s', c); end if;
  end if;

  return array_to_string(out_list, ', ');
end $fn$;

-- ---------------------------------------------------------------------------
-- A. Nothing can block the delete.
-- ---------------------------------------------------------------------------
select is(
  (select coalesce(string_agg(con.conrelid::regclass::text || '.' || con.conname, ', ' order by con.conname), '')
     from pg_constraint con
    where con.contype = 'f'
      and con.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
      and con.confdeltype in ('a', 'r')),
  '',
  'A no FK into auth.users / public.profiles is restrict or no action');

-- ---------------------------------------------------------------------------
-- B. The one constraint 20260919154000 changed.
-- ---------------------------------------------------------------------------
select is(
  (select confdeltype::text from pg_constraint where conname = 'groups_created_by_fkey'),
  'c',
  'B groups.created_by is ON DELETE CASCADE (was set null before 20260919154000)');

select is(
  (select confdeltype::text from pg_constraint where conname = 'profiles_coach_id_fkey'),
  'n',
  'B profiles.coach_id stays ON DELETE SET NULL: a deleted coach frees their members, never deletes them');

select is(
  (select confdeltype::text from pg_constraint where conname = 'workout_completions_scored_by_fkey'),
  'n',
  'B workout_completions.scored_by stays SET NULL: a completion on ANOTHER coach''s plan keeps '
  || 'its row when the scoring coach leaves (see D for the case where the leaving coach wrote the plan)');

-- ---------------------------------------------------------------------------
-- B (cont.). The two cascades that make a coach's departure cost their MEMBERS
-- their own history. Nothing here changes them; this pins the behaviour so a
-- future migration that flips either one has to come past this file, and pins
-- the catalog comments 20260919154000 attached to them, because the original FK
-- inventory read as though only the coach's own rows were at stake (review
-- 2026-09-20).
-- ---------------------------------------------------------------------------
select is(
  (select confdeltype::text from pg_constraint where conname = 'workout_plans_coach_id_fkey'),
  'c',
  'B workout_plans.coach_id is ON DELETE CASCADE: the authoring coach takes the plan — and the '
  || 'member''s completions on it — with them');
select is(
  (select confdeltype::text from pg_constraint where conname = 'diet_plans_coach_id_fkey'),
  'c',
  'B diet_plans.coach_id is ON DELETE CASCADE: the authoring coach takes the diet plan — and the '
  || 'member''s check-ins on it — with them');

select matches(
  (select obj_description(oid, 'pg_constraint') from pg_constraint where conname = 'workout_plans_coach_id_fkey'),
  'MEMBER''s own workout_completions',
  'B workout_plans_coach_id_fkey carries the catalog comment 20260919154000 added, naming the '
  || 'member rows it destroys');
select matches(
  (select obj_description(oid, 'pg_constraint') from pg_constraint where conname = 'diet_plans_coach_id_fkey'),
  'MEMBER''s own diet_checkins',
  'B diet_plans_coach_id_fkey carries the same disclosure');

-- ---------------------------------------------------------------------------
-- Fixtures. Created as the superuser (RLS bypassed) and rolled back at the end.
--
--   ad00…01  Coach V       the coach who deletes their account
--   ad00…02  Member V      Coach V's member, who also deletes their account
--   ad00…03  Member Stay   Coach V's OTHER member: survives, coach_id -> null
--   ad00…04  Coach Other   unrelated tenant
--   ad00…05  Member Other  Coach Other's member: must be untouched throughout
--   ad00…07  Member Stay2  Coach V's member, on a plan Coach OTHER authored.
--                          Carries the "scored by the departing coach, but the
--                          plan is not theirs" completion. Split out of Member
--                          Stay by 20260921100000, which made workout_plans
--                          UNIQUE(member_id): one member can no longer hold
--                          both their own coach's plan and another coach's.
-- ---------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('ad000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ad-coachv@test.invalid','x',now(),now()),
  ('ad000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ad-memberv@test.invalid','x',now(),now()),
  ('ad000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ad-stay@test.invalid','x',now(),now()),
  ('ad000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ad-coacho@test.invalid','x',now(),now()),
  ('ad000000-0000-4000-8000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ad-membero@test.invalid','x',now(),now()),
  ('ad000000-0000-4000-8000-000000000007','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ad-stay2@test.invalid','x',now(),now());

insert into public.profiles (id, role, coach_id, full_name) values
  ('ad000000-0000-4000-8000-000000000001','coach',  null,                                   'AD Coach V'),
  ('ad000000-0000-4000-8000-000000000002','member','ad000000-0000-4000-8000-000000000001','AD Member V'),
  ('ad000000-0000-4000-8000-000000000003','member','ad000000-0000-4000-8000-000000000001','AD Member Stay'),
  ('ad000000-0000-4000-8000-000000000004','coach',  null,                                   'AD Coach Other'),
  ('ad000000-0000-4000-8000-000000000005','member','ad000000-0000-4000-8000-000000000004','AD Member Other'),
  ('ad000000-0000-4000-8000-000000000007','member','ad000000-0000-4000-8000-000000000001','AD Member Stay2');

insert into public.coach_profiles (coach_id, bio) values
  ('ad000000-0000-4000-8000-000000000001','V'),
  ('ad000000-0000-4000-8000-000000000004','O');

-- Coach V's group, holding a member of the OTHER tenant too, so the cascade's
-- blast radius is visible.
insert into public.groups (id, name, created_by) values
  ('ad000000-0000-4000-8000-0000000000a1','AD Group V','ad000000-0000-4000-8000-000000000001'),
  ('ad000000-0000-4000-8000-0000000000a2','AD Group O','ad000000-0000-4000-8000-000000000004');
insert into public.group_members (group_id, member_id) values
  ('ad000000-0000-4000-8000-0000000000a1','ad000000-0000-4000-8000-000000000002'),
  ('ad000000-0000-4000-8000-0000000000a1','ad000000-0000-4000-8000-000000000003'),
  ('ad000000-0000-4000-8000-0000000000a2','ad000000-0000-4000-8000-000000000005');

insert into public.live_classes (id, coach_id, title, agora_channel_name, starts_at) values
  ('ad000000-0000-4000-8000-0000000000b1','ad000000-0000-4000-8000-000000000001','AD Class V','ad-chan-v',now()),
  ('ad000000-0000-4000-8000-0000000000b2','ad000000-0000-4000-8000-000000000004','AD Class O','ad-chan-o',now());
insert into public.live_class_participants (live_class_id, member_id, joined_at) values
  ('ad000000-0000-4000-8000-0000000000b1','ad000000-0000-4000-8000-000000000002',now()),
  ('ad000000-0000-4000-8000-0000000000b1','ad000000-0000-4000-8000-000000000003',now()),
  ('ad000000-0000-4000-8000-0000000000b2','ad000000-0000-4000-8000-000000000005',now());

insert into public.recordings (id, live_class_id, uploaded_by, storage_path, status) values
  ('ad000000-0000-4000-8000-0000000000c1','ad000000-0000-4000-8000-0000000000b1','ad000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000001/rec.mp4','published'),
  ('ad000000-0000-4000-8000-0000000000c2','ad000000-0000-4000-8000-0000000000b2','ad000000-0000-4000-8000-000000000004','ad000000-0000-4000-8000-000000000004/rec.mp4','published');
insert into public.transcripts (recording_id, raw_text) values
  ('ad000000-0000-4000-8000-0000000000c1','v'),
  ('ad000000-0000-4000-8000-0000000000c2','o');
insert into public.workout_notes (id, recording_id, created_by, published_at) values
  ('ad000000-0000-4000-8000-0000000000d1','ad000000-0000-4000-8000-0000000000c1','ad000000-0000-4000-8000-000000000001',now()),
  ('ad000000-0000-4000-8000-0000000000d2','ad000000-0000-4000-8000-0000000000c2','ad000000-0000-4000-8000-000000000004',now());
insert into public.workout_note_progress (member_id, note_id, item_key) values
  ('ad000000-0000-4000-8000-000000000002','ad000000-0000-4000-8000-0000000000d1','k1'),
  ('ad000000-0000-4000-8000-000000000005','ad000000-0000-4000-8000-0000000000d2','k1');

-- e5 is Coach V's plan for Member Stay: it goes when Coach V goes
-- (workout_plans_coach_id_fkey has always been ON DELETE CASCADE).
-- e0 is a plan Coach OTHER wrote for Member Stay2, whose day-1 workout Coach V
-- happened to score — the row that proves scored_by is a SET NULL and not a
-- cascade. It hung off Member Stay until 20260921100000 made workout_plans
-- UNIQUE(member_id); it is Member Stay2's plan now, which changes nothing the
-- assertions below are about (the scoring coach, not the plan's member).
insert into public.workout_plans (id, member_id, coach_id, title) values
  ('ad000000-0000-4000-8000-0000000000e1','ad000000-0000-4000-8000-000000000002','ad000000-0000-4000-8000-000000000001','AD Plan V'),
  ('ad000000-0000-4000-8000-0000000000e5','ad000000-0000-4000-8000-000000000003','ad000000-0000-4000-8000-000000000001','AD Plan Stay'),
  ('ad000000-0000-4000-8000-0000000000e0','ad000000-0000-4000-8000-000000000007','ad000000-0000-4000-8000-000000000004','AD Plan Stay2 (other coach)'),
  ('ad000000-0000-4000-8000-0000000000e9','ad000000-0000-4000-8000-000000000005','ad000000-0000-4000-8000-000000000004','AD Plan O');
insert into public.workout_days (id, workout_plan_id, day_number, block_name) values
  ('ad000000-0000-4000-8000-0000000000e2','ad000000-0000-4000-8000-0000000000e1',1,'B'),
  ('ad000000-0000-4000-8000-0000000000e6','ad000000-0000-4000-8000-0000000000e5',1,'B'),
  ('ad000000-0000-4000-8000-0000000000e8','ad000000-0000-4000-8000-0000000000e0',1,'B'),
  ('ad000000-0000-4000-8000-0000000000ea','ad000000-0000-4000-8000-0000000000e9',1,'B');
insert into public.exercises (id, workout_day_id, name, reps_or_duration, order_index) values
  ('ad000000-0000-4000-8000-0000000000e3','ad000000-0000-4000-8000-0000000000e2','E','10',1),
  ('ad000000-0000-4000-8000-0000000000eb','ad000000-0000-4000-8000-0000000000ea','E','10',1);
-- e7 is Member Stay's session on Coach V's plan. Before 20260921100000 it was
-- cascade-deleted with the plan; it must now SURVIVE the coach's departure with
-- workout_day_id nulled and its snapshot intact (that migration's whole point).
-- ed (on Coach Other's plan, scored by Coach V) must survive with scored_by null.
insert into public.workout_completions (id, member_id, workout_day_id, scored_by, effort_score) values
  ('ad000000-0000-4000-8000-0000000000e4','ad000000-0000-4000-8000-000000000002','ad000000-0000-4000-8000-0000000000e2','ad000000-0000-4000-8000-000000000001',7),
  ('ad000000-0000-4000-8000-0000000000e7','ad000000-0000-4000-8000-000000000003','ad000000-0000-4000-8000-0000000000e6','ad000000-0000-4000-8000-000000000001',6),
  ('ad000000-0000-4000-8000-0000000000ed','ad000000-0000-4000-8000-000000000007','ad000000-0000-4000-8000-0000000000e8','ad000000-0000-4000-8000-000000000001',8),
  ('ad000000-0000-4000-8000-0000000000ec','ad000000-0000-4000-8000-000000000005','ad000000-0000-4000-8000-0000000000ea','ad000000-0000-4000-8000-000000000004',5);
insert into public.exercise_completions (workout_completion_id, exercise_id) values
  ('ad000000-0000-4000-8000-0000000000e4','ad000000-0000-4000-8000-0000000000e3'),
  ('ad000000-0000-4000-8000-0000000000ec','ad000000-0000-4000-8000-0000000000eb');

insert into public.diet_plans (id, coach_id, title) values
  ('ad000000-0000-4000-8000-0000000000f1','ad000000-0000-4000-8000-000000000001','AD Diet V'),
  ('ad000000-0000-4000-8000-0000000000f5','ad000000-0000-4000-8000-000000000004','AD Diet O');
insert into public.diet_items (id, diet_plan_id, name, order_index) values
  ('ad000000-0000-4000-8000-0000000000f2','ad000000-0000-4000-8000-0000000000f1','I',1),
  ('ad000000-0000-4000-8000-0000000000f6','ad000000-0000-4000-8000-0000000000f5','I',1);
insert into public.diet_plan_assignments (diet_plan_id, member_id) values
  ('ad000000-0000-4000-8000-0000000000f1','ad000000-0000-4000-8000-000000000002'),
  ('ad000000-0000-4000-8000-0000000000f5','ad000000-0000-4000-8000-000000000005');
insert into public.diet_checkins (member_id, diet_item_id) values
  ('ad000000-0000-4000-8000-000000000002','ad000000-0000-4000-8000-0000000000f2'),
  ('ad000000-0000-4000-8000-000000000005','ad000000-0000-4000-8000-0000000000f6');

-- ---------------------------------------------------------------------------
-- Member Stay's OWN history that hangs off Coach V's authorship (added
-- 2026-09-20 after review). Member Stay is the member who SURVIVES the coach
-- delete, so every row here is a bystander's data:
--   fd  an exercise tick inside the completion e7 (on Coach V's plan)
--   f7/f8/fa/fb  a diet plan Coach V wrote, Member Stay's assignment to it and
--                a check-in Member Stay logged against it
--   fc  Member Stay's progress on Coach V's published note d1
--   the milestone below, which is keyed to nothing of Coach V's and must SURVIVE
-- Section D asserts what happens to each: everything authored by Coach V takes
-- the member's rows with it, and only what is independent of Coach V remains.
-- ---------------------------------------------------------------------------
insert into public.exercises (id, workout_day_id, name, reps_or_duration, order_index) values
-- Distinctive name so section D can prove the surviving tick carries the
-- SNAPSHOT of the exercise the cascade removed, not a live join to it.
  ('ad000000-0000-4000-8000-0000000000fd','ad000000-0000-4000-8000-0000000000e6','Goblet Squat','10',1);
insert into public.exercise_completions (workout_completion_id, exercise_id) values
  ('ad000000-0000-4000-8000-0000000000e7','ad000000-0000-4000-8000-0000000000fd');

insert into public.diet_plans (id, coach_id, title) values
  ('ad000000-0000-4000-8000-0000000000f7','ad000000-0000-4000-8000-000000000001','AD Diet V for Stay');
insert into public.diet_items (id, diet_plan_id, name, order_index) values
  ('ad000000-0000-4000-8000-0000000000f8','ad000000-0000-4000-8000-0000000000f7','I',1);
insert into public.diet_plan_assignments (id, diet_plan_id, member_id) values
  ('ad000000-0000-4000-8000-0000000000fa','ad000000-0000-4000-8000-0000000000f7','ad000000-0000-4000-8000-000000000003');
insert into public.diet_checkins (id, member_id, diet_item_id) values
  ('ad000000-0000-4000-8000-0000000000fb','ad000000-0000-4000-8000-000000000003','ad000000-0000-4000-8000-0000000000f8');

insert into public.workout_note_progress (id, member_id, note_id, item_key) values
  ('ad000000-0000-4000-8000-0000000000fc','ad000000-0000-4000-8000-000000000003','ad000000-0000-4000-8000-0000000000d1','k-stay');

insert into public.milestones (member_id, tier) values
  ('ad000000-0000-4000-8000-000000000002','first_day'),
  ('ad000000-0000-4000-8000-000000000003','first_day'),
  ('ad000000-0000-4000-8000-000000000005','first_day');

-- Reports and blocks in BOTH directions across the tenant line.
insert into public.moderation_reports (reporter_id, reported_user_id, reason) values
  ('ad000000-0000-4000-8000-000000000002','ad000000-0000-4000-8000-000000000005','filed by Member V'),
  ('ad000000-0000-4000-8000-000000000005','ad000000-0000-4000-8000-000000000002','filed about Member V');
insert into public.user_blocks (blocker_id, blocked_id) values
  ('ad000000-0000-4000-8000-000000000002','ad000000-0000-4000-8000-000000000005'),
  ('ad000000-0000-4000-8000-000000000005','ad000000-0000-4000-8000-000000000002');

insert into public.push_tokens (user_id, expo_push_token) values
  ('ad000000-0000-4000-8000-000000000001','ad-tok-coachv'),
  ('ad000000-0000-4000-8000-000000000002','ad-tok-memberv'),
  ('ad000000-0000-4000-8000-000000000005','ad-tok-membero');

insert into public.subscriptions (member_id, status, current_period_end) values
  ('ad000000-0000-4000-8000-000000000002','active', now() + interval '20 days'),
  ('ad000000-0000-4000-8000-000000000003','active', now() + interval '20 days'),
  ('ad000000-0000-4000-8000-000000000005','active', now() + interval '20 days');

-- A Storage row for each coach. Nothing in SQL will remove these: that is the
-- gap delete-account closes with the Storage API before it deletes the user.
insert into storage.objects (bucket_id, name, owner, owner_id) values
  ('recordings','ad000000-0000-4000-8000-000000000001/rec.mp4','ad000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000001'),
  ('recordings','ad000000-0000-4000-8000-000000000004/rec.mp4','ad000000-0000-4000-8000-000000000004','ad000000-0000-4000-8000-000000000004');

-- Sanity: every fixture user really is referenced all over the schema before we
-- start, so a green suite cannot be the result of an empty tree.
select cmp_ok(
  (select count(*) from regexp_split_to_table(pg_temp.ref_report('ad000000-0000-4000-8000-000000000002'), ', ')),
  '>=', 14::bigint,
  'fixtures: Member V is referenced by at least 14 columns before deletion');
select cmp_ok(
  (select count(*) from regexp_split_to_table(pg_temp.ref_report('ad000000-0000-4000-8000-000000000001'), ', ')),
  '>=', 10::bigint,
  'fixtures: Coach V is referenced by at least 10 columns before deletion');

-- ---------------------------------------------------------------------------
-- C. Delete the MEMBER.
-- ---------------------------------------------------------------------------
delete from auth.users where id = 'ad000000-0000-4000-8000-000000000002';

select is(
  pg_temp.ref_report('ad000000-0000-4000-8000-000000000002'),
  '',
  'C deleting a member leaves ZERO references to their uuid in public.* and storage.*');

select is(
  (select count(*)::int from auth.users where id = 'ad000000-0000-4000-8000-000000000002'),
  0, 'C the member''s auth.users row is gone');

-- Reports they FILED and reports ABOUT them both go (both FKs cascade).
select is(
  (select count(*)::int from public.moderation_reports
    where reporter_id = 'ad000000-0000-4000-8000-000000000002'
       or reported_user_id = 'ad000000-0000-4000-8000-000000000002'),
  0, 'C moderation reports the member filed AND reports about them are removed');

select is(
  (select count(*)::int from public.user_blocks
    where blocker_id = 'ad000000-0000-4000-8000-000000000002'
       or blocked_id = 'ad000000-0000-4000-8000-000000000002'),
  0, 'C blocks in BOTH directions are removed');

-- The coach's material is the coach's, not the member's: it must still be here.
select is(
  (select count(*)::int from public.live_classes where id = 'ad000000-0000-4000-8000-0000000000b1'),
  1, 'C the coach''s live class survives a member deletion');
select is(
  (select count(*)::int from public.workout_notes where id = 'ad000000-0000-4000-8000-0000000000d1'),
  1, 'C the coach''s published note survives a member deletion');

-- ---------------------------------------------------------------------------
-- D. Delete the COACH.
-- ---------------------------------------------------------------------------
delete from auth.users where id = 'ad000000-0000-4000-8000-000000000001';

select is(
  pg_temp.ref_report('ad000000-0000-4000-8000-000000000001', array['public']),
  '',
  'D deleting a coach leaves ZERO references to their uuid anywhere in public.*');

select is(
  (select count(*)::int from public.live_classes where coach_id = 'ad000000-0000-4000-8000-000000000001'),
  0, 'D the coach''s live classes are gone');
select is(
  (select count(*)::int from public.live_class_participants where live_class_id = 'ad000000-0000-4000-8000-0000000000b1'),
  0, 'D participant rows of the coach''s classes are gone');
select is(
  (select count(*)::int from public.recordings where id = 'ad000000-0000-4000-8000-0000000000c1'),
  0, 'D the coach''s recordings are gone');
select is(
  (select count(*)::int from public.transcripts where recording_id = 'ad000000-0000-4000-8000-0000000000c1'),
  0, 'D transcripts of the coach''s recordings are gone');
select is(
  (select count(*)::int from public.workout_notes where id = 'ad000000-0000-4000-8000-0000000000d1'),
  0, 'D the coach''s workout notes are gone');
select is(
  (select count(*)::int from public.coach_profiles where coach_id = 'ad000000-0000-4000-8000-000000000001'),
  0, 'D the coach profile is gone');
select is(
  (select count(*)::int from public.groups where id = 'ad000000-0000-4000-8000-0000000000a1'),
  0, 'D the group the coach created is gone (the FK change in 20260919154000)');
select is(
  (select count(*)::int from public.group_members where group_id = 'ad000000-0000-4000-8000-0000000000a1'),
  0, 'D and its membership rows went with it');

-- The surviving member: freed, not erased.
select is(
  (select coach_id from public.profiles where id = 'ad000000-0000-4000-8000-000000000003'),
  null::uuid,
  'D a member of the deleted coach keeps their profile with coach_id set to null');
select is(
  (select count(*)::int from public.subscriptions where member_id = 'ad000000-0000-4000-8000-000000000003'),
  1, 'D that member keeps their subscription');
select is(
  (select count(*)::int from public.workout_completions where id = 'ad000000-0000-4000-8000-0000000000ed'),
  1, 'D that member keeps a completion the deleted coach had merely SCORED');
select is(
  (select scored_by from public.workout_completions where id = 'ad000000-0000-4000-8000-0000000000ed'),
  null::uuid,
  'D ...with only the deleted coach''s attribution dropped from it');

-- Documented consequence, not a regression: workout_plans_coach_id_fkey has been
-- ON DELETE CASCADE since 20260919114448, so a plan the deleting coach AUTHORED
-- goes. Left as-is: coach_id is NOT NULL, so there is no set-null alternative
-- without a schema change well outside account deletion.
--
-- What CHANGED in 20260921100000: the member's HISTORY no longer goes with it.
-- workout_completions.workout_day_id and exercise_completions.exercise_id are
-- ON DELETE SET NULL now, and both rows carry a snapshot of what they were, so
-- a departing coach takes their plan and nothing of the member's training
-- record. The three assertions below asserted the opposite until that migration
-- and are inverted here deliberately.
select is(
  (select count(*)::int from public.workout_plans where id = 'ad000000-0000-4000-8000-0000000000e5'),
  0, 'D a plan the deleted coach AUTHORED is removed (pre-existing cascade)');
select is(
  (select count(*)::int from public.workout_completions where id = 'ad000000-0000-4000-8000-0000000000e7'),
  1, 'D ...but the member''s completion on that plan SURVIVES it (20260921100000)');
select is(
  (select workout_day_id from public.workout_completions where id = 'ad000000-0000-4000-8000-0000000000e7'),
  null::uuid,
  'D ...with workout_day_id nulled rather than the row deleted');
select is(
  (select block_name from public.workout_completions where id = 'ad000000-0000-4000-8000-0000000000e7'),
  'B', 'D ...and the snapshot of the day it was still readable');
select is(
  (select count(*)::int from public.exercise_completions where workout_completion_id = 'ad000000-0000-4000-8000-0000000000e7'),
  1, 'D ...and the exercise ticks inside it survive too');
select is(
  (select exercise_name from public.exercise_completions
    where workout_completion_id = 'ad000000-0000-4000-8000-0000000000e7'),
  'Goblet Squat',
  'D ...each keeping the name of the exercise the cascade removed');
select is(
  (select count(*)::int from public.workout_plans where id = 'ad000000-0000-4000-8000-0000000000e0'),
  1, 'D a plan ANOTHER coach wrote is untouched');

-- ---------------------------------------------------------------------------
-- D (cont.). The full blast radius onto the SURVIVING member (review
-- 2026-09-20). Same documented-consequence status as the workout plan above:
-- diet_plans.coach_id has been ON DELETE CASCADE since 20260919114449 and both
-- coach_id columns are NOT NULL, so there is no set-null alternative without a
-- schema change outside account deletion. These assertions exist so the cost is
-- measured rather than assumed — the delete-account panel now states it, and if
-- a later migration makes the member keep this history these lines must be
-- updated deliberately.
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from public.diet_plans where id = 'ad000000-0000-4000-8000-0000000000f7'),
  0, 'D a diet plan the deleted coach AUTHORED is removed (diet_plans_coach_id_fkey cascade)');
select is(
  (select count(*)::int from public.diet_checkins where id = 'ad000000-0000-4000-8000-0000000000fb'),
  0, 'D ...and the surviving member''s OWN check-ins against it are destroyed with it');
select is(
  (select count(*)::int from public.diet_plan_assignments where id = 'ad000000-0000-4000-8000-0000000000fa'),
  0, 'D ...and their assignment to that plan');
select is(
  (select count(*)::int from public.workout_note_progress where id = 'ad000000-0000-4000-8000-0000000000fc'),
  0, 'D the surviving member''s notes progress on the deleted coach''s note goes with the note');

-- The bound on all of that: what is keyed to the member independently of the
-- coach must still be there. If one of these ever turns 0 the cascade has
-- over-reached and the member has effectively been deleted along with their coach.
select is(
  (select count(*)::int from public.milestones where member_id = 'ad000000-0000-4000-8000-000000000003'),
  1, 'D the surviving member keeps their milestones (nothing of theirs keyed off the coach)');
select is(
  (select count(*)::int from public.profiles where id = 'ad000000-0000-4000-8000-000000000003'),
  1, 'D ...and their profile row itself');

-- ---------------------------------------------------------------------------
-- E. The unrelated tenant is untouched by either delete.
-- ---------------------------------------------------------------------------
select is(
  pg_temp.ref_report('ad000000-0000-4000-8000-000000000004'),
  'public.coach_profiles.coach_id=1, public.diet_plans.coach_id=1, public.groups.created_by=1, '
  || 'public.live_classes.coach_id=1, public.profiles.coach_id=1, public.profiles.id=1, '
  || 'public.recordings.uploaded_by=1, public.workout_completions.scored_by=1, '
  || 'public.workout_notes.created_by=1, public.workout_plans.coach_id=2, '
  || 'storage.objects.owner=1, storage.objects.owner_id=1',
  'E the unrelated coach still has every one of their rows');

select is(
  pg_temp.ref_report('ad000000-0000-4000-8000-000000000005'),
  'public.diet_checkins.member_id=1, public.diet_plan_assignments.member_id=1, '
  || 'public.group_members.member_id=1, public.live_class_participants.member_id=1, '
  || 'public.milestones.member_id=1, public.profiles.id=1, public.push_tokens.user_id=1, '
  || 'public.subscriptions.member_id=1, public.workout_completions.member_id=1, '
  || 'public.workout_note_progress.member_id=1, public.workout_plans.member_id=1',
  'E the unrelated member still has every one of their rows, except the two cross-tenant '
  || 'report/block rows the deleted member owned');

select is(
  (select count(*)::int from public.moderation_reports
    where reporter_id = 'ad000000-0000-4000-8000-000000000005'),
  0, 'E the report the unrelated member FILED about the deleted member went with the subject');

-- ---------------------------------------------------------------------------
-- F. Storage is the one thing SQL cannot clean — the Edge Function's job.
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from storage.objects where owner = 'ad000000-0000-4000-8000-000000000001'),
  1,
  'F storage.objects still references the deleted coach: there is NO FK to auth.users, which is '
  || 'why delete-account removes the <uid>/ prefix through the Storage API BEFORE deleting the user');

select is(
  (select count(*)::int from pg_constraint
    where contype = 'f' and conrelid = 'storage.objects'::regclass
      and confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)),
  0, 'F ...and that is a documented gap, not a missing constraint we could add here');

select ok(
  exists (select 1 from pg_trigger
           where tgrelid = 'storage.objects'::regclass and tgname = 'protect_objects_delete'),
  'F storage.protect_delete still blocks direct SQL deletes, so the Storage API is the only route');

-- ---------------------------------------------------------------------------
-- G. No client-side delete path exists for profiles.
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from pg_policy
    where polrelid = 'public.profiles'::regclass and polcmd = 'd'),
  0,
  'G profiles has no DELETE policy: deletion only ever happens service-role, through delete-account');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'G RLS is still enabled on profiles');

-- ---------------------------------------------------------------------------
-- H. The guard 20260919154000 leans on is still intact, and the new trigger
--    function is crash-safe when poked directly.
--
-- profiles_release_before_delete() nulls coach_id through the ONE sanctioned
-- server-side path (is_coach_assignment_context + app.coach_choice_member).
-- That must not have become a way for a client to reassign coaches: an
-- authenticated caller updating profiles.coach_id directly still has to fail.
--
-- The x3 anon/authenticated calls are the standing crash sweep from common.md:
-- on this Postgres 17.6 a role calling a SECURITY DEFINER function it lacks
-- EXECUTE on segfaults the backend, so every new function is called directly by
-- both roles. A trigger function raises 0A000 instead of running, which is the
-- correct clean refusal.
-- ---------------------------------------------------------------------------
select ok(
  exists (select 1 from pg_trigger
           where tgrelid = 'public.profiles'::regclass
             and tgname = 'profiles_guard_privileged_columns'),
  'H profiles_guard_privileged_columns is still installed and was not replaced');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ad000000-0000-4000-8000-000000000005', true);
select throws_ok(
  $$ update public.profiles set coach_id = null
      where id = 'ad000000-0000-4000-8000-000000000005' $$,
  '42501',
  'profiles.coach_id is assigned server-side; it cannot be changed by the account itself',
  'H a member still cannot null their own coach_id directly');

-- The sanctioned GUC alone must not help a client: is_coach_assignment_context
-- also demands current_user be postgres/supabase_admin/service_role, which
-- 'authenticated' is not.
select set_config('app.coach_choice_member', 'ad000000-0000-4000-8000-000000000005', true);
select throws_ok(
  $$ update public.profiles set coach_id = null
      where id = 'ad000000-0000-4000-8000-000000000005' $$,
  '42501',
  'profiles.coach_id is assigned server-side; it cannot be changed by the account itself',
  'H ...not even while app.coach_choice_member names their own row');
select set_config('app.coach_choice_member', '', true);

set local role anon;
select throws_ok($$ select public.profiles_release_before_delete() $$, '0A000',
  'trigger functions can only be called as triggers',
  'H profiles_release_before_delete() as anon raises cleanly (call 1 of 3)');
select throws_ok($$ select public.profiles_release_before_delete() $$, '0A000',
  'trigger functions can only be called as triggers',
  'H profiles_release_before_delete() as anon raises cleanly (call 2 of 3)');
select throws_ok($$ select public.profiles_release_before_delete() $$, '0A000',
  'trigger functions can only be called as triggers',
  'H profiles_release_before_delete() as anon raises cleanly (call 3 of 3)');

set local role authenticated;
select throws_ok($$ select public.profiles_release_before_delete() $$, '0A000',
  'trigger functions can only be called as triggers',
  'H profiles_release_before_delete() as authenticated raises cleanly (call 1 of 3)');
select throws_ok($$ select public.profiles_release_before_delete() $$, '0A000',
  'trigger functions can only be called as triggers',
  'H profiles_release_before_delete() as authenticated raises cleanly (call 2 of 3)');
select throws_ok($$ select public.profiles_release_before_delete() $$, '0A000',
  'trigger functions can only be called as triggers',
  'H profiles_release_before_delete() as authenticated raises cleanly (call 3 of 3)');

set local role postgres;

-- ---------------------------------------------------------------------------
-- I. The delete as GoTrue ACTUALLY runs it: with a NON-privileged role.
--
-- Sections C and D delete as postgres, where public.is_privileged_writer() is
-- true and every *_guard_client_writes trigger short-circuits — so they could
-- never have caught the real failure: GoTrue's admin delete runs as
-- supabase_auth_admin, is_privileged_writer() is FALSE there, and deleting any
-- coach who had scored a member's effort aborted with
--   ERROR: workout_completions.effort_score / scored_by are set by the member's
--          coach (42501)
--   CONTEXT: ... "update public.workout_completions set scored_by = null ..."
--            PL/pgSQL function profiles_release_before_delete()
-- (reproduced 2026-09-20 over HTTP as 500 delete_failed, and in psql on a
-- supabase_auth_admin connection).
--
-- This suite cannot literally BE supabase_auth_admin: postgres is not a superuser
-- on this database ('permission denied to set role "supabase_auth_admin"', and
-- 'role memberships are reserved, only superusers can grant them'), and a second
-- connection (dblink) could not see these rolled-back fixtures. So the condition
-- is reproduced exactly instead of the role name: a SECURITY DEFINER function
-- owned by postgres, called while the session role is `authenticated`. Inside it
--   current_user            = postgres            (as under supabase_auth_admin,
--                                                  which is why the delete itself
--                                                  and the RI actions are allowed)
--   is_privileged_writer()  = FALSE               (it reads the role GUC /
--                                                  session_user, neither of which
--                                                  a SECURITY DEFINER call
--                                                  changes)
-- which is precisely the combination that broke. The first assertion below pins
-- that, so this section can never silently degrade into another postgres delete.
-- ---------------------------------------------------------------------------
create function pg_temp.delete_auth_user_unprivileged(p_uid uuid) returns void
language plpgsql security definer set search_path = public as $fn$
begin
  delete from auth.users where id = p_uid;
end $fn$;

create function pg_temp.privileged_writer_here() returns boolean
language plpgsql security definer set search_path = public as $fn$
begin
  return public.is_privileged_writer();
end $fn$;

--   ad00…91  Coach Scorer   deletes their account; has scored someone else's work
--   ad00…92  Member Scored  Coach Scorer's member; keeps everything but the name
--   ad00…94  Coach Author   wrote the plan, so the completion is NOT cascaded away
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('ad000000-0000-4000-8000-000000000091','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ad-scorer@test.invalid','x',now(),now()),
  ('ad000000-0000-4000-8000-000000000092','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ad-scored@test.invalid','x',now(),now()),
  ('ad000000-0000-4000-8000-000000000094','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ad-author@test.invalid','x',now(),now());

insert into public.profiles (id, role, coach_id, full_name) values
  ('ad000000-0000-4000-8000-000000000091','coach', null,                                   'AD Coach Scorer'),
  ('ad000000-0000-4000-8000-000000000094','coach', null,                                   'AD Coach Author'),
  ('ad000000-0000-4000-8000-000000000092','member','ad000000-0000-4000-8000-000000000091','AD Member Scored');

insert into public.workout_plans (id, member_id, coach_id, title) values
  ('ad000000-0000-4000-8000-000000000095','ad000000-0000-4000-8000-000000000092','ad000000-0000-4000-8000-000000000094','AD Plan by the author');
insert into public.workout_days (id, workout_plan_id, day_number, block_name) values
  ('ad000000-0000-4000-8000-000000000096','ad000000-0000-4000-8000-000000000095',1,'B');
insert into public.workout_completions (id, member_id, workout_day_id, scored_by, effort_score) values
  ('ad000000-0000-4000-8000-000000000097','ad000000-0000-4000-8000-000000000092','ad000000-0000-4000-8000-000000000096','ad000000-0000-4000-8000-000000000091',9);

set local role authenticated;

select is(pg_temp.privileged_writer_here(), false,
  'I the simulated delete context is NOT a privileged writer — exactly as under supabase_auth_admin '
  || '(if this ever turns true the rest of section I proves nothing)');

select lives_ok(
  $$ select pg_temp.delete_auth_user_unprivileged('ad000000-0000-4000-8000-000000000091') $$,
  'I a coach who has SCORED a member''s effort can be deleted by a non-privileged caller '
  || '(this raised 42501 from workout_completions_guard_client_writes before 20260919154000''s '
  || 'is_account_deletion_context exemption)');

set local role postgres;

select is(
  (select count(*)::int from auth.users where id = 'ad000000-0000-4000-8000-000000000091'),
  0, 'I ...and the auth.users row really is gone, not just un-erroring');

select is(
  pg_temp.ref_report('ad000000-0000-4000-8000-000000000091', array['public']),
  '',
  'I no reference to the deleted coach survives anywhere in public.*');

select is(
  (select count(*)::int from public.workout_completions where id = 'ad000000-0000-4000-8000-000000000097'),
  1, 'I the member keeps the completion the deleted coach had scored');
select is(
  (select scored_by from public.workout_completions where id = 'ad000000-0000-4000-8000-000000000097'),
  null::uuid, 'I ...with only the attribution dropped');
select is(
  (select effort_score from public.workout_completions where id = 'ad000000-0000-4000-8000-000000000097'),
  9, 'I ...and the score itself untouched: the exemption nulls scored_by and nothing else');
select is(
  (select coach_id from public.profiles where id = 'ad000000-0000-4000-8000-000000000092'),
  null::uuid, 'I the member survives with coach_id null');

select is(
  coalesce(current_setting('app.deleting_account', true), ''),
  '',
  'I the sanctioned GUC does not leak out of the trigger into the rest of the transaction');

-- ---------------------------------------------------------------------------
-- I (cont.). The exemption must be useless to a client, and the guard must still
-- enforce everything 20260919152300 gave it (20260919154000 REPLACES that
-- function, so its other rules are re-asserted here, not assumed).
-- ---------------------------------------------------------------------------
select is(public.is_account_deletion_context(null), false,
  'I is_account_deletion_context(null) is false');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ad000000-0000-4000-8000-000000000092', true);

select is(
  public.is_account_deletion_context('ad000000-0000-4000-8000-000000000094'),
  false,
  'I an authenticated caller is never in an account-deletion context (current_user is not privileged)');

select set_config('app.deleting_account', 'ad000000-0000-4000-8000-000000000094', true);
select is(
  public.is_account_deletion_context('ad000000-0000-4000-8000-000000000094'),
  false,
  'I ...not even while they have set app.deleting_account to name that account');

-- The member re-scores/clears attribution on their own completion: still refused,
-- GUC or no GUC. (Their completion below belongs to Coach Author's plan.)
-- (scored_by on this row is already null, so writing a value is what "changing
-- it" means here — the exemption only ever allows null, never a value.)
select throws_ok(
  $$ update public.workout_completions set scored_by = 'ad000000-0000-4000-8000-000000000092'
      where id = 'ad000000-0000-4000-8000-000000000097' $$,
  '42501',
  'workout_completions.effort_score / scored_by are set by the member''s coach',
  'I a member still cannot touch scored_by, even with app.deleting_account set');
select throws_ok(
  $$ update public.workout_completions set effort_score = 1
      where id = 'ad000000-0000-4000-8000-000000000097' $$,
  '42501',
  'workout_completions.effort_score / scored_by are set by the member''s coach',
  'I the replaced guard still freezes effort_score for a member');
select throws_ok(
  $$ update public.workout_completions set member_id = 'ad000000-0000-4000-8000-000000000003'
      where id = 'ad000000-0000-4000-8000-000000000097' $$,
  '42501',
  'workout_completions rows cannot be moved to another member',
  'I the replaced guard still freezes member_id (the R3-1 rule)');
select set_config('app.deleting_account', '', true);

-- Standing crash sweep from common.md: anon and authenticated call the new
-- function directly, three times each, because on this Postgres 17.6 a role
-- calling a SECURITY DEFINER function it lacks EXECUTE on segfaults the backend.
-- is_account_deletion_context is SECURITY INVOKER and anon/authenticated keep
-- EXECUTE, so it must simply answer false.
select is(public.is_account_deletion_context('ad000000-0000-4000-8000-000000000094'), false,
  'I is_account_deletion_context as authenticated returns false (call 1 of 3)');
select is(public.is_account_deletion_context('ad000000-0000-4000-8000-000000000094'), false,
  'I is_account_deletion_context as authenticated returns false (call 2 of 3)');
select is(public.is_account_deletion_context('ad000000-0000-4000-8000-000000000094'), false,
  'I is_account_deletion_context as authenticated returns false (call 3 of 3)');

set local role anon;
select is(public.is_account_deletion_context('ad000000-0000-4000-8000-000000000094'), false,
  'I is_account_deletion_context as anon returns false (call 1 of 3)');
select is(public.is_account_deletion_context('ad000000-0000-4000-8000-000000000094'), false,
  'I is_account_deletion_context as anon returns false (call 2 of 3)');
select is(public.is_account_deletion_context('ad000000-0000-4000-8000-000000000094'), false,
  'I is_account_deletion_context as anon returns false (call 3 of 3)');

set local role postgres;

select * from finish();

rollback;
