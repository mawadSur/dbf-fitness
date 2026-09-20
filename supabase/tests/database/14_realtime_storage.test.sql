-- ============================================================================
-- 14_realtime_storage.test.sql
--
-- The two authorization surfaces that live outside the public schema:
--   * realtime.messages -- the PRIVATE presence/broadcast channels, gated by
--     can_use_presence_topic(realtime.topic());
--   * storage.objects   -- the `recordings` bucket, gated by
--     owns_recording_object(name) + is_coach_or_admin().
-- Plus get_group_roster's two filters (self-exclusion and the block filter),
-- which 01_ only probes at the "member sees >= 1 row" level.
--
-- These are exercised END TO END: real INSERT/SELECT/UPDATE/DELETE statements
-- under a real `set local role`, not just predicate calls. realtime.messages
-- is partitioned by inserted_at and today's partition exists, so the inserts
-- below are the same writes the Realtime server makes.
--
-- Run with: supabase test db supabase/tests/database/14_realtime_storage.test.sql
-- One transaction, rolled back. Fixture prefix 7a14… is unique to this file.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;

-- SET LOCAL survives the SET ROLE switches below, so public.*, storage.* and
-- the pgTAP assertions all resolve under every identity this file assumes.
set local search_path = public, extensions;

select plan(62);

-- ---------------------------------------------------------------------------
-- Fixtures (superuser, RLS bypassed, rolled back at the end).
--   ..01 coach A   ..02 member A1 ACTIVE   ..03 member A2 EXPIRED
--   ..04 coach B   ..05 member B1 ACTIVE   ..06 admin   ..07 stranger
--   ..c1 coach A's class     ..c2 coach B's class
--   ..e1 coach A's group (A1 + A2 are in it; coach A is NOT)
--   ..e2 coach B's group
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'rt14-' || u.n || '@test.invalid', 'x', now(), now()
from (values
  ('7a140000-0000-4000-8000-000000000001'::uuid, 1),
  ('7a140000-0000-4000-8000-000000000002'::uuid, 2),
  ('7a140000-0000-4000-8000-000000000003'::uuid, 3),
  ('7a140000-0000-4000-8000-000000000004'::uuid, 4),
  ('7a140000-0000-4000-8000-000000000005'::uuid, 5),
  ('7a140000-0000-4000-8000-000000000006'::uuid, 6),
  ('7a140000-0000-4000-8000-000000000007'::uuid, 7)
) as u(id, n);

insert into public.profiles (id, role, coach_id, full_name) values
  ('7a140000-0000-4000-8000-000000000001', 'coach',  null,                                   'S14 Coach A'),
  ('7a140000-0000-4000-8000-000000000002', 'member', '7a140000-0000-4000-8000-000000000001', 'S14 Member A1'),
  ('7a140000-0000-4000-8000-000000000003', 'member', '7a140000-0000-4000-8000-000000000001', 'S14 Member A2 Expired'),
  ('7a140000-0000-4000-8000-000000000004', 'coach',  null,                                   'S14 Coach B'),
  ('7a140000-0000-4000-8000-000000000005', 'member', '7a140000-0000-4000-8000-000000000004', 'S14 Member B1'),
  ('7a140000-0000-4000-8000-000000000006', 'admin',  null,                                   'S14 Admin'),
  ('7a140000-0000-4000-8000-000000000007', 'member', null,                                   'S14 Stranger');

insert into public.subscriptions (member_id, status, current_period_end) values
  ('7a140000-0000-4000-8000-000000000002', 'active',   now() + interval '30 days'),
  ('7a140000-0000-4000-8000-000000000003', 'past_due', now() - interval '40 days'),
  ('7a140000-0000-4000-8000-000000000005', 'active',   now() + interval '30 days');

insert into public.live_classes (id, coach_id, title, agora_channel_name, starts_at, status) values
  ('7a140000-0000-4000-8000-0000000000c1', '7a140000-0000-4000-8000-000000000001',
   'S14 Coach A Class', 's14-coach-a-chan', now() + interval '1 hour', 'scheduled'),
  ('7a140000-0000-4000-8000-0000000000c2', '7a140000-0000-4000-8000-000000000004',
   'S14 Coach B Class', 's14-coach-b-chan', now() + interval '1 hour', 'scheduled');

