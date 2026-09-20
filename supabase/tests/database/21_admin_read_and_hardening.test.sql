-- ============================================================================
-- 21_admin_read_and_hardening.test.sql
--
-- Pins every behaviour introduced by migration 20260919154100
-- (admin read gap, row/length caps, get_my_coach demotion, live_class_exists
-- gate, group_members block filter, recordings_client grants, choose_coach
-- edge cases).
--
-- Run with: supabase test db supabase/tests/database/21_admin_read_and_hardening.test.sql
--       or: psql "$DB_URL" -v ON_ERROR_STOP=1 -f <this file>
-- One transaction, rolled back. Fixture prefix 7a21… is unique to this file;
-- every assertion names its own fixture, so concurrent agents cannot move it.
--
-- MUTANT (confirmed in a rolled-back transaction, see the report):
--   drop policy "workout_completions_select_admin" on public.workout_completions;
--   -> assertions 4 and 11 turn RED (admin reads 0 completions again).
-- A second mutant, `drop trigger workout_note_progress_enforce_row_cap on
-- public.workout_note_progress;`, turns 18 and 19 RED.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(56);

-- ---------------------------------------------------------------------------
-- Fixtures (superuser, RLS bypassed, rolled back at the end).
--   ..01 coach C1        ..02 member M1 (C1)   ..03 member M2 (C1)
--   ..04 admin A         ..05 stranger member  ..06 coach C2 (no coach_profiles)
--   ..07 member M3 (C1)  ..08 member M4 (C1)   ..09 member M5 (no coach)
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'h21-' || u.n || '@test.invalid', 'x', now(), now()
from (values
  ('7a210000-0000-4000-8000-000000000001'::uuid, 1),
  ('7a210000-0000-4000-8000-000000000002'::uuid, 2),
  ('7a210000-0000-4000-8000-000000000003'::uuid, 3),
  ('7a210000-0000-4000-8000-000000000004'::uuid, 4),
  ('7a210000-0000-4000-8000-000000000005'::uuid, 5),
  ('7a210000-0000-4000-8000-000000000006'::uuid, 6),
  ('7a210000-0000-4000-8000-000000000007'::uuid, 7),
  ('7a210000-0000-4000-8000-000000000008'::uuid, 8),
  ('7a210000-0000-4000-8000-000000000009'::uuid, 9)
) as u(id, n);

insert into public.profiles (id, role, coach_id, full_name) values
  ('7a210000-0000-4000-8000-000000000001', 'coach',  null,                                   'H21 Coach One'),
  ('7a210000-0000-4000-8000-000000000002', 'member', '7a210000-0000-4000-8000-000000000001', 'H21 Member One'),
  ('7a210000-0000-4000-8000-000000000003', 'member', '7a210000-0000-4000-8000-000000000001', 'H21 Member Two'),
  ('7a210000-0000-4000-8000-000000000004', 'admin',  null,                                   'H21 Admin'),
  ('7a210000-0000-4000-8000-000000000005', 'member', null,                                   'H21 Stranger'),
  ('7a210000-0000-4000-8000-000000000006', 'coach',  null,                                   'H21 Coach Two Bare'),
  ('7a210000-0000-4000-8000-000000000007', 'member', '7a210000-0000-4000-8000-000000000001', 'H21 Member Three'),
  ('7a210000-0000-4000-8000-000000000008', 'member', '7a210000-0000-4000-8000-000000000001', 'H21 Member Four'),
  ('7a210000-0000-4000-8000-000000000009', 'member', null,                                   'H21 Member Five');

-- C1 has a directory row; C2 deliberately has NONE (item 7b).
insert into public.coach_profiles (coach_id, bio, specialties, accepting_members) values
  ('7a210000-0000-4000-8000-000000000001', 'H21 bio', '{strength}', true);

-- Live access for the members that touch notes / groups.
insert into public.subscriptions (member_id, status, current_period_end) values
  ('7a210000-0000-4000-8000-000000000002', 'active', now() + interval '20 days'),
  ('7a210000-0000-4000-8000-000000000003', 'active', now() + interval '20 days'),
  ('7a210000-0000-4000-8000-000000000007', 'active', now() + interval '20 days'),
  ('7a210000-0000-4000-8000-000000000008', 'active', now() + interval '20 days');

