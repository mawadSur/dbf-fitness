-- ============================================================================
-- 15_notes_transcripts_rls.test.sql
--
-- Row-level security end to end for the recording -> transcript -> note ->
-- member-progress pipeline, plus the two policy-bearing tables no pgTAP file
-- touched at all (exercise_completions, coach_profiles).
--
-- Tables under test:
--   public.recordings            (4 policies + recordings_guard_client_writes)
--   public.transcripts           (2 policies)
--   public.workout_notes         (2 policies)
--   public.workout_note_progress (4 policies)
--   public.exercise_completions  (1 ALL policy -- no pgTAP coverage before)
--   public.coach_profiles        (4 policies -- no pgTAP coverage before)
--
-- Every table is probed as: the rightful actor, another member of the same
-- coach, an EXPIRED member, another coach's member, a coach of another coach,
-- an admin, a coachless stranger and anon. anon must always come back
-- clean-empty or cleanly denied -- never a crash.
--
-- Run with: supabase test db supabase/tests/database/15_notes_transcripts_rls.test.sql
-- One transaction, rolled back. Fixture prefix 7a15… is unique to this file.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;

-- SET LOCAL survives the SET ROLE switches below, so public.* and the pgTAP
-- assertions both resolve under every identity this file assumes.
set local search_path = public, extensions;

select plan(91);

-- ---------------------------------------------------------------------------
-- Fixtures (superuser, RLS bypassed, rolled back at the end).
--   ..01 coach A   ..02 member A1 ACTIVE   ..03 member A2 EXPIRED
--   ..04 coach B   ..05 member B1 ACTIVE   ..06 admin   ..07 stranger
--   ..c1 coach A's class
--   ..a1 coach A's PUBLISHED recording   ..a2 coach A's DRAFT recording
--   ..b1 published note on a1            ..b2 unpublished note on a1
--   ..1001 transcript on a1
--   coach A -> A1: plan ..2001, day ..3001, exercise ..4001, completion ..5001
--   coach B -> B1: plan ..2002, day ..3002, exercise ..4002, completion ..5002
--   ..6003 an EXPIRED member's existing checklist tick
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'nt15-' || u.n || '@test.invalid', 'x', now(), now()
from (values
  ('7a150000-0000-4000-8000-000000000001'::uuid, 1),
  ('7a150000-0000-4000-8000-000000000002'::uuid, 2),
  ('7a150000-0000-4000-8000-000000000003'::uuid, 3),
  ('7a150000-0000-4000-8000-000000000004'::uuid, 4),
  ('7a150000-0000-4000-8000-000000000005'::uuid, 5),
  ('7a150000-0000-4000-8000-000000000006'::uuid, 6),
  ('7a150000-0000-4000-8000-000000000007'::uuid, 7)
) as u(id, n);

insert into public.profiles (id, role, coach_id, full_name) values
  ('7a150000-0000-4000-8000-000000000001', 'coach',  null,                                   'S15 Coach A'),
  ('7a150000-0000-4000-8000-000000000002', 'member', '7a150000-0000-4000-8000-000000000001', 'S15 Member A1'),
  ('7a150000-0000-4000-8000-000000000003', 'member', '7a150000-0000-4000-8000-000000000001', 'S15 Member A2 Expired'),
  ('7a150000-0000-4000-8000-000000000004', 'coach',  null,                                   'S15 Coach B'),
  ('7a150000-0000-4000-8000-000000000005', 'member', '7a150000-0000-4000-8000-000000000004', 'S15 Member B1'),
  ('7a150000-0000-4000-8000-000000000006', 'admin',  null,                                   'S15 Admin'),
  ('7a150000-0000-4000-8000-000000000007', 'member', null,                                   'S15 Stranger');

insert into public.subscriptions (member_id, status, current_period_end) values
  ('7a150000-0000-4000-8000-000000000002', 'active',   now() + interval '30 days'),
  ('7a150000-0000-4000-8000-000000000003', 'past_due', now() - interval '40 days'),
  ('7a150000-0000-4000-8000-000000000005', 'active',   now() + interval '30 days');