insert into public.groups (id, name, created_by) values
  ('7a140000-0000-4000-8000-0000000000e1', 'S14 Group A', '7a140000-0000-4000-8000-000000000001'),
  ('7a140000-0000-4000-8000-0000000000e2', 'S14 Group B', '7a140000-0000-4000-8000-000000000004');
insert into public.group_members (group_id, member_id) values
  ('7a140000-0000-4000-8000-0000000000e1', '7a140000-0000-4000-8000-000000000002'),
  ('7a140000-0000-4000-8000-0000000000e1', '7a140000-0000-4000-8000-000000000003'),
  ('7a140000-0000-4000-8000-0000000000e2', '7a140000-0000-4000-8000-000000000005');

-- A second bucket, so "the policies are scoped to `recordings`" is a real claim.
insert into storage.buckets (id, name, public) values ('s14-other', 's14-other', false);

insert into storage.objects (id, bucket_id, name, owner) values
  ('7a140000-0000-4000-8000-0000000000d1', 'recordings',
   '7a140000-0000-4000-8000-000000000001/s14-coach-a.m4a',
   '7a140000-0000-4000-8000-000000000001'),
  ('7a140000-0000-4000-8000-0000000000d2', 'recordings',
   '7a140000-0000-4000-8000-000000000004/s14-coach-b.m4a',
   '7a140000-0000-4000-8000-000000000004');

-- ===========================================================================
-- realtime.messages -- group presence. Authorization is by the per-channel
-- GUC `realtime.topic`, which the Realtime server sets when a client joins.
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a140000-0000-4000-8000-000000000002', true);
select set_config('realtime.topic', 'group:7a140000-0000-4000-8000-0000000000e1', true);

select is(auth.uid(), '7a140000-0000-4000-8000-000000000002'::uuid,
          'identity: caller is member A1');                                                -- 1
select is(realtime.topic(), 'group:7a140000-0000-4000-8000-0000000000e1',
          'identity: the channel GUC is A1''s own group topic');                           -- 2

select lives_ok(
  $$insert into realtime.messages (topic, extension, private, payload)
    values ('group:7a140000-0000-4000-8000-0000000000e1', 'broadcast', true, '{"s14":1}')$$,
  'realtime: a group member may broadcast on their own group topic');                      -- 3
select lives_ok(
  $$insert into realtime.messages (topic, extension, private, payload)
    values ('group:7a140000-0000-4000-8000-0000000000e1', 'presence', true, '{"s14":2}')$$,
  'realtime: presence is allowed on the same topic');                                      -- 4
select cmp_ok((select count(*) from realtime.messages
                where topic = 'group:7a140000-0000-4000-8000-0000000000e1'),
              '>=', 2::bigint,
              'realtime: the member can read back what they wrote');                       -- 5

select throws_ok(
  $$insert into realtime.messages (topic, extension, private, payload)
    values ('group:7a140000-0000-4000-8000-0000000000e1', 'postgres_changes', true, '{"s14":3}')$$,
  '42501', null,
  'realtime: only broadcast/presence extensions are writable, not postgres_changes');      -- 6

-- An EXPIRED member is still a group member: group chat presence is
-- deliberately NOT subscription-gated (only live classes are).
select set_config('request.jwt.claim.sub', '7a140000-0000-4000-8000-000000000003', true);
select lives_ok(
  $$insert into realtime.messages (topic, extension, private, payload)
    values ('group:7a140000-0000-4000-8000-0000000000e1', 'broadcast', true, '{"s14":4}')$$,
  'realtime: an EXPIRED member keeps group presence (only live is gated)');                -- 7

-- The group's creator is not a row in group_members, so they are not a fellow.
select set_config('request.jwt.claim.sub', '7a140000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$insert into realtime.messages (topic, extension, private, payload)
    values ('group:7a140000-0000-4000-8000-0000000000e1', 'broadcast', true, '{"s14":5}')$$,
  '42501', null,
  'realtime: the group''s creating coach is not a fellow member and is refused');          -- 8

select set_config('request.jwt.claim.sub', '7a140000-0000-4000-8000-000000000005', true);
select throws_ok(
  $$insert into realtime.messages (topic, extension, private, payload)
    values ('group:7a140000-0000-4000-8000-0000000000e1', 'broadcast', true, '{"s14":6}')$$,
  '42501', null,
  'realtime: another tenant''s member cannot join this group topic');                      -- 9
