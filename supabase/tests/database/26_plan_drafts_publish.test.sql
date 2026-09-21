-- ============================================================================
-- 26_plan_drafts_publish.test.sql
--
-- Pins migration 20260921111000_plan_drafts_publish.sql:
--   * the authorization matrix on workout_plan_drafts and both RPCs — the
--     member's CURRENT coach and admins only, never the member, never anon
--   * optimistic concurrency: 40001 stale_draft / stale_plan
--   * the diff-apply invariant that makes publishing safe mid-workout:
--     ROW IDS STAY STABLE and dropped rows are ARCHIVED, never deleted
--   * validation: https-only video URLs, bounds, and a malformed-jsonb fuzz
--     pass (wrong types, oversized arrays, unicode, unknown fields)
--
-- Run with: psql -X -f supabase/tests/database/26_plan_drafts_publish.test.sql
--        or supabase test db supabase/tests/database/26_plan_drafts_publish.test.sql
-- One transaction, rolled back. Fixture prefix 7a26... is unique to this file.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(50);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'h26-' || u.n || '@test.invalid', 'x', now(), now()
from (values
  ('7a260000-0000-4000-8000-000000000001'::uuid, 1),  -- current coach
  ('7a260000-0000-4000-8000-000000000002'::uuid, 2),  -- other coach
  ('7a260000-0000-4000-8000-000000000003'::uuid, 3),  -- member
  ('7a260000-0000-4000-8000-000000000006'::uuid, 6)   -- admin
) as u(id, n);

insert into public.profiles (id, role, coach_id, full_name) values
  ('7a260000-0000-4000-8000-000000000001', 'coach',  null, 'H26 Coach'),
  ('7a260000-0000-4000-8000-000000000002', 'coach',  null, 'H26 Other Coach'),
  ('7a260000-0000-4000-8000-000000000003', 'member', '7a260000-0000-4000-8000-000000000001', 'H26 Member'),
  ('7a260000-0000-4000-8000-000000000006', 'admin',  null, 'H26 Admin');

insert into public.workout_plans (id, member_id, coach_id, title, description) values
  ('7a260000-0000-4000-8000-0000000000a1', '7a260000-0000-4000-8000-000000000003',
   '7a260000-0000-4000-8000-000000000001', 'H26 Plan', 'before');

-- Day 1 is kept by the draft, day 2 is dropped by it. Both keep their ids so
-- the "ids are stable" assertions below mean something.
insert into public.workout_days (id, workout_plan_id, day_number, block_name, duration_minutes) values
  ('7a260000-0000-4000-8000-0000000000b1', '7a260000-0000-4000-8000-0000000000a1', 1, 'H26 Keep', 30),
  ('7a260000-0000-4000-8000-0000000000b2', '7a260000-0000-4000-8000-0000000000a1', 2, 'H26 Drop', 30);

insert into public.exercises (id, workout_day_id, name, reps_or_duration, order_index) values
  ('7a260000-0000-4000-8000-0000000000c1', '7a260000-0000-4000-8000-0000000000b1', 'H26 Keep Ex',  '3x10', 0),
  ('7a260000-0000-4000-8000-0000000000c2', '7a260000-0000-4000-8000-0000000000b1', 'H26 Drop Ex',  '3x10', 1),
  ('7a260000-0000-4000-8000-0000000000c3', '7a260000-0000-4000-8000-0000000000b2', 'H26 Day2 Ex',  '3x10', 0);

-- The member is mid-programme: a completion already points at the exercise the
-- coach is about to remove. It must survive the publish.
insert into public.workout_completions (id, member_id, workout_day_id, completed_at) values
  ('7a260000-0000-4000-8000-0000000000d1', '7a260000-0000-4000-8000-000000000003',
   '7a260000-0000-4000-8000-0000000000b2', now() - interval '2 days');
insert into public.exercise_completions (workout_completion_id, exercise_id) values
  ('7a260000-0000-4000-8000-0000000000d1', '7a260000-0000-4000-8000-0000000000c3');

-- A reusable valid draft: keeps day 1 (same id) with its first exercise (same
-- id), adds a brand-new exercise and a brand-new day, and drops day 2.
-- Held in a transaction-local GUC rather than a temp table: every role the
-- test switches to can read it, a temp table would be owner-only.
select set_config('h26.doc', $json${
  "title": "H26 Published",
  "description": "after",
  "unknown_root_field": "stripped",
  "days": [
    {
      "id": "7a260000-0000-4000-8000-0000000000b1",
      "day_number": 1,
      "block_name": "H26 Keep",
      "duration_minutes": 45,
      "exercises": [
        { "id": "7a260000-0000-4000-8000-0000000000c1", "position": 99,
          "name": "H26 Keep Ex", "exercise_key": "goblet-squat",
          "prescription": { "mode": "range", "sets": 4, "reps_min": 8, "reps_max": 12,
                            "rest_seconds": 60, "weight": 20, "weight_unit": "kg" },
          "detail": "chest up", "video_url": "https://example.com/a.mp4" },
        { "id": null, "position": 1, "name": "H26 New Ex",
          "prescription": { "mode": "seconds", "sets": 3, "seconds": 45 } }
      ]
    },
    {
      "id": null,
      "day_number": 2,
      "block_name": "H26 New Day",
      "duration_minutes": null,
      "exercises": [
        { "id": null, "position": 0, "name": "H26 New Day Ex",
          "prescription": { "mode": "amrap", "seconds": 300 } }
      ]
    }
  ]
}$json$, true);