insert into public.coach_profiles (coach_id, bio, specialties, accepting_members) values
  ('7a150000-0000-4000-8000-000000000001', 'S15 bio A', array['strength'], true),
  ('7a150000-0000-4000-8000-000000000004', 'S15 bio B', array['cardio'], true);

insert into public.live_classes (id, coach_id, title, agora_channel_name, starts_at, status) values
  ('7a150000-0000-4000-8000-0000000000c1', '7a150000-0000-4000-8000-000000000001',
   'S15 Coach A Class', 's15-coach-a-chan', now() + interval '1 hour', 'scheduled'),
  ('7a150000-0000-4000-8000-0000000000c2', '7a150000-0000-4000-8000-000000000004',
   'S15 Coach B Class', 's15-coach-b-chan', now() + interval '1 hour', 'scheduled');

insert into public.recordings (id, live_class_id, uploaded_by, storage_path, status) values
  ('7a150000-0000-4000-8000-0000000000a1', '7a150000-0000-4000-8000-0000000000c1',
   '7a150000-0000-4000-8000-000000000001',
   '7a150000-0000-4000-8000-000000000001/s15-published.m4a', 'published'),
  ('7a150000-0000-4000-8000-0000000000a2', '7a150000-0000-4000-8000-0000000000c1',
   '7a150000-0000-4000-8000-000000000001',
   '7a150000-0000-4000-8000-000000000001/s15-draft.m4a', 'draft');

insert into public.transcripts (id, recording_id, raw_text, provider) values
  ('7a150000-0000-4000-8000-000000001001', '7a150000-0000-4000-8000-0000000000a1',
   'S15 raw transcript text', 'mock');

insert into public.workout_notes (id, recording_id, created_by, draft_content, published_at) values
  ('7a150000-0000-4000-8000-0000000000b1', '7a150000-0000-4000-8000-0000000000a1',
   '7a150000-0000-4000-8000-000000000001',
   '{"title":"S15 Published","items":[{"key":"k1","text":"Squat","kind":"exercise","sets":3,"reps":"8"}]}',
   now()),
  ('7a150000-0000-4000-8000-0000000000b2', '7a150000-0000-4000-8000-0000000000a1',
   '7a150000-0000-4000-8000-000000000001',
   '{"title":"S15 Draft","items":[{"key":"k2","text":"Press","kind":"exercise"}]}',
   null);

insert into public.workout_plans (id, member_id, coach_id, title) values
  ('7a150000-0000-4000-8000-000000002001', '7a150000-0000-4000-8000-000000000002',
   '7a150000-0000-4000-8000-000000000001', 'S15 Plan A1'),
  ('7a150000-0000-4000-8000-000000002002', '7a150000-0000-4000-8000-000000000005',
   '7a150000-0000-4000-8000-000000000004', 'S15 Plan B1');
insert into public.workout_days (id, workout_plan_id, day_number, block_name) values
  ('7a150000-0000-4000-8000-000000003001', '7a150000-0000-4000-8000-000000002001', 1, 'S15 Day A1'),
  ('7a150000-0000-4000-8000-000000003002', '7a150000-0000-4000-8000-000000002002', 1, 'S15 Day B1');
insert into public.exercises (id, workout_day_id, name, reps_or_duration, order_index) values
  ('7a150000-0000-4000-8000-000000004001', '7a150000-0000-4000-8000-000000003001', 'S15 Squat', '3x8', 1),
  ('7a150000-0000-4000-8000-000000004002', '7a150000-0000-4000-8000-000000003002', 'S15 Row',   '3x8', 1);
insert into public.workout_completions (id, member_id, workout_day_id, status) values
  ('7a150000-0000-4000-8000-000000005001', '7a150000-0000-4000-8000-000000000002',
   '7a150000-0000-4000-8000-000000003001', 'completed'),
  ('7a150000-0000-4000-8000-000000005002', '7a150000-0000-4000-8000-000000000005',
   '7a150000-0000-4000-8000-000000003002', 'completed');