select is((select count(*) from realtime.messages
            where topic = 'group:7a140000-0000-4000-8000-0000000000e1'), 0::bigint,
          'realtime: and reads nothing on it either');                                     -- 10

select set_config('request.jwt.claim.sub', '7a140000-0000-4000-8000-000000000007', true);
select throws_ok(
  $$insert into realtime.messages (topic, extension, private, payload)
    values ('group:7a140000-0000-4000-8000-0000000000e1', 'broadcast', true, '{"s14":7}')$$,
  '42501', null,
  'realtime: a coachless stranger is refused');                                            -- 11

select set_config('request.jwt.claim.sub', '7a140000-0000-4000-8000-000000000006', true);
select throws_ok(
  $$insert into realtime.messages (topic, extension, private, payload)
    values ('group:7a140000-0000-4000-8000-0000000000e1', 'broadcast', true, '{"s14":8}')$$,
  '42501', null,
  'realtime: an admin has no group-presence override either');                             -- 12

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is(auth.uid(), null::uuid, 'identity: anon has a null auth.uid()');                 -- 13
select is((select count(*) from realtime.messages
            where topic = 'group:7a140000-0000-4000-8000-0000000000e1'), 0::bigint,
          'realtime: anon reads nothing (clean empty, no crash)');                         -- 14
select throws_ok(
  $$insert into realtime.messages (topic, extension, private, payload)
    values ('group:7a140000-0000-4000-8000-0000000000e1', 'broadcast', true, '{"s14":9}')$$,
  '42501', null,
  'realtime: anon cannot write to a private channel');                                     -- 15

-- ===========================================================================
-- realtime.messages -- live-class presence. Same surface, but now the
-- subscription gate is in play via can_join_live_class.
-- ===========================================================================
set local role authenticated;
select set_config('realtime.topic', 'live:7a140000-0000-4000-8000-0000000000c1', true);

select set_config('request.jwt.claim.sub', '7a140000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$insert into realtime.messages (topic, extension, private, payload)
    values ('live:7a140000-0000-4000-8000-0000000000c1', 'presence', true, '{"s14":10}')$$,
  'realtime/live: an ACTIVE member of that coach may join the class topic');               -- 16

select set_config('request.jwt.claim.sub', '7a140000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$insert into realtime.messages (topic, extension, private, payload)
    values ('live:7a140000-0000-4000-8000-0000000000c1', 'presence', true, '{"s14":11}')$$,
  '42501', null,
  'realtime/live: an EXPIRED member is refused the live topic (the paywall)');             -- 17

select set_config('request.jwt.claim.sub', '7a140000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$insert into realtime.messages (topic, extension, private, payload)
    values ('live:7a140000-0000-4000-8000-0000000000c1', 'presence', true, '{"s14":12}')$$,
  'realtime/live: the class''s own coach may join');                                       -- 18

select set_config('request.jwt.claim.sub', '7a140000-0000-4000-8000-000000000006', true);
select lives_ok(
  $$insert into realtime.messages (topic, extension, private, payload)
    values ('live:7a140000-0000-4000-8000-0000000000c1', 'presence', true, '{"s14":13}')$$,
  'realtime/live: a platform admin may join (is_admin branch)');                           -- 19

select set_config('request.jwt.claim.sub', '7a140000-0000-4000-8000-000000000004', true);
select throws_ok(
  $$insert into realtime.messages (topic, extension, private, payload)
    values ('live:7a140000-0000-4000-8000-0000000000c1', 'presence', true, '{"s14":14}')$$,
  '42501', null,
  'realtime/live: a coach of another tenant is refused');                                  -- 20

select set_config('request.jwt.claim.sub', '7a140000-0000-4000-8000-000000000005', true);
select throws_ok(
  $$insert into realtime.messages (topic, extension, private, payload)
    values ('live:7a140000-0000-4000-8000-0000000000c1', 'presence', true, '{"s14":15}')$$,
  '42501', null,
  'realtime/live: another coach''s ACTIVE member is refused');                             -- 21
select set_config('realtime.topic', 'live:7a140000-0000-4000-8000-0000000000c2', true);
select lives_ok(
  $$insert into realtime.messages (topic, extension, private, payload)
    values ('live:7a140000-0000-4000-8000-0000000000c2', 'presence', true, '{"s14":16}')$$,
  'realtime/live: ...but may join their OWN coach''s class');                              -- 22