-- The member training record an admin is meant to be able to read (item 1).
insert into public.workout_plans (id, member_id, coach_id, title) values
  ('7a210000-0000-4000-8000-0000000000a1', '7a210000-0000-4000-8000-000000000002',
   '7a210000-0000-4000-8000-000000000001', 'H21 Plan');

insert into public.workout_days (id, workout_plan_id, day_number, block_name) values
  ('7a210000-0000-4000-8000-0000000000d1', '7a210000-0000-4000-8000-0000000000a1', 1, 'H21 Block');

insert into public.exercises (id, workout_day_id, name, reps_or_duration, order_index) values
  ('7a210000-0000-4000-8000-0000000000f1', '7a210000-0000-4000-8000-0000000000d1', 'H21 Squat', '5x5', 1);

insert into public.workout_completions (id, member_id, workout_day_id, status, effort_score, completed_at) values
  ('7a210000-0000-4000-8000-0000000000c1', '7a210000-0000-4000-8000-000000000002',
   '7a210000-0000-4000-8000-0000000000d1', 'completed', 7, now());

insert into public.exercise_completions (id, workout_completion_id, exercise_id) values
  ('7a210000-0000-4000-8000-0000000000c2', '7a210000-0000-4000-8000-0000000000c1',
   '7a210000-0000-4000-8000-0000000000f1');

insert into public.milestones (id, member_id, tier) values
  ('7a210000-0000-4000-8000-0000000000c3', '7a210000-0000-4000-8000-000000000002', 'first_day');

insert into public.diet_plans (id, coach_id, title) values
  ('7a210000-0000-4000-8000-0000000000b1', '7a210000-0000-4000-8000-000000000001', 'H21 Diet');

insert into public.diet_items (id, diet_plan_id, name, order_index) values
  ('7a210000-0000-4000-8000-0000000000b2', '7a210000-0000-4000-8000-0000000000b1', 'H21 Oats', 1);

insert into public.diet_plan_assignments (id, diet_plan_id, member_id) values
  ('7a210000-0000-4000-8000-0000000000b3', '7a210000-0000-4000-8000-0000000000b1',
   '7a210000-0000-4000-8000-000000000002');

insert into public.diet_checkins (id, member_id, diet_item_id) values
  ('7a210000-0000-4000-8000-0000000000b4', '7a210000-0000-4000-8000-000000000002',
   '7a210000-0000-4000-8000-0000000000b2');

-- Live class + recording + published notes (items 2 and 4).
insert into public.live_classes (id, coach_id, title, agora_channel_name, starts_at, status) values
  ('7a210000-0000-4000-8000-0000000000e1', '7a210000-0000-4000-8000-000000000001',
   'H21 Class', 'h21-channel', now() - interval '1 hour', 'ended');

insert into public.recordings (id, live_class_id, uploaded_by, storage_path, status) values
  ('7a210000-0000-4000-8000-0000000000e2', '7a210000-0000-4000-8000-0000000000e1',
   '7a210000-0000-4000-8000-000000000001',
   '7a210000-0000-4000-8000-000000000001/h21.m4a', 'published'),
  -- transcripts is UNIQUE(recording_id), so each transcript assertion needs its own recording.
  ('7a210000-0000-4000-8000-0000000000e3', null, '7a210000-0000-4000-8000-000000000001', null, 'draft'),
  ('7a210000-0000-4000-8000-0000000000e4', null, '7a210000-0000-4000-8000-000000000001', null, 'draft'),
  ('7a210000-0000-4000-8000-0000000000e5', null, '7a210000-0000-4000-8000-000000000001', null, 'draft');

insert into public.workout_notes (id, recording_id, created_by, draft_content, published_at) values
  ('7a210000-0000-4000-8000-0000000000a5', '7a210000-0000-4000-8000-0000000000e2',
   '7a210000-0000-4000-8000-000000000001', '{"title":"H21 A","items":[]}', now()),
  ('7a210000-0000-4000-8000-0000000000a6', '7a210000-0000-4000-8000-0000000000e2',
   '7a210000-0000-4000-8000-000000000001', '{"title":"H21 B","items":[]}', now()),
  ('7a210000-0000-4000-8000-0000000000a7', '7a210000-0000-4000-8000-0000000000e2',
   '7a210000-0000-4000-8000-000000000001', '{"title":"H21 C","items":[]}', now());