-- One progress row owned by the EXPIRED member, so "can they still clear it?"
-- is a real question below and not an empty-set tautology.
insert into public.workout_note_progress (id, member_id, note_id, item_key) values
  ('7a150000-0000-4000-8000-000000006003', '7a150000-0000-4000-8000-000000000003',
   '7a150000-0000-4000-8000-0000000000b1', 'k1');

-- ===========================================================================
-- recordings -- SELECT. The coach owns them; a paying member of that coach
-- sees ONLY the published ones; nobody else sees anything.
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000001', true);

select is(auth.uid(), '7a150000-0000-4000-8000-000000000001'::uuid,
          'identity: caller is coach A');                                                  -- 1
select is((select count(*)::int from public.recordings where id::text like '7a15%'), 2,
          'recordings: the uploading coach sees both of their recordings');                -- 2

select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000002', true);
select is((select count(*)::int from public.recordings where id::text like '7a15%'), 1,
          'recordings: an ACTIVE member of that coach sees only the PUBLISHED one');       -- 3
select is((select r.id from public.recordings r where r.id::text like '7a15%'),
          '7a150000-0000-4000-8000-0000000000a1'::uuid,
          'recordings: ...and it is the published one, not the draft');                    -- 4

select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000003', true);
select is((select count(*)::int from public.recordings where id::text like '7a15%'), 0,
          'recordings: an EXPIRED member of that coach sees none');                        -- 5
select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000005', true);
select is((select count(*)::int from public.recordings where id::text like '7a15%'), 0,
          'recordings: another coach''s ACTIVE member sees none');                         -- 6
select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000004', true);
select is((select count(*)::int from public.recordings where id::text like '7a15%'), 0,
          'recordings: a coach of another tenant sees none');                              -- 7
select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000006', true);
select is((select count(*)::int from public.recordings where id::text like '7a15%'), 0,
          'recordings: an admin is not a back door into another tenant''s media');         -- 8
select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000007', true);
select is((select count(*)::int from public.recordings where id::text like '7a15%'), 0,
          'recordings: a coachless stranger sees none');                                   -- 9

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is(auth.uid(), null::uuid, 'identity: anon has a null auth.uid()');                 -- 10
select is((select count(*)::int from public.recordings where id::text like '7a15%'), 0,
          'recordings: anon reads nothing (clean empty, no crash)');                       -- 11

-- ===========================================================================
-- recordings -- writes. The state machine belongs to the pipeline; the coach
-- may only create an `uploading` row and flip draft <-> published.
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$insert into public.recordings (id, live_class_id, uploaded_by, storage_path, status)
    values ('7a150000-0000-4000-8000-0000000000a3', '7a150000-0000-4000-8000-0000000000c1',
            '7a150000-0000-4000-8000-000000000001',
            '7a150000-0000-4000-8000-000000000001/s15-new.m4a', 'uploading')$$,
  'recordings: a coach may create an uploading row on their own class');                   -- 12
select throws_ok(
  $$insert into public.recordings (live_class_id, uploaded_by, status)
    values ('7a150000-0000-4000-8000-0000000000c1',
            '7a150000-0000-4000-8000-000000000001', 'published')$$,
  '42501', null,
  'recordings: a coach cannot insert straight into `published`');                          -- 13
select throws_ok(
  $$insert into public.recordings (live_class_id, uploaded_by, status)
    values ('7a150000-0000-4000-8000-0000000000c2',
            '7a150000-0000-4000-8000-000000000001', 'uploading')$$,
  '42501', null,
  'recordings: a coach cannot attach a recording to another coach''s class');              -- 14
select throws_ok(
  $$insert into public.recordings (live_class_id, uploaded_by, storage_path, status)
    values ('7a150000-0000-4000-8000-0000000000c1',
            '7a150000-0000-4000-8000-000000000001',
            '7a150000-0000-4000-8000-000000000004/s15-stolen.m4a', 'uploading')$$,
  '23514', null,
  'recordings: storage_path outside the uploader''s own prefix fails the CHECK');          -- 15