-- Malformed and unknown topics must deny, never raise inside the predicate.
select set_config('request.jwt.claim.sub', '7a140000-0000-4000-8000-000000000002', true);
select set_config('realtime.topic', 'live:not-a-uuid', true);
select throws_ok(
  $$insert into realtime.messages (topic, extension, private, payload)
    values ('live:not-a-uuid', 'presence', true, '{"s14":17}')$$,
  '42501', null,
  'realtime: a malformed uuid in the topic denies (presence_topic_uuid -> null)');         -- 23
select set_config('realtime.topic', 'nonsense:anything', true);
select throws_ok(
  $$insert into realtime.messages (topic, extension, private, payload)
    values ('nonsense:anything', 'broadcast', true, '{"s14":18}')$$,
  '42501', null,
  'realtime: an unknown topic prefix denies (the else branch)');                           -- 24
select set_config('realtime.topic', '', true);
select is(realtime.topic(), null::text,
          'realtime: an empty channel GUC reads back as null');                            -- 25
select throws_ok(
  $$insert into realtime.messages (topic, extension, private, payload)
    values ('group:7a140000-0000-4000-8000-0000000000e1', 'broadcast', true, '{"s14":19}')$$,
  '42501', null,
  'realtime: with no channel GUC nothing is writable');                                    -- 26

-- Nobody but the pipeline may retract a presence/broadcast row.
select set_config('realtime.topic', 'group:7a140000-0000-4000-8000-0000000000e1', true);
select throws_ok(
  $$delete from realtime.messages
     where topic = 'group:7a140000-0000-4000-8000-0000000000e1'$$,
  '42501', null,
  'realtime: authenticated holds no DELETE on realtime.messages');                         -- 27

-- ---------------------------------------------------------------------------
-- DEFECT probes (recorded in the report, not fixed here): both policies
-- authorize on realtime.topic() -- the per-channel GUC -- and never compare it
-- to the row's own `topic` column. Over the websocket the server sets the GUC
-- to the channel being written, so these agree; over direct SQL they do not.
-- The realtime schema is NOT in PGRST_DB_SCHEMAS (public, graphql_public), so
-- this is defence-in-depth, not a reachable client bug. Asserted so that a
-- future change of either fact is caught here.
-- ---------------------------------------------------------------------------
reset role;
insert into realtime.messages (topic, extension, private, payload)
values ('group:7a140000-0000-4000-8000-0000000000e2', 'broadcast', true, '{"s14":"foreign"}');

set local role authenticated;
select set_config('request.jwt.claim.sub', '7a140000-0000-4000-8000-000000000002', true);
select set_config('realtime.topic', 'group:7a140000-0000-4000-8000-0000000000e1', true);
select cmp_ok((select count(*) from realtime.messages
                where topic = 'group:7a140000-0000-4000-8000-0000000000e2'),
              '>=', 1::bigint,
              'realtime DEFECT: SELECT authorizes on the GUC, so a foreign topic''s rows are visible'); -- 28
select lives_ok(
  $$insert into realtime.messages (topic, extension, private, payload)
    values ('group:7a140000-0000-4000-8000-0000000000e2', 'broadcast', true, '{"s14":"forged"}')$$,
  'realtime DEFECT: WITH CHECK authorizes on the GUC, so the row topic can be foreign');   -- 29

-- ===========================================================================
-- storage.objects -- the `recordings` bucket.
--   SELECT: owns_recording_object(name)
--   INSERT/UPDATE/DELETE: + is_coach_or_admin()
-- ===========================================================================
select set_config('request.jwt.claim.sub', '7a140000-0000-4000-8000-000000000001', true);
select is(auth.uid(), '7a140000-0000-4000-8000-000000000001'::uuid,
          'identity: caller is coach A');                                                  -- 30

select is((select count(*)::int from storage.objects
            where bucket_id = 'recordings' and name like '7a14%'), 1,
          'storage: coach A sees exactly their own object');                               -- 31
select is((select count(*)::int from storage.objects
            where id = '7a140000-0000-4000-8000-0000000000d2'), 0,
          'storage: coach A cannot see coach B''s object');                                -- 32