-- ---------------------------------------------------------------------------
-- Authorization: who may autosave a draft.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '7a260000-0000-4000-8000-000000000003', true);

select is(auth.uid(), '7a260000-0000-4000-8000-000000000003'::uuid,
  '01 the member block really runs as the member');

select throws_ok(
  $$select public.save_plan_draft('7a260000-0000-4000-8000-0000000000a1', '{"days":[]}'::jsonb, 1)$$,
  '42501', null, '02 the member cannot autosave a draft of their own plan');

select throws_ok(
  $$select public.publish_plan('7a260000-0000-4000-8000-0000000000a1', 1)$$,
  '42501', null, '03 the member cannot publish their own plan');

select set_config('request.jwt.claim.sub', '7a260000-0000-4000-8000-000000000002', true);

select throws_ok(
  $$select public.save_plan_draft('7a260000-0000-4000-8000-0000000000a1', '{"days":[]}'::jsonb, 1)$$,
  '42501', null, '04 a coach who does not coach this member cannot autosave');

select throws_ok(
  $$select public.publish_plan('7a260000-0000-4000-8000-0000000000a1', 1)$$,
  '42501', null, '05 a coach who does not coach this member cannot publish');

select set_config('request.jwt.claim.sub', '7a260000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$select public.save_plan_draft('00000000-0000-4000-8000-00000000dead'::uuid, '{"days":[]}'::jsonb, 1)$$,
  'P0002', null, '06 an unknown plan id is plan_not_found, not a leak');

select throws_ok(
  $$select public.publish_plan('7a260000-0000-4000-8000-0000000000a1', 1)$$,
  'P0002', null, '07 publishing with no stored draft is draft_not_found');

-- ---------------------------------------------------------------------------
-- Optimistic concurrency and the autosave itself (still the current coach).
-- ---------------------------------------------------------------------------

select throws_ok(
  $$select public.save_plan_draft('7a260000-0000-4000-8000-0000000000a1',
      current_setting('h26.doc')::jsonb, 7)$$,
  '40001', null, '08 autosaving against a revision the plan is not on is stale_draft');

select is(
  (select public.save_plan_draft('7a260000-0000-4000-8000-0000000000a1',
     current_setting('h26.doc')::jsonb, 1)),
  1, '09 the current coach autosaves against rev 1 and gets rev 1 back');

select is(
  (select base_rev || '/' || updated_by::text from public.workout_plan_drafts
   where plan_id = '7a260000-0000-4000-8000-0000000000a1'),
  '1/7a260000-0000-4000-8000-000000000001',
  '10 the stored draft records the base revision and its author');

select is(
  (select count(*) from public.workout_plan_drafts
   where plan_id = '7a260000-0000-4000-8000-0000000000a1'),
  1::bigint, '11 the current coach can read the draft through RLS');

select set_config('request.jwt.claim.sub', '7a260000-0000-4000-8000-000000000003', true);
select is(
  (select count(*) from public.workout_plan_drafts
   where plan_id = '7a260000-0000-4000-8000-0000000000a1'),
  0::bigint, '12 the MEMBER never sees a draft of their own plan');

select throws_ok(
  $$insert into public.workout_plan_drafts (plan_id, draft, base_rev)
    values ('7a260000-0000-4000-8000-0000000000a1', '{"days":[]}'::jsonb, 1)$$,
  '42501', null, '13 the member cannot write the drafts table directly either');

select set_config('request.jwt.claim.sub', '7a260000-0000-4000-8000-000000000002', true);
select is(
  (select count(*) from public.workout_plan_drafts
   where plan_id = '7a260000-0000-4000-8000-0000000000a1'),
  0::bigint, '14 a coach who does not coach this member sees no draft');

select set_config('request.jwt.claim.sub', '7a260000-0000-4000-8000-000000000006', true);
select is(
  (select count(*) from public.workout_plan_drafts
   where plan_id = '7a260000-0000-4000-8000-0000000000a1'),
  1::bigint, '15 an admin can read the draft');