select throws_ok(
  $$insert into public.recordings (live_class_id, uploaded_by, storage_path, status)
    values ('7a150000-0000-4000-8000-0000000000c1',
            '7a150000-0000-4000-8000-000000000001',
            '7a150000-0000-4000-8000-000000000001/../x.m4a', 'uploading')$$,
  '23514', null,
  'recordings: a `..` traversal in storage_path fails the CHECK');                         -- 16

with u as (update public.recordings set status = 'published'
            where id = '7a150000-0000-4000-8000-0000000000a2' returning 1)
select is((select count(*)::int from u), 1,
          'recordings: the coach may publish their own draft');                            -- 17
with u as (update public.recordings set status = 'draft'
            where id = '7a150000-0000-4000-8000-0000000000a2' returning 1)
select is((select count(*)::int from u), 1,
          'recordings: ...and unpublish it again');                                        -- 18
select throws_ok(
  $$update public.recordings set status = 'transcribing'
     where id = '7a150000-0000-4000-8000-0000000000a2'$$,
  '42501', null,
  'recordings: every other status move belongs to the pipeline');                          -- 19
select throws_ok(
  $$update public.recordings set live_class_id = '7a150000-0000-4000-8000-0000000000c2'
     where id = '7a150000-0000-4000-8000-0000000000a2'$$,
  '42501', null,
  'recordings: a recording cannot be re-pointed at another class');                        -- 20
select throws_ok(
  $$update public.recordings set uploaded_by = '7a150000-0000-4000-8000-000000000004'
     where id = '7a150000-0000-4000-8000-0000000000a2'$$,
  '42501', null,
  'recordings: a recording cannot be re-attributed to another account');                   -- 21

select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000004', true);
with u as (update public.recordings set status = 'published'
            where id = '7a150000-0000-4000-8000-0000000000a2' returning 1)
select is((select count(*)::int from u), 0,
          'recordings: another coach''s UPDATE matches nothing');                          -- 22
with d as (delete from public.recordings
            where id = '7a150000-0000-4000-8000-0000000000a3' returning 1)
select is((select count(*)::int from d), 0,
          'recordings: another coach''s DELETE matches nothing');                          -- 23

select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000002', true);
with u as (update public.recordings set status = 'draft'
            where id = '7a150000-0000-4000-8000-0000000000a1' returning 1)
select is((select count(*)::int from u), 0,
          'recordings: a member cannot unpublish what they are allowed to read');          -- 24

select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000001', true);
with d as (delete from public.recordings
            where id = '7a150000-0000-4000-8000-0000000000a3' returning 1)
select is((select count(*)::int from d), 1,
          'recordings: the uploading coach may delete their own row');                     -- 25

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$insert into public.recordings (live_class_id, uploaded_by, status)
    values ('7a150000-0000-4000-8000-0000000000c1',
            '7a150000-0000-4000-8000-000000000001', 'uploading')$$,
  '42501', null,
  'recordings: anon cannot insert');                                                       -- 26

-- ===========================================================================
-- transcripts -- coach-only, both directions. A transcript is the raw audio in
-- text form, so a member must never reach it even for a published recording.
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000001', true);
select is((select count(*)::int from public.transcripts where id::text like '7a15%'), 1,
          'transcripts: the recording''s coach reads it');                                 -- 27
select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000002', true);
select is((select count(*)::int from public.transcripts where id::text like '7a15%'), 0,
          'transcripts: an ACTIVE member of that coach does NOT read the raw transcript'); -- 28
select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000003', true);
select is((select count(*)::int from public.transcripts where id::text like '7a15%'), 0,
          'transcripts: an EXPIRED member reads none');                                    -- 29
select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000005', true);
select is((select count(*)::int from public.transcripts where id::text like '7a15%'), 0,
          'transcripts: another coach''s member reads none');                              -- 30
select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000004', true);
select is((select count(*)::int from public.transcripts where id::text like '7a15%'), 0,
          'transcripts: a coach of another tenant reads none');                            -- 31