select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('recordings', '7a140000-0000-4000-8000-000000000001/s14-new.m4a',
            '7a140000-0000-4000-8000-000000000001')$$,
  'storage: a coach may upload under their own uid prefix');                               -- 33
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('recordings', '7a140000-0000-4000-8000-000000000004/s14-stolen.m4a',
            '7a140000-0000-4000-8000-000000000001')$$,
  '42501', null,
  'storage: a coach cannot upload under another coach''s uid prefix');                     -- 34
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('recordings', '7a140000-0000-4000-8000-000000000001/../7a140000-0000-4000-8000-000000000004/x.m4a',
            '7a140000-0000-4000-8000-000000000001')$$,
  '42501', null,
  'storage: a `..` traversal inside an owned prefix is refused');                          -- 35
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('s14-other', '7a140000-0000-4000-8000-000000000001/s14-elsewhere.m4a',
            '7a140000-0000-4000-8000-000000000001')$$,
  '42501', null,
  'storage: the policies are scoped to `recordings`; another bucket has none'); -- 36

with u as (update storage.objects
              set name = '7a140000-0000-4000-8000-000000000001/s14-renamed.m4a'
            where id = '7a140000-0000-4000-8000-0000000000d1' returning 1)
select is((select count(*)::int from u), 1,
          'storage: a coach may rename within their own prefix');                          -- 37
select throws_ok(
  $$update storage.objects
       set name = '7a140000-0000-4000-8000-000000000004/s14-moved.m4a'
     where id = '7a140000-0000-4000-8000-0000000000d1'$$,
  '42501', null,
  'storage: a coach cannot move an object into another coach''s prefix');                  -- 38

select set_config('request.jwt.claim.sub', '7a140000-0000-4000-8000-000000000004', true);
with u as (update storage.objects
              set name = '7a140000-0000-4000-8000-000000000004/s14-hijack.m4a'
            where id = '7a140000-0000-4000-8000-0000000000d1' returning 1)
select is((select count(*)::int from u), 0,
          'storage: coach B''s UPDATE matches none of coach A''s objects');                -- 39

-- A member of the coach's own tenant is not an uploader.
select set_config('request.jwt.claim.sub', '7a140000-0000-4000-8000-000000000002', true);
select is((select count(*)::int from storage.objects
            where bucket_id = 'recordings' and name like '7a14%'), 0,
          'storage: a member sees no recording objects at all');                           -- 40
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('recordings', '7a140000-0000-4000-8000-000000000002/s14-member.m4a',
            '7a140000-0000-4000-8000-000000000002')$$,
  '42501', null,
  'storage: a member cannot upload even under their OWN prefix (is_coach_or_admin)');      -- 41

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is((select count(*)::int from storage.objects
            where bucket_id = 'recordings' and name like '7a14%'), 0,
          'storage: anon reads nothing (clean empty, no crash)');                          -- 42
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('recordings', '7a140000-0000-4000-8000-000000000001/s14-anon.m4a', null)$$,
  '42501', null,
  'storage: anon cannot upload');                                                          -- 43

-- DELETE is additionally fenced by storage.protect_delete, a STATEMENT trigger
-- that refuses every direct delete unless storage.allow_delete_query is set.
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a140000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$delete from storage.objects where id = '7a140000-0000-4000-8000-0000000000d1'$$,
  '42501', null,
  'storage: even the owner''s direct DELETE is refused without the Storage API');          -- 44

select set_config('storage.allow_delete_query', 'true', true);
select set_config('request.jwt.claim.sub', '7a140000-0000-4000-8000-000000000002', true);
with d as (delete from storage.objects
            where id = '7a140000-0000-4000-8000-0000000000d1' returning 1)
select is((select count(*)::int from d), 0,
          'storage: with the trigger bypassed, a member still deletes nothing (RLS holds)'); -- 45
select set_config('request.jwt.claim.sub', '7a140000-0000-4000-8000-000000000004', true);
with d as (delete from storage.objects
            where id = '7a140000-0000-4000-8000-0000000000d1' returning 1)
select is((select count(*)::int from d), 0,
          'storage: another coach deletes nothing either');                                -- 46
select set_config('request.jwt.claim.sub', '7a140000-0000-4000-8000-000000000001', true);
with d as (delete from storage.objects
            where id = '7a140000-0000-4000-8000-0000000000d1' returning 1)