-- M1 is parked ONE tick below the per-note cap of 200; M2 is parked exactly ON
-- the per-member cap of 5000, spread over two OTHER notes so its next insert
-- into note A has a per-note count of 0 and can only trip the member cap.
-- Seeded as postgres, which is_privileged_writer() exempts from the trigger.
insert into public.workout_note_progress (member_id, note_id, item_key)
select '7a210000-0000-4000-8000-000000000002', '7a210000-0000-4000-8000-0000000000a5', 'k-' || g
from generate_series(1, 199) g;

insert into public.workout_note_progress (member_id, note_id, item_key)
select '7a210000-0000-4000-8000-000000000003',
       case when g <= 2500 then '7a210000-0000-4000-8000-0000000000a6'::uuid
            else '7a210000-0000-4000-8000-0000000000a7'::uuid end,
       'k-' || g
from generate_series(1, 5000) g;

-- Community group for the block-filter tests (item 5).
insert into public.groups (id, name, created_by) values
  ('7a210000-0000-4000-8000-0000000000aa', 'H21 Group', '7a210000-0000-4000-8000-000000000001');

insert into public.group_members (group_id, member_id) values
  ('7a210000-0000-4000-8000-0000000000aa', '7a210000-0000-4000-8000-000000000002'),
  ('7a210000-0000-4000-8000-0000000000aa', '7a210000-0000-4000-8000-000000000007'),
  ('7a210000-0000-4000-8000-0000000000aa', '7a210000-0000-4000-8000-000000000008');


-- ===========================================================================
-- Item 1. Admin read gap. An admin must see the member training record, and
--         must gain NOTHING beyond SELECT.
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a210000-0000-4000-8000-000000000004', true);

select is((select count(*)::int from public.workout_plans
            where id = '7a210000-0000-4000-8000-0000000000a1'), 1,
          'admin reads the member''s workout_plans row');                                   -- 1
select is((select count(*)::int from public.workout_days
            where id = '7a210000-0000-4000-8000-0000000000d1'), 1,
          'admin reads the member''s workout_days row');                                    -- 2
select is((select count(*)::int from public.exercises
            where id = '7a210000-0000-4000-8000-0000000000f1'), 1,
          'admin reads the member''s exercises row');                                       -- 3
select is((select count(*)::int from public.workout_completions
            where id = '7a210000-0000-4000-8000-0000000000c1'), 1,
          'admin reads the member''s workout_completions row (THE gap)');                   -- 4
select is((select count(*)::int from public.exercise_completions
            where id = '7a210000-0000-4000-8000-0000000000c2'), 1,
          'admin reads the member''s exercise_completions row');                            -- 5
select is((select count(*)::int from public.milestones
            where id = '7a210000-0000-4000-8000-0000000000c3'), 1,
          'admin reads the member''s milestones row');                                      -- 6
select is((select count(*)::int from public.diet_plans
            where id = '7a210000-0000-4000-8000-0000000000b1'), 1,
          'admin reads the diet_plans row');                                                -- 7
select is((select count(*)::int from public.diet_items
            where id = '7a210000-0000-4000-8000-0000000000b2'), 1,
          'admin reads the diet_items row');                                                -- 8
select is((select count(*)::int from public.diet_plan_assignments
            where id = '7a210000-0000-4000-8000-0000000000b3'), 1,
          'admin reads the diet_plan_assignments row');                                     -- 9
select is((select count(*)::int from public.diet_checkins
            where id = '7a210000-0000-4000-8000-0000000000b4'), 1,
          'admin reads the diet_checkins row');                                             -- 10

-- The whole point of the ticket: the security_invoker view stops lying.
select is((select completed_count from public.member_workout_stats
            where member_id = '7a210000-0000-4000-8000-000000000002'), 1::bigint,
          'member_workout_stats shows an admin the REAL completed_count, not 0');           -- 11

-- ... and READ is all they got. Both of these return zero affected rows because
-- the write policies (is_coach_or_admin() AND is_coach_of_<thing>()) are untouched.
with u as (
  update public.workout_completions set effort_score = 1
   where id = '7a210000-0000-4000-8000-0000000000c1' returning 1)
select is((select count(*)::int from u), 0,
          'admin UPDATE on workout_completions still affects 0 rows');                      -- 12

with d as (
  delete from public.exercise_completions
   where id = '7a210000-0000-4000-8000-0000000000c2' returning 1)
select is((select count(*)::int from d), 0,
          'admin DELETE on exercise_completions (a FOR ALL policy) still affects 0 rows');  -- 13