select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000006', true);
select is((select count(*)::int from public.transcripts where id::text like '7a15%'), 0,
          'transcripts: an admin reads none');                                             -- 32
select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000007', true);
select is((select count(*)::int from public.transcripts where id::text like '7a15%'), 0,
          'transcripts: a stranger reads none');                                           -- 33

select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$insert into public.transcripts (id, recording_id, raw_text, provider)
    values ('7a150000-0000-4000-8000-000000001002',
            '7a150000-0000-4000-8000-0000000000a2', 'S15 second', 'mock')$$,
  'transcripts: the coach may write a transcript for their own recording');                -- 34
with u as (update public.transcripts set raw_text = 'S15 edited'
            where id = '7a150000-0000-4000-8000-000000001002' returning 1)
select is((select count(*)::int from u), 1,
          'transcripts: ...and edit it');                                                  -- 35
with d as (delete from public.transcripts
            where id = '7a150000-0000-4000-8000-000000001002' returning 1)
select is((select count(*)::int from d), 1,
          'transcripts: ...and delete it');                                                -- 36

select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000004', true);
select throws_ok(
  $$insert into public.transcripts (recording_id, raw_text, provider)
    values ('7a150000-0000-4000-8000-0000000000a1', 'S15 forged', 'mock')$$,
  '42501', null,
  'transcripts: another coach cannot write into this tenant');                             -- 37
select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$insert into public.transcripts (recording_id, raw_text, provider)
    values ('7a150000-0000-4000-8000-0000000000a1', 'S15 member forged', 'mock')$$,
  '42501', null,
  'transcripts: a member cannot write one');                                               -- 38
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is((select count(*)::int from public.transcripts where id::text like '7a15%'), 0,
          'transcripts: anon reads nothing');                                              -- 39
select throws_ok(
  $$insert into public.transcripts (recording_id, raw_text, provider)
    values ('7a150000-0000-4000-8000-0000000000a1', 'S15 anon', 'mock')$$,
  '42501', null,
  'transcripts: anon cannot write one');                                                   -- 40

-- ===========================================================================
-- workout_notes -- the coach's draft desk, and the member's published view.
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000001', true);
select is((select count(*)::int from public.workout_notes where id::text like '7a15%'), 2,
          'workout_notes: the recording''s coach sees draft and published alike');         -- 41
select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000002', true);
select is((select count(*)::int from public.workout_notes where id::text like '7a15%'), 1,
          'workout_notes: an ACTIVE member sees only the published note');                 -- 42
select is((select n.id from public.workout_notes n where n.id::text like '7a15%'),
          '7a150000-0000-4000-8000-0000000000b1'::uuid,
          'workout_notes: ...and it is the published one');                                -- 43
select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000003', true);
select is((select count(*)::int from public.workout_notes where id::text like '7a15%'), 0,
          'workout_notes: an EXPIRED member sees none (the paywall)');                     -- 44
select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000005', true);
select is((select count(*)::int from public.workout_notes where id::text like '7a15%'), 0,
          'workout_notes: another coach''s member sees none');                             -- 45
select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000004', true);
select is((select count(*)::int from public.workout_notes where id::text like '7a15%'), 0,
          'workout_notes: a coach of another tenant sees none');                           -- 46
select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000006', true);
select is((select count(*)::int from public.workout_notes where id::text like '7a15%'), 0,
          'workout_notes: an admin sees none');                                            -- 47
select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000007', true);
select is((select count(*)::int from public.workout_notes where id::text like '7a15%'), 0,
          'workout_notes: a stranger sees none');                                          -- 48

select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$insert into public.workout_notes (id, recording_id, created_by, draft_content)
    values ('7a150000-0000-4000-8000-0000000000b3', '7a150000-0000-4000-8000-0000000000a2',
            '7a150000-0000-4000-8000-000000000001',
            '{"title":"S15 New","items":[{"key":"k3","text":"Hinge","kind":"note"}]}')$$,
  'workout_notes: the coach may draft a note on their own recording');                     -- 49
