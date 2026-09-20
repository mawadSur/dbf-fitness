-- ============================================================================
-- 17_validators_and_crash_sweep.test.sql
--
-- The fixture-free half of the function audit:
--   * the three pure validators every CHECK constraint and every Realtime
--     authorization decision funnels through -- is_valid_note_checklist,
--     is_valid_specialties, presence_topic_uuid;
--   * a crash sweep that calls EVERY SECURITY DEFINER function in public as
--     anon, three times each.
--
-- Nothing here needs a row in any table, so this file creates no fixtures at
-- all. The stateful half of the same audit lives in 11_definer_functions.
--
-- Run with: supabase test db supabase/tests/database/17_validators_and_crash_sweep.test.sql
-- One transaction, rolled back.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;

-- SET LOCAL survives the SET ROLE switches below, so public.* and the pgTAP
-- assertions both resolve under every identity this file assumes.
set local search_path = public, extensions;

select plan(38);

-- ===========================================================================
-- is_valid_note_checklist -- the CHECK behind workout_notes.draft_content and
-- .edited_content. A member-visible JSON blob written by an LLM drafter, so
-- every rejection below is a real payload someone could push.
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a110000-0000-4000-8000-000000000002', true);

select is(auth.uid(), '7a110000-0000-4000-8000-000000000002'::uuid,
          'identity: the JWT claim drives auth.uid() (no profile row needed)');

select is(public.is_valid_note_checklist(null), true,
          'checklist: null content is allowed (a note may have no draft yet)');
select is(public.is_valid_note_checklist('not json at all'), false,
          'checklist: unparseable text is rejected, not raised');
select is(public.is_valid_note_checklist('[]'), false,
          'checklist: a top-level array is rejected');
select is(public.is_valid_note_checklist('"a string"'), false,
          'checklist: a top-level scalar is rejected');
select is(public.is_valid_note_checklist('{"items":[]}'), false,
          'checklist: a missing title is rejected');
select is(public.is_valid_note_checklist('{"title":1,"items":[]}'), false,
          'checklist: a non-string title is rejected');
select is(public.is_valid_note_checklist('{"title":"t"}'), false,
          'checklist: missing items is rejected');
select is(public.is_valid_note_checklist('{"title":"t","items":{}}'), false,
          'checklist: a non-array items is rejected');
select is(public.is_valid_note_checklist('{"title":"t","items":[1]}'), false,
          'checklist: a non-object item is rejected');
select is(public.is_valid_note_checklist(
            '{"title":"t","items":[{"text":"x","kind":"note"}]}'), false,
          'checklist: an item with no key is rejected');
select is(public.is_valid_note_checklist(
            '{"title":"t","items":[{"key":"","text":"x","kind":"note"}]}'), false,
          'checklist: an empty key is rejected');
select is(public.is_valid_note_checklist(
            '{"title":"t","items":[{"key":"a","kind":"note"}]}'), false,
          'checklist: an item with no text is rejected');
select is(public.is_valid_note_checklist(
            '{"title":"t","items":[{"key":"a","text":"x","kind":"cardio"}]}'), false,
          'checklist: an unknown kind is rejected');
select is(public.is_valid_note_checklist(
            '{"title":"t","items":[{"key":"a","text":"x","kind":"exercise","sets":"3"}]}'), false,
          'checklist: a string sets is rejected');
select is(public.is_valid_note_checklist(
            '{"title":"t","items":[{"key":"a","text":"x","kind":"exercise","reps":8}]}'), false,
          'checklist: a numeric reps is rejected');
select is(public.is_valid_note_checklist(
            '{"title":"t","items":[{"key":"a","text":"x","kind":"exercise","sets":3,"reps":"8"},'
            || '{"key":"b","text":"y","kind":"note"}]}'), true,
          'checklist: a well-formed two-item checklist is accepted');
select is(public.is_valid_note_checklist('{"title":"t","items":[]}'), true,
          'checklist: an empty items array is accepted');

-- ===========================================================================
-- is_valid_specialties -- the CHECK behind coach_profiles.specialties.
-- ===========================================================================
select is(public.is_valid_specialties(null), true,
          'specialties: null is allowed');
select is(public.is_valid_specialties('{}'::text[]), true,
          'specialties: the empty array is allowed');
select is(public.is_valid_specialties(
            array['a','b','c','d','e','f','g','h']), true,
          'specialties: exactly 8 entries is the inclusive maximum');
select is(public.is_valid_specialties(
            array['a','b','c','d','e','f','g','h','i']), false,
          'specialties: a 9th entry is rejected');
select is(public.is_valid_specialties(array['a', null]), false,
          'specialties: a null entry is rejected');
select is(public.is_valid_specialties(array['a', '   ']), false,
          'specialties: a whitespace-only entry is rejected');
select is(public.is_valid_specialties(array[repeat('x', 30)]), true,
          'specialties: a 30-character entry is the inclusive maximum');
select is(public.is_valid_specialties(array[repeat('x', 31)]), false,
          'specialties: a 31-character entry is rejected');

-- ===========================================================================
-- presence_topic_uuid -- the parser every Realtime authorization decision
-- funnels through. It must never raise: a raise here is a 500 on a websocket
-- join, and `null` must fall through to a denial, never to a match.
-- ===========================================================================
select is(public.presence_topic_uuid(null, 'group:'), null::uuid,
          'presence_topic_uuid: a null topic yields null');
select is(public.presence_topic_uuid('group:x', null), null::uuid,
          'presence_topic_uuid: a null prefix yields null');