select throws_ok(
  $$insert into public.workout_completions (member_id, workout_day_id, status)
    values ('7a210000-0000-4000-8000-000000000002',
            '7a210000-0000-4000-8000-0000000000d1', 'completed')$$,
  '42501',
  'new row violates row-level security policy for table "workout_completions"',
  'admin INSERT into workout_completions is still refused');                                -- 14

-- Control: the new policies are admin-only, not a global widening.
select set_config('request.jwt.claim.sub', '7a210000-0000-4000-8000-000000000005', true);
select is((select count(*)::int from public.workout_completions
            where id = '7a210000-0000-4000-8000-0000000000c1'), 0,
          'a stranger member still reads 0 workout_completions');                           -- 15
select is((select count(*)::int from public.diet_checkins
            where id = '7a210000-0000-4000-8000-0000000000b4'), 0,
          'a stranger member still reads 0 diet_checkins');                                 -- 16


-- ===========================================================================
-- Item 2. Row caps on workout_note_progress and the new length bounds.
-- ===========================================================================
select set_config('request.jwt.claim.sub', '7a210000-0000-4000-8000-000000000002', true);

select lives_ok(
  $$insert into public.workout_note_progress (member_id, note_id, item_key)
    values ('7a210000-0000-4000-8000-000000000002',
            '7a210000-0000-4000-8000-0000000000a5', 'k-200')$$,
  'tick 200 of 200 for one note is accepted (boundary is inclusive)');                      -- 17

select throws_ok(
  $$insert into public.workout_note_progress (member_id, note_id, item_key)
    values ('7a210000-0000-4000-8000-000000000002',
            '7a210000-0000-4000-8000-0000000000a5', 'k-201')$$,
  '23514',
  'too many checklist ticks for this note (limit 200)',
  'tick 201 for the same note raises check_violation');                                     -- 18

select set_config('request.jwt.claim.sub', '7a210000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$insert into public.workout_note_progress (member_id, note_id, item_key)
    values ('7a210000-0000-4000-8000-000000000003',
            '7a210000-0000-4000-8000-0000000000a5', 'k-spill')$$,
  '23514',
  'too many checklist ticks for this member (limit 5000)',
  'a member at 5000 ticks is refused even on a note with zero ticks');                      -- 19

set local role postgres;
select lives_ok(
  $$insert into public.workout_note_progress (member_id, note_id, item_key)
    values ('7a210000-0000-4000-8000-000000000002',
            '7a210000-0000-4000-8000-0000000000a5', 'k-pipeline')$$,
  'a privileged writer (the pipeline) is exempt from the per-note cap');                    -- 20

-- workout_notes content bounds: 64 KB serialized, inclusive.
select lives_ok(
  $$insert into public.workout_notes (recording_id, created_by, draft_content)
    values ('7a210000-0000-4000-8000-0000000000e2',
            '7a210000-0000-4000-8000-000000000001',
            '{"title":"' || repeat('x', 65513) || '","items":[]}')$$,
  'workout_notes.draft_content of exactly 65536 chars is accepted');                        -- 21

select throws_ok(
  $$insert into public.workout_notes (recording_id, created_by, draft_content)
    values ('7a210000-0000-4000-8000-0000000000e2',
            '7a210000-0000-4000-8000-000000000001',
            '{"title":"' || repeat('x', 65514) || '","items":[]}')$$,
  '23514',
  'new row for relation "workout_notes" violates check constraint "workout_notes_content_bounds"',
  'workout_notes.draft_content of 65537 chars is rejected');                                -- 22

select throws_ok(
  $$insert into public.workout_notes (recording_id, created_by, edited_content)
    values ('7a210000-0000-4000-8000-0000000000e2',
            '7a210000-0000-4000-8000-000000000001',
            '{"title":"' || repeat('x', 65514) || '","items":[]}')$$,
  '23514',
  'new row for relation "workout_notes" violates check constraint "workout_notes_content_bounds"',
  'workout_notes.edited_content of 65537 chars is rejected');                               -- 23

-- transcripts bounds: 1,000,000 chars of text and 2 MB of segments, inclusive.
select lives_ok(
  $$insert into public.transcripts (recording_id, raw_text)
    values ('7a210000-0000-4000-8000-0000000000e3', repeat('x', 1000000))$$,
  'transcripts.raw_text of exactly 1000000 chars is accepted');                             -- 24