select throws_ok(
  $$insert into public.workout_notes (recording_id, created_by, draft_content)
    values ('7a150000-0000-4000-8000-0000000000a2', '7a150000-0000-4000-8000-000000000004',
            '{"title":"S15 X","items":[]}')$$,
  '42501', null,
  'workout_notes: created_by cannot be attributed to another account');                    -- 50
select throws_ok(
  $$insert into public.workout_notes (recording_id, created_by, draft_content)
    values ('7a150000-0000-4000-8000-0000000000a2', '7a150000-0000-4000-8000-000000000001',
            '{"title":"S15 Bad","items":[{"key":"","text":"x","kind":"note"}]}')$$,
  '23514', null,
  'workout_notes: a malformed checklist fails the CHECK, not silently stored');            -- 51
with u as (update public.workout_notes set published_at = now()
            where id = '7a150000-0000-4000-8000-0000000000b3' returning 1)
select is((select count(*)::int from u), 1,
          'workout_notes: the coach may publish their own note');                          -- 52

select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000002', true);
with u as (update public.workout_notes set edited_content = '{"title":"hax","items":[]}'
            where id = '7a150000-0000-4000-8000-0000000000b1' returning 1)
select is((select count(*)::int from u), 0,
          'workout_notes: a member cannot edit the note they can read');                   -- 53
select throws_ok(
  $$insert into public.workout_notes (recording_id, created_by, draft_content)
    values ('7a150000-0000-4000-8000-0000000000a1', '7a150000-0000-4000-8000-000000000002',
            '{"title":"S15 M","items":[]}')$$,
  '42501', null,
  'workout_notes: a member cannot create one');                                            -- 54
select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000004', true);
with d as (delete from public.workout_notes
            where id = '7a150000-0000-4000-8000-0000000000b1' returning 1)
select is((select count(*)::int from d), 0,
          'workout_notes: another coach cannot delete this tenant''s note');               -- 55
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is((select count(*)::int from public.workout_notes where id::text like '7a15%'), 0,
          'workout_notes: anon reads nothing');                                            -- 56
select throws_ok(
  $$insert into public.workout_notes (recording_id, draft_content)
    values ('7a150000-0000-4000-8000-0000000000a1', '{"title":"S15 A","items":[]}')$$,
  '42501', null,
  'workout_notes: anon cannot create one');                                                -- 57

-- ===========================================================================
-- workout_note_progress -- the member's own checklist ticks. Writing needs a
-- live subscription AND a readable note; reading is self-only, full stop.
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$insert into public.workout_note_progress (id, member_id, note_id, item_key)
    values ('7a150000-0000-4000-8000-000000006001', '7a150000-0000-4000-8000-000000000002',
            '7a150000-0000-4000-8000-0000000000b1', 'k1')$$,
  'note_progress: an ACTIVE member may tick an item on a published note');                 -- 58
select throws_ok(
  $$insert into public.workout_note_progress (member_id, note_id, item_key)
    values ('7a150000-0000-4000-8000-000000000002',
            '7a150000-0000-4000-8000-0000000000b2', 'k2')$$,
  '42501', null,
  'note_progress: ...but not on an UNPUBLISHED note');                                     -- 59
select throws_ok(
  $$insert into public.workout_note_progress (member_id, note_id, item_key)
    values ('7a150000-0000-4000-8000-000000000003',
            '7a150000-0000-4000-8000-0000000000b1', 'k9')$$,
  '42501', null,
  'note_progress: ...and not on another member''s behalf');                                -- 60
select is((select count(*)::int from public.workout_note_progress
            where id::text like '7a15%'), 1,
          'note_progress: the member sees only their own tick, not A2''s');                -- 61
with u as (update public.workout_note_progress set item_key = 'k1b'
            where id = '7a150000-0000-4000-8000-000000006001' returning 1)
select is((select count(*)::int from u), 1,
          'note_progress: an ACTIVE member may update their own tick');                    -- 62