-- ---------------------------------------------------------------------------
-- publish_plan: the diff-apply.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', '7a260000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$select public.publish_plan('7a260000-0000-4000-8000-0000000000a1', 9)$$,
  '40001', null, '16 publishing against the wrong revision is stale_plan');

select is(
  (select public.publish_plan('7a260000-0000-4000-8000-0000000000a1', 1)),
  2, '17 publishing bumps the plan to revision 2');

select is(
  (select rev || '/' || title || '/' || description from public.workout_plans
   where id = '7a260000-0000-4000-8000-0000000000a1'),
  '2/H26 Published/after', '18 the plan header is the published one');

select is(
  (select count(*) from public.workout_plan_drafts
   where plan_id = '7a260000-0000-4000-8000-0000000000a1'),
  0::bigint, '19 publishing clears the draft');

set local role postgres;

select is(
  (select day_number || '/' || block_name || '/' || duration_minutes
   from public.workout_days
   where id = '7a260000-0000-4000-8000-0000000000b1' and archived_at is null),
  '1/H26 Keep/45', '20 the kept day KEEPS ITS ID and takes the edited fields');

select is(
  (select count(*) from public.workout_days
   where id = '7a260000-0000-4000-8000-0000000000b2' and archived_at is not null),
  1::bigint, '21 the dropped day is ARCHIVED, not deleted');

select ok(
  (select day_number < 0 from public.workout_days
   where id = '7a260000-0000-4000-8000-0000000000b2'),
  '22 the archived day is moved out of the way so its number can be reused');

select is(
  (select count(*) from public.workout_days
   where workout_plan_id = '7a260000-0000-4000-8000-0000000000a1'
     and archived_at is null and day_number = 2 and block_name = 'H26 New Day'),
  1::bigint, '23 the brand-new day was inserted at day 2');

select is(
  (select prescription_mode || '/' || sets || '/' || reps_min || '-' || reps_max
          || '/' || weight || weight_unit || '/' || order_index
   from public.exercises where id = '7a260000-0000-4000-8000-0000000000c1'),
  'range/4/8-12/20.00kg/0',
  '24 the kept exercise KEEPS ITS ID, takes the prescription, and is renumbered from array order');

select ok(
  (select reps_or_duration like '%8-12%' from public.exercises
   where id = '7a260000-0000-4000-8000-0000000000c1'),
  '25 reps_or_duration was re-derived from the structured prescription');

select is(
  (select detail || '|' || video_url || '|' || exercise_key from public.exercises
   where id = '7a260000-0000-4000-8000-0000000000c1'),
  'chest up|https://example.com/a.mp4|goblet-squat',
  '26 detail, video_url and exercise_key round-trip through the draft');

select is(
  (select count(*) from public.exercises
   where id = '7a260000-0000-4000-8000-0000000000c2' and archived_at is not null),
  1::bigint, '27 the exercise dropped from a KEPT day is archived, not deleted');

select is(
  (select count(*) from public.exercises
   where id = '7a260000-0000-4000-8000-0000000000c3' and archived_at is not null),
  1::bigint, '28 the exercise of a dropped day is archived too');

-- ---------------------------------------------------------------------------
-- The member who was mid-programme when the coach published.
-- ---------------------------------------------------------------------------

select is(
  (select count(*) from public.workout_completions
   where id = '7a260000-0000-4000-8000-0000000000d1'),
  1::bigint, '29 the completion logged against the dropped day survives the publish');

select is(
  (select count(*) from public.exercise_completions
   where workout_completion_id = '7a260000-0000-4000-8000-0000000000d1'
     and exercise_id = '7a260000-0000-4000-8000-0000000000c3'),
  1::bigint, '30 its exercise_completion still points at the archived exercise');

set local role authenticated;
select set_config('request.jwt.claim.sub', '7a260000-0000-4000-8000-000000000003', true);

select lives_ok(
  $$select public.finish_workout('7a260000-0000-4000-8000-0000000000b1',
      array['7a260000-0000-4000-8000-0000000000c1',
            '7a260000-0000-4000-8000-0000000000c2']::uuid[])$$,
  '31 the member can still finish the kept day right after a publish');

set local role postgres;

select is(
  (select count(*) from public.exercise_completions ec
   join public.workout_completions wc on wc.id = ec.workout_completion_id
   where wc.workout_day_id = '7a260000-0000-4000-8000-0000000000b1'
     and ec.exercise_id = '7a260000-0000-4000-8000-0000000000c2'),
  0::bigint, '32 finish_workout ignored the exercise the coach had just archived');