select throws_ok(
  $$insert into public.transcripts (recording_id, raw_text)
    values ('7a210000-0000-4000-8000-0000000000e4', repeat('x', 1000001))$$,
  '23514',
  'new row for relation "transcripts" violates check constraint "transcripts_text_bounds"',
  'transcripts.raw_text of 1000001 chars is rejected');                                     -- 25

select lives_ok(
  $$insert into public.transcripts (recording_id, segments)
    values ('7a210000-0000-4000-8000-0000000000e5', to_jsonb(repeat('x', 2097150)))$$,
  'transcripts.segments of exactly 2097152 serialized bytes is accepted');                  -- 26

select throws_ok(
  $$insert into public.transcripts (recording_id, segments)
    values ('7a210000-0000-4000-8000-0000000000e4', to_jsonb(repeat('x', 2097151)))$$,
  '23514',
  'new row for relation "transcripts" violates check constraint "transcripts_text_bounds"',
  'transcripts.segments of 2097153 serialized bytes is rejected');                          -- 27

-- The real pipeline still fits: the mock ASR script is a few hundred characters
-- and the drafter emits a checklist of a couple of dozen items.
select lives_ok(
  $$insert into public.transcripts (recording_id, raw_text, segments, provider)
    values ('7a210000-0000-4000-8000-0000000000e4',
            repeat('Alright team, three sets of ten. ', 12),
            '[{"start":0,"end":4.2,"text":"Alright team"}]'::jsonb,
            'mock')$$,
  'a realistic mock-ASR transcript is well inside both transcript bounds');                 -- 28


-- ===========================================================================
-- Item 3. get_my_coach() must not present a DEMOTED coach.
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a210000-0000-4000-8000-000000000002', true);

select is((select coach_id from public.get_my_coach()),
          '7a210000-0000-4000-8000-000000000001'::uuid,
          'get_my_coach returns the member''s coach while the role is still coach');        -- 29

savepoint demote_coach;
set local role postgres;
update public.profiles set role = 'member'
 where id = '7a210000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a210000-0000-4000-8000-000000000002', true);

select is((select count(*)::int from public.get_my_coach()), 0,
          'get_my_coach returns ZERO rows once the coach is demoted to member');            -- 30
select is((select count(*)::int from public.list_coaches()
            where coach_id = '7a210000-0000-4000-8000-000000000001'), 0,
          'list_coaches agrees: a demoted coach is no longer listed');                      -- 31

set local role postgres;
rollback to savepoint demote_coach;

set local role authenticated;
select set_config('request.jwt.claim.sub', '7a210000-0000-4000-8000-000000000002', true);
select is((select count(*)::int from public.get_my_coach()), 1,
          'get_my_coach is back to one row once the demotion is undone');                   -- 32


-- ===========================================================================
-- Item 4. live_class_exists() is gated in-body to provisioned profiles.
-- ===========================================================================
select is(public.live_class_exists('7a210000-0000-4000-8000-0000000000e1'), true,
          'live_class_exists: true for a real class read by a provisioned member');         -- 33
select is(public.live_class_exists('7a210000-0000-4000-8000-00000000dead'), false,
          'live_class_exists: false for a uuid that names no class');                       -- 34
select is(public.live_class_exists(null), false,
          'live_class_exists: false for a null class id');                                  -- 35

-- A bearer token for an account that was never provisioned (or has been
-- deleted) must NOT get an answer -- this is the new gate.
select set_config('request.jwt.claim.sub', '7a210000-0000-4000-8000-0000000000ff', true);
select is(public.live_class_exists('7a210000-0000-4000-8000-0000000000e1'), false,
          'live_class_exists: false for a JWT with no profiles row (the oracle gate)');     -- 36

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is(auth.uid(), null::uuid, 'identity: anon has a null auth.uid()');                  -- 37
select is(public.live_class_exists('7a210000-0000-4000-8000-0000000000e1'), false,
          'live_class_exists: false for anon (null-uid gate, EXECUTE never revoked)');      -- 38
select is(public.is_blocked_pair('7a210000-0000-4000-8000-000000000002'), false,
          'is_blocked_pair: false for anon (in-body gate, no segfault path)');              -- 39


-- ===========================================================================
-- Item 5. Raw group_members SELECT honours user_blocks, both directions.
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a210000-0000-4000-8000-000000000002', true);

select is((select count(*)::int from public.group_members
            where group_id = '7a210000-0000-4000-8000-0000000000aa'), 3,
          'before any block, M1 sees all three group_members rows');                        -- 40