select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$insert into public.workout_note_progress (member_id, note_id, item_key)
    values ('7a150000-0000-4000-8000-000000000003',
            '7a150000-0000-4000-8000-0000000000b1', 'k4')$$,
  '42501', null,
  'note_progress: an EXPIRED member cannot tick anything new');                            -- 63
select is((select count(*)::int from public.workout_note_progress
            where id::text like '7a15%'), 1,
          'note_progress: an EXPIRED member still READS their own existing ticks');        -- 64
with d as (delete from public.workout_note_progress
            where id = '7a150000-0000-4000-8000-000000006003' returning 1)
select is((select count(*)::int from d), 0,
          'note_progress: ...but cannot delete them (DELETE also needs live access)');     -- 65

select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000001', true);
select is((select count(*)::int from public.workout_note_progress
            where id::text like '7a15%'), 0,
          'note_progress: the coach cannot read their members'' checklist ticks');         -- 66
select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000006', true);
select is((select count(*)::int from public.workout_note_progress
            where id::text like '7a15%'), 0,
          'note_progress: an admin cannot read them either');                              -- 67

select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000002', true);
with d as (delete from public.workout_note_progress
            where id = '7a150000-0000-4000-8000-000000006001' returning 1)
select is((select count(*)::int from d), 1,
          'note_progress: an ACTIVE member may untick their own item');                    -- 68

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is((select count(*)::int from public.workout_note_progress
            where id::text like '7a15%'), 0,
          'note_progress: anon reads nothing');                                            -- 69
select throws_ok(
  $$insert into public.workout_note_progress (member_id, note_id, item_key)
    values ('7a150000-0000-4000-8000-000000000002',
            '7a150000-0000-4000-8000-0000000000b1', 'k5')$$,
  '42501', null,
  'note_progress: anon cannot tick anything');                                             -- 70

-- ===========================================================================
-- exercise_completions -- one ALL policy keyed on the parent completion's
-- owner. No pgTAP file touched this table before.
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$insert into public.exercise_completions (id, workout_completion_id, exercise_id)
    values ('7a150000-0000-4000-8000-000000007001',
            '7a150000-0000-4000-8000-000000005001',
            '7a150000-0000-4000-8000-000000004001')$$,
  'exercise_completions: a member may tick an exercise on their own completion');          -- 71
select is((select count(*)::int from public.exercise_completions
            where id::text like '7a15%'), 1,
          'exercise_completions: and reads it back');                                      -- 72
select throws_ok(
  $$insert into public.exercise_completions (workout_completion_id, exercise_id)
    values ('7a150000-0000-4000-8000-000000005002',
            '7a150000-0000-4000-8000-000000004002')$$,
  '42501', null,
  'exercise_completions: a member cannot write against another member''s completion');     -- 73

-- The defect this file used to record (the WITH CHECK constrained only the
-- PARENT completion's owner, never that exercise_id belonged to the same day, so
-- a member could attach any exercise in the database to their own completion) is
-- FIXED by the exercise_completions_enforce_day() trigger from 20260921100000
-- (plan_integrity). It now raises 23514 instead of accepting the row.
select throws_ok(
  $$insert into public.exercise_completions (id, workout_completion_id, exercise_id)
    values ('7a150000-0000-4000-8000-000000007002',
            '7a150000-0000-4000-8000-000000005001',
            '7a150000-0000-4000-8000-000000004002')$$,
  '23514',
  'exercise 7a150000-0000-4000-8000-000000004002 does not belong to the workout day of completion 7a150000-0000-4000-8000-000000005001',
  'exercise_completions: a cross-plan exercise_id is now REFUSED (day check added)');      -- 74

select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000005', true);
select is((select count(*)::int from public.exercise_completions
            where id::text like '7a15%'), 0,
          'exercise_completions: another member reads none of them');                      -- 75