-- ---------------------------------------------------------------------------
-- Validation fuzz. plan_draft_normalize() is the single gate publish_plan
-- runs the document through, so it is the honest place to attack.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '7a260000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$select public.plan_draft_normalize(jsonb_set(current_setting('h26.doc')::jsonb,
      '{days,0,exercises,0,video_url}', '"http://example.com/x.mp4"'))$$,
  '22023', null, '33 a plain-http video_url is refused at validation time');

select throws_ok(
  $$select public.plan_draft_normalize('{"title":"t","days":{"not":"an array"}}'::jsonb)$$,
  '22023', null, '34 days must be an array');

select throws_ok(
  $$select public.plan_draft_normalize('{"title":42,"days":[]}'::jsonb)$$,
  '22023', null, '35 a numeric title is refused');

select throws_ok(
  $$select public.plan_draft_normalize('["not","an","object"]'::jsonb)$$,
  '22023', null, '36 a top-level array is refused');

select throws_ok(
  $$select public.plan_draft_normalize(jsonb_build_object(
      'title','t','days', jsonb_build_array(jsonb_build_object(
        'id', null, 'day_number', 1, 'block_name','b',
        'exercises', (select jsonb_agg(jsonb_build_object(
            'id', null, 'position', i, 'name','x',
            'prescription', jsonb_build_object('mode','reps','reps_min',10)))
          from generate_series(1,51) i)))))$$,
  '22023', null, '37 more than 50 exercises in one day is refused');

select throws_ok(
  $$select public.plan_draft_normalize(jsonb_build_object(
      'title','t','days', (select jsonb_agg(jsonb_build_object(
        'id', null, 'day_number', i, 'block_name','b', 'exercises','[]'::jsonb))
      from generate_series(1,32) i)))$$,
  '22023', null, '38 more than 31 days is refused');

select throws_ok(
  $$select public.plan_draft_normalize(jsonb_build_object(
      'title','t','days', jsonb_build_array(
        jsonb_build_object('id',null,'day_number',1,'block_name','a','exercises','[]'::jsonb),
        jsonb_build_object('id',null,'day_number',1,'block_name','b','exercises','[]'::jsonb))))$$,
  '22023', null, '39 the same day_number twice is refused');

select throws_ok(
  $$select public.plan_draft_normalize(jsonb_build_object(
      'title','t','days', jsonb_build_array(jsonb_build_object(
        'id',null,'day_number',1,'block_name','a','exercises',
        jsonb_build_array(jsonb_build_object('id',null,'position',0,'name','x'))))))$$,
  '22023', null, '40 an exercise with no prescription is refused');

select throws_ok(
  $$select public.plan_draft_normalize(jsonb_build_object(
      'title','t','days', jsonb_build_array(jsonb_build_object(
        'id',null,'day_number',1,'block_name','a','exercises',
        jsonb_build_array(jsonb_build_object('id',null,'position',0,'name','x',
          'prescription', jsonb_build_object('mode','reps','sets',3)))))))$$,
  '22023', null, '41 mode reps with no rep count is refused before it can break NOT NULL');

select throws_ok(
  $$select public.plan_draft_normalize(jsonb_build_object(
      'title', repeat('x', 300000), 'days','[]'::jsonb))$$,
  '22023', null, '42 a draft over the 256 kB limit is refused');

select is(
  (select public.plan_draft_normalize(jsonb_set(current_setting('h26.doc')::jsonb,
     '{title}', '"تمرين 💪 Día uno"')) ->> 'title'),
  'تمرين 💪 Día uno', '43 non-ASCII titles survive validation unchanged');

select is(
  (select public.plan_draft_normalize(current_setting('h26.doc')::jsonb)
     -> 'unknown_root_field'),
  null, '44 unknown fields are stripped from the canonical document');

-- ---------------------------------------------------------------------------
-- anon. Every new function must REFUSE, not crash the backend.
-- ---------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select is(auth.uid(), null, '45 the anon block really has no identity');

select throws_ok(
  $$select public.save_plan_draft('7a260000-0000-4000-8000-0000000000a1', '{"days":[]}'::jsonb, 1)$$,
  '42501', null, '46 anon calling save_plan_draft is refused, not crashed');

select throws_ok(
  $$select public.publish_plan('7a260000-0000-4000-8000-0000000000a1', 1)$$,
  '42501', null, '47 anon calling publish_plan is refused, not crashed');

select throws_ok(
  $$select public.plan_editor_gate('7a260000-0000-4000-8000-0000000000a1')$$,
  '42501', null, '48 anon calling plan_editor_gate is refused, not crashed');

select lives_ok(
  $$select public.plan_draft_normalize('{"title":"t","days":[{"id":null,"day_number":1,"block_name":"b","exercises":[]}]}'::jsonb)$$,
  '49 anon can call the pure validator without crashing the backend');

select is(
  (select count(*) from public.workout_plan_drafts),
  0::bigint, '50 anon reads no drafts at all');

select * from finish();
rollback;