select is(public.presence_topic_uuid(
            'live:7a110000-0000-4000-8000-0000000000c1', 'group:'), null::uuid,
          'presence_topic_uuid: the wrong prefix yields null, not a cross-kind match');
select is(public.presence_topic_uuid('group:not-a-uuid', 'group:'), null::uuid,
          'presence_topic_uuid: a malformed uuid yields null');
select is(public.presence_topic_uuid('group:', 'group:'), null::uuid,
          'presence_topic_uuid: a bare prefix yields null');
select is(public.presence_topic_uuid(
            'group:7a110000-0000-4000-8000-0000000000e1', 'group:'),
          '7a110000-0000-4000-8000-0000000000e1'::uuid,
          'presence_topic_uuid: a well-formed topic yields the uuid');
select is(public.presence_topic_uuid(
            'group:7A110000-0000-4000-8000-0000000000E1', 'group:'),
          '7a110000-0000-4000-8000-0000000000e1'::uuid,
          'presence_topic_uuid: hex case is accepted (the regex is case-insensitive)');
select lives_ok(
  $$select public.presence_topic_uuid('group:'';drop table public.profiles;--', 'group:')$$,
  'presence_topic_uuid: a hostile topic returns null rather than raising');


-- ===========================================================================
-- Crash sweep: every SECURITY DEFINER function in public, called as anon,
-- three times each. common.md records a Postgres 17.6 segfault in this exact
-- shape, so this is the regression net for it. apply_realtime_presence_policies
-- is excluded on purpose: it is DDL and other workers share this database.
-- ===========================================================================
reset role;
select is(
  (select array_agg(p.proname::text order by p.proname, p.oid)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.prorettype <> 'trigger'::regtype
      and p.proname <> 'apply_realtime_presence_policies'),
  array['can_join_group', 'can_join_live_class', 'can_manage_recording', 'can_read_published_notes', 'can_read_workout_note', 'can_see_live_class', 'can_use_group_presence_topic', 'can_use_live_class_presence_topic', 'can_use_presence_topic', 'choose_coach', 'get_group_roster', 'get_my_coach', 'get_subscription_state', 'has_earned_milestone', 'has_live_access', 'is_admin', 'is_assigned_diet_item', 'is_blocked_pair', 'is_coach_of_diet_plan', 'is_coach_of_member', 'is_coach_of_workout_day', 'is_coach_or_admin', 'is_fellow_group_member', 'is_member_of_diet_plan', 'list_coaches', 'live_class_exists', 'owns_workout_day', 'recording_coach_id', 'subscription_state_row']::text[],
  'sweep: the catalog holds exactly the 29 definers the sweep list names (a rename fails here)');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);

do $sweep$
declare
  v_calls text[] := array[
    'public.can_join_group(null::uuid)',
    'public.can_join_live_class(null::uuid)',
    'public.can_manage_recording(null::uuid)',
    'public.can_read_published_notes(null::uuid)',
    'public.can_read_workout_note(null::uuid)',
    'public.can_see_live_class(null::uuid)',
    'public.can_use_group_presence_topic(''group:7a110000-0000-4000-8000-0000000000e1'')',
    'public.can_use_live_class_presence_topic(''live:7a110000-0000-4000-8000-0000000000c1'')',
    'public.can_use_presence_topic(''group:not-a-uuid'')',
    'public.choose_coach(null::uuid)',
    'public.get_group_roster(null::uuid)',
    'public.get_my_coach()',
    'public.get_subscription_state()',
    'public.has_earned_milestone(null::uuid, ''first_day'')',
    'public.has_live_access(null::uuid)',
    'public.is_admin(null::uuid)',
    'public.is_assigned_diet_item(null::uuid)',
    'public.is_blocked_pair(null::uuid)',
    'public.is_coach_of_diet_plan(null::uuid)',
    'public.is_coach_of_member(null::uuid)',
    'public.is_coach_of_workout_day(null::uuid)',
    'public.is_coach_or_admin(null::uuid)',
    'public.is_fellow_group_member(null::uuid)',
    'public.is_member_of_diet_plan(null::uuid)',
    'public.list_coaches()',
    'public.live_class_exists(null::uuid)',
    'public.owns_workout_day(null::uuid)',
    'public.recording_coach_id(null::uuid)',
    'public.subscription_state_row(null::uuid)'
  ];
  v_bad  text[] := '{}';
  v_call text;
  v_i    int;
  v_n    int := 0;
begin
  for v_i in 1..3 loop
    foreach v_call in array v_calls loop
      v_n := v_n + 1;
      begin
        -- `select * from f(...)` works for scalar and set-returning alike.
        execute 'select count(*) from ' || v_call;
      exception when others then
        if not (v_call = any (v_bad)) then
          v_bad := v_bad || v_call;
        end if;
      end;
    end loop;
  end loop;
  perform set_config('app.s11_sweep_n', v_n::text, true);
  perform set_config('app.s11_sweep_bad', array_to_string(v_bad, ','), true);
end
$sweep$;

select is(current_setting('app.s11_sweep_n')::int, 87,
          'sweep: 29 definers x 3 calls each completed as anon');
select is(current_setting('app.s11_sweep_bad'),
          'public.choose_coach(null::uuid)',
          'sweep: the only definer that raises for anon is choose_coach (not_authenticated)');
select is((select count(*)::int from public.profiles), 0,
          'sweep: the backend is alive and RLS still denies anon after the sweep');


select * from finish();
rollback;