-- 20260921100000 (plan_integrity) added exercise_completions_select_coach, so
-- the member's OWN coach now reads their ticked exercises (they need it to see
-- what was actually done). Another coach (75, above) still reads none.
select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000001', true);
select is((select count(*)::int from public.exercise_completions
            where id::text like '7a15%'), 1,
          'exercise_completions: the member''s own coach now reads them');                 -- 76
select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000002', true);
with d as (delete from public.exercise_completions
            where id = '7a150000-0000-4000-8000-000000007001' returning 1)
select is((select count(*)::int from d), 1,
          'exercise_completions: the owner may untick');                                   -- 77
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is((select count(*)::int from public.exercise_completions
            where id::text like '7a15%'), 0,
          'exercise_completions: anon reads nothing');                                     -- 78
select throws_ok(
  $$insert into public.exercise_completions (workout_completion_id, exercise_id)
    values ('7a150000-0000-4000-8000-000000005001',
            '7a150000-0000-4000-8000-000000004001')$$,
  '42501', null,
  'exercise_completions: anon cannot write');                                              -- 79

-- ===========================================================================
-- coach_profiles -- self-only for staff. Members reach a coach's bio through
-- list_coaches(), never through the base table.
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000001', true);
select is((select count(*)::int from public.coach_profiles
            where coach_id::text like '7a15%'), 1,
          'coach_profiles: a coach sees their own row and no other coach''s');             -- 80
with u as (update public.coach_profiles set bio = 'S15 bio A v2'
            where coach_id = '7a150000-0000-4000-8000-000000000001' returning 1)
select is((select count(*)::int from u), 1,
          'coach_profiles: a coach may edit their own row');                               -- 81
with u as (update public.coach_profiles set bio = 'S15 hijack'
            where coach_id = '7a150000-0000-4000-8000-000000000004' returning 1)
select is((select count(*)::int from u), 0,
          'coach_profiles: ...and not another coach''s');                                  -- 82
select throws_ok(
  $$update public.coach_profiles
       set specialties = array['a','b','c','d','e','f','g','h','i']
     where coach_id = '7a150000-0000-4000-8000-000000000001'$$,
  '23514', null,
  'coach_profiles: a 9-entry specialties array fails the CHECK');                          -- 83
select throws_ok(
  $$insert into public.coach_profiles (coach_id, bio)
    values ('7a150000-0000-4000-8000-000000000004', 'S15 forged')$$,
  '42501', null,
  'coach_profiles: a coach cannot create a row for another coach');                        -- 84

select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000002', true);
select is((select count(*)::int from public.coach_profiles
            where coach_id::text like '7a15%'), 0,
          'coach_profiles: a member cannot read the base table directly');                 -- 85
select cmp_ok((select count(*) from public.list_coaches() c
                where c.coach_id::text like '7a15%'), '>=', 1::bigint,
              'coach_profiles: ...but list_coaches() is the sanctioned way in');           -- 86
select throws_ok(
  $$insert into public.coach_profiles (coach_id, bio)
    values ('7a150000-0000-4000-8000-000000000002', 'S15 member bio')$$,
  '42501', null,
  'coach_profiles: a member cannot mint a coach profile for themselves');                  -- 87

select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000006', true);
select is((select count(*)::int from public.coach_profiles
            where coach_id::text like '7a15%'), 0,
          'coach_profiles: an admin has no cross-coach read on the base table');           -- 88
select set_config('request.jwt.claim.sub', '7a150000-0000-4000-8000-000000000001', true);
with d as (delete from public.coach_profiles
            where coach_id = '7a150000-0000-4000-8000-000000000001' returning 1)
select is((select count(*)::int from d), 1,
          'coach_profiles: a coach may delete their own row');                             -- 89

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is((select count(*)::int from public.coach_profiles
            where coach_id::text like '7a15%'), 0,
          'coach_profiles: anon reads nothing (clean empty, no crash)');                   -- 90
select throws_ok(
  $$insert into public.coach_profiles (coach_id, bio)
    values ('7a150000-0000-4000-8000-000000000001', 'S15 anon')$$,
  '42501', null,
  'coach_profiles: anon cannot write');                                                    -- 91

select * from finish();
rollback;