select is((select count(*)::int from public.get_group_roster(
             '7a210000-0000-4000-8000-0000000000aa')), 2,
          'before any block, the roster shows M1 the other two members');                   -- 41

set local role postgres;
insert into public.user_blocks (blocker_id, blocked_id) values
  ('7a210000-0000-4000-8000-000000000002', '7a210000-0000-4000-8000-000000000007');

set local role authenticated;
select set_config('request.jwt.claim.sub', '7a210000-0000-4000-8000-000000000002', true);
select is((select count(*)::int from public.group_members
            where group_id = '7a210000-0000-4000-8000-0000000000aa'
              and member_id = '7a210000-0000-4000-8000-000000000007'), 0,
          'the BLOCKER can no longer read the blocked member''s group_members row');        -- 42
select is((select count(*)::int from public.group_members
            where group_id = '7a210000-0000-4000-8000-0000000000aa'), 2,
          'the blocker sees two rows: their own and the unblocked member''s');              -- 43
select is((select count(*)::int from public.group_members
            where group_id = '7a210000-0000-4000-8000-0000000000aa'
              and member_id = '7a210000-0000-4000-8000-000000000002'), 1,
          'the blocker still sees their OWN membership row (join/leave unaffected)');       -- 44
select is((select count(*)::int from public.get_group_roster(
             '7a210000-0000-4000-8000-0000000000aa')), 1,
          'roster and row policy now agree for the blocker');                               -- 45

select set_config('request.jwt.claim.sub', '7a210000-0000-4000-8000-000000000007', true);
select is((select count(*)::int from public.group_members
            where group_id = '7a210000-0000-4000-8000-0000000000aa'
              and member_id = '7a210000-0000-4000-8000-000000000002'), 0,
          'the BLOCKED member cannot read the blocker''s row either (symmetric)');          -- 46
select is((select count(*)::int from public.group_members
            where group_id = '7a210000-0000-4000-8000-0000000000aa'
              and member_id = '7a210000-0000-4000-8000-000000000007'), 1,
          'the blocked member still sees their own membership row');                        -- 47

-- Joining and leaving are untouched by the narrowed SELECT policy.
select set_config('request.jwt.claim.sub', '7a210000-0000-4000-8000-000000000003', true);
select lives_ok(
  $$insert into public.group_members (group_id, member_id)
    values ('7a210000-0000-4000-8000-0000000000aa',
            '7a210000-0000-4000-8000-000000000003')$$,
  'a member of the group''s coach can still JOIN');                                         -- 48

with d as (
  delete from public.group_members
   where group_id = '7a210000-0000-4000-8000-0000000000aa'
     and member_id = '7a210000-0000-4000-8000-000000000003' returning 1)
select is((select count(*)::int from d), 1,
          'that member can still LEAVE (their own row stays visible to the DELETE)');       -- 49


-- ===========================================================================
-- Item 6. recordings_client is SELECT-for-authenticated only.
-- ===========================================================================
set local role postgres;
select is(has_table_privilege('authenticated', 'public.recordings_client', 'SELECT'), true,
          'recordings_client: authenticated keeps SELECT');                                 -- 50
select is(has_table_privilege('authenticated', 'public.recordings_client', 'INSERT'), false,
          'recordings_client: authenticated has NO INSERT');                                -- 51
select is(has_table_privilege('authenticated', 'public.recordings_client', 'UPDATE'), false,
          'recordings_client: authenticated has NO UPDATE');                                -- 52
select is(has_table_privilege('authenticated', 'public.recordings_client', 'DELETE'), false,
          'recordings_client: authenticated has NO DELETE');                                -- 53
select is(has_table_privilege('anon', 'public.recordings_client', 'SELECT'), false,
          'recordings_client: anon holds no privilege at all');                             -- 54


-- ===========================================================================
-- Item 7. choose_coach(): a coach with no coach_profiles row counts as ACCEPTING.
-- ===========================================================================
select is((select count(*)::int from public.coach_profiles
            where coach_id = '7a210000-0000-4000-8000-000000000006'), 0,
          'fixture: C2 has no coach_profiles row at all');                                  -- 55

set local role authenticated;
select set_config('request.jwt.claim.sub', '7a210000-0000-4000-8000-000000000009', true);
select lives_ok(
  $$select public.choose_coach('7a210000-0000-4000-8000-000000000006')$$,
  'a coach with no coach_profiles row can still be chosen (accepting_members opt-out)');    -- 56

select * from finish();

rollback;