select is((select count(*)::int from d), 1,
          'storage: the owning coach deletes their own object');                           -- 47
select set_config('storage.allow_delete_query', 'false', true);

-- ===========================================================================
-- owns_recording_object -- the path predicate every storage policy calls.
-- 01_ checks the demoted-coach case; these are the path-shape edges.
-- ===========================================================================
select is(public.owns_recording_object(null), false,
          'owns_recording_object: a null name is false');                                  -- 48
select is(public.owns_recording_object(
            '7a140000-0000-4000-8000-000000000001/' || repeat('x', 512)), false,
          'owns_recording_object: a name over 512 chars is false');                        -- 49
select is(public.owns_recording_object(
            '7a140000-0000-4000-8000-000000000001/../etc/passwd'), false,
          'owns_recording_object: any `..` anywhere is false');                            -- 50
select is(public.owns_recording_object(
            '7a140000-0000-4000-8000-000000000004/take.m4a'), false,
          'owns_recording_object: another uid''s prefix is false');                        -- 51
select is(public.owns_recording_object(
            '7a140000-0000-4000-8000-000000000001x/take.m4a'), false,
          'owns_recording_object: a uid that is only a PREFIX of the path is false');      -- 52
select is(public.owns_recording_object(
            '7a140000-0000-4000-8000-000000000001'), false,
          'owns_recording_object: the bare uid with no slash is false');                   -- 53
select is(public.owns_recording_object(
            '7a140000-0000-4000-8000-000000000001/a/b/c.m4a'), true,
          'owns_recording_object: nested paths under the owned prefix are true');          -- 54

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is(public.owns_recording_object(
            '7a140000-0000-4000-8000-000000000001/take.m4a'), false,
          'owns_recording_object: anon owns nothing');                                     -- 55

-- ===========================================================================
-- get_group_roster -- self-exclusion and the bidirectional block filter.
-- ===========================================================================
reset role;
insert into public.user_blocks (blocker_id, blocked_id) values
  ('7a140000-0000-4000-8000-000000000002', '7a140000-0000-4000-8000-000000000003');

set local role authenticated;
select set_config('request.jwt.claim.sub', '7a140000-0000-4000-8000-000000000002', true);
select is((select count(*)::int from public.get_group_roster(
             '7a140000-0000-4000-8000-0000000000e1')), 0,
          'roster: the blocker no longer sees the member they blocked');                   -- 56

-- The filter is bidirectional: the blocked party must not see the blocker
-- either, or the block is trivially detectable.
select set_config('request.jwt.claim.sub', '7a140000-0000-4000-8000-000000000003', true);
select is((select count(*)::int from public.get_group_roster(
             '7a140000-0000-4000-8000-0000000000e1')), 0,
          'roster: the blocked member no longer sees the blocker either');                 -- 57

reset role;
delete from public.user_blocks
 where blocker_id = '7a140000-0000-4000-8000-000000000002'
   and blocked_id = '7a140000-0000-4000-8000-000000000003';

set local role authenticated;
select set_config('request.jwt.claim.sub', '7a140000-0000-4000-8000-000000000002', true);
select is((select count(*)::int from public.get_group_roster(
             '7a140000-0000-4000-8000-0000000000e1')), 1,
          'roster: with the block lifted, the fellow member is visible again');            -- 58
select is((select r.member_id from public.get_group_roster(
             '7a140000-0000-4000-8000-0000000000e1') r),
          '7a140000-0000-4000-8000-000000000003'::uuid,
          'roster: and the caller is excluded from their own roster');                     -- 59

select set_config('request.jwt.claim.sub', '7a140000-0000-4000-8000-000000000001', true);
select is((select count(*)::int from public.get_group_roster(
             '7a140000-0000-4000-8000-0000000000e1')), 0,
          'roster: the creating coach is not a fellow, so gets no roster');                -- 60
select set_config('request.jwt.claim.sub', '7a140000-0000-4000-8000-000000000005', true);
select is((select count(*)::int from public.get_group_roster(
             '7a140000-0000-4000-8000-0000000000e1')), 0,
          'roster: another tenant''s member gets nothing');                                -- 61

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is((select count(*)::int from public.get_group_roster(
             '7a140000-0000-4000-8000-0000000000e1')), 0,
          'roster: anon gets nothing (clean empty, no crash)');                            -- 62

select * from finish();
rollback;
