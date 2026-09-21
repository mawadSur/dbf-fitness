-- ============================================================================
-- 32_push_token_lifecycle.test.sql
--
-- The Expo push-token RPCs added in 20260921140000_push_tokens_nudges.sql.
--
-- The property that matters here is REASSIGNMENT: a push token identifies a
-- HANDSET, not a person. When B signs in on A's phone, the row must move to B,
-- or A keeps receiving pushes meant for a device they no longer hold. The old
-- direct-insert path could not express that (its UNIQUE is (user_id, token)),
-- so it left both rows in place. Every "hijack" case below is really the same
-- question asked from the other side: can a reassignment be abused to silence
-- or read someone else's device? (No: unregister is caller-scoped and prune is
-- service-only.)
--
-- Objects under test:
--   public.is_expo_push_token(text)
--   public.register_push_token(text, text)
--   public.unregister_push_token(text)
--   public.prune_push_tokens(text[])
--   backward compatibility of the direct INSERT path on public.push_tokens
--
-- Run with: supabase test db supabase/tests/database/32_push_token_lifecycle.test.sql
-- One transaction, rolled back: no fixture survives this file.
-- Fixture prefix 7a32… is unique to this file.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;

-- SET LOCAL survives the SET ROLE switches below, so public.* and the pgTAP
-- assertions both resolve under every identity this file assumes.
set local search_path = public, extensions;

select plan(34);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'push32-' || u.n || '@test.invalid', 'x', now(), now()
from (values
  ('7a320000-0000-4000-8000-000000000001'::uuid, 1),
  ('7a320000-0000-4000-8000-000000000002'::uuid, 2),
  ('7a320000-0000-4000-8000-000000000003'::uuid, 3)
) as u(id, n);

insert into public.profiles (id, role, coach_id, full_name) values
  ('7a320000-0000-4000-8000-000000000001', 'coach',  null,                                   'P32 Coach'),
  ('7a320000-0000-4000-8000-000000000002', 'member', '7a320000-0000-4000-8000-000000000001', 'P32 Member A'),
  ('7a320000-0000-4000-8000-000000000003', 'member', '7a320000-0000-4000-8000-000000000001', 'P32 Member B');

-- ---------------------------------------------------------------------------
-- 1. Token format validation
-- ---------------------------------------------------------------------------

select ok(public.is_expo_push_token('ExponentPushToken[abcDEF123_-]'),
          'ExponentPushToken[...] is accepted');                                           -- 1
select ok(public.is_expo_push_token('ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx]'),
          'the shorter ExpoPushToken[...] spelling is accepted');                          -- 2
select ok(not public.is_expo_push_token('fcm:APA91bH-raw-device-id'),
          'a raw FCM id is rejected');                                                     -- 3
select ok(not public.is_expo_push_token(''), 'the empty string is rejected');              -- 4
select ok(not public.is_expo_push_token(null), 'null is rejected, not null-propagated');   -- 5
select ok(not public.is_expo_push_token('ExponentPushToken[abc'),
          'an unterminated token is rejected');                                            -- 6
select ok(not public.is_expo_push_token('prefix ExponentPushToken[abc]'),
          'the pattern is anchored: leading junk is rejected');                            -- 7

-- ---------------------------------------------------------------------------
-- 2. register_push_token: the happy path and its gates
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '7a320000-0000-4000-8000-000000000002', true);

select is(auth.uid(), '7a320000-0000-4000-8000-000000000002'::uuid,
          'identity check: running as member A');                                          -- 8

select lives_ok(
  $$select public.register_push_token('ExponentPushToken[p32-device-one]', 'ios')$$,
  'a member can register their own device');                                               -- 9

select is(
  (select count(*)::int from public.push_tokens
    where expo_push_token = 'ExponentPushToken[p32-device-one]'),
  1, 'exactly one row exists for the device');                                             -- 10

select is(
  (select user_id from public.push_tokens
    where expo_push_token = 'ExponentPushToken[p32-device-one]'),
  '7a320000-0000-4000-8000-000000000002'::uuid,
  'the row belongs to the caller');                                                        -- 11

select is(
  (select platform from public.push_tokens
    where expo_push_token = 'ExponentPushToken[p32-device-one]'),
  'ios', 'the platform is stored');                                                        -- 12

-- Re-registering the same device must not create a second row (the app calls this
-- on every cold start).
select lives_ok(
  $$select public.register_push_token('ExponentPushToken[p32-device-one]', 'ios')$$,
  'registering the same token twice is idempotent');                                       -- 13
select is(
  (select count(*)::int from public.push_tokens
    where expo_push_token = 'ExponentPushToken[p32-device-one]'),
  1, 'still exactly one row after the repeat call');                                       -- 14

select throws_ok(
  $$select public.register_push_token('not-an-expo-token', 'ios')$$,
  '22023', null, 'a malformed token is refused with 22023');                               -- 15

select throws_ok(
  $$select public.register_push_token('ExponentPushToken[p32-device-two]', 'blackberry')$$,
  '22023', null, 'an unknown platform is refused with 22023');                             -- 16

select is(
  (select count(*)::int from public.push_tokens
    where expo_push_token = 'ExponentPushToken[p32-device-two]'),
  0, 'nothing was written by the rejected call');                                          -- 17

-- ---------------------------------------------------------------------------
-- 3. Reassignment — the shared/handed-down device
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', '7a320000-0000-4000-8000-000000000003', true);
select is(auth.uid(), '7a320000-0000-4000-8000-000000000003'::uuid,
          'identity check: now running as member B on the same handset');                  -- 18

select lives_ok(
  $$select public.register_push_token('ExponentPushToken[p32-device-one]', 'ios')$$,
  'B registering A''s device succeeds');                                                   -- 19

select is(
  (select count(*)::int from public.push_tokens
    where expo_push_token = 'ExponentPushToken[p32-device-one]'),
  1, 'the device still has exactly ONE row (reassigned, not duplicated)');                 -- 20

select is(
  (select user_id from public.push_tokens
    where expo_push_token = 'ExponentPushToken[p32-device-one]'),
  '7a320000-0000-4000-8000-000000000003'::uuid,
  'the device now belongs to B, so A stops receiving pushes for it');                      -- 21

-- ---------------------------------------------------------------------------
-- 4. unregister_push_token is caller-scoped (the hijack case)
-- ---------------------------------------------------------------------------

-- A knows the token string (it was theirs a moment ago) and tries to silence B's device.
select set_config('request.jwt.claim.sub', '7a320000-0000-4000-8000-000000000002', true);

select lives_ok(
  $$select public.unregister_push_token('ExponentPushToken[p32-device-one]')$$,
  'unregistering a token the caller does not own does not error (no oracle)');             -- 22

-- Read back as postgres: push_tokens RLS hides B's row from A, so asking under A's
-- identity would report "no row" whether the delete happened or not.
reset role;
select is(
  (select user_id from public.push_tokens
    where expo_push_token = 'ExponentPushToken[p32-device-one]'),
  '7a320000-0000-4000-8000-000000000003'::uuid,
  'and it did NOT delete B''s row: A cannot silence another user''s device');              -- 23

-- B signing out removes their own row.
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a320000-0000-4000-8000-000000000003', true);
select lives_ok(
  $$select public.unregister_push_token('ExponentPushToken[p32-device-one]')$$,
  'B can unregister their own token');                                                     -- 24
reset role;
select is(
  (select count(*)::int from public.push_tokens
    where expo_push_token = 'ExponentPushToken[p32-device-one]'),
  0, 'the row is gone after sign-out (checked as postgres, past RLS)');                    -- 25

-- ---------------------------------------------------------------------------
-- 5. prune_push_tokens is service-only
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '7a320000-0000-4000-8000-000000000002', true);
select public.register_push_token('ExponentPushToken[p32-prune-me]', 'android');

select throws_ok(
  $$select public.prune_push_tokens(array['ExponentPushToken[p32-prune-me]'])$$,
  '42501', null, 'a member calling prune_push_tokens gets 42501');                         -- 26
select is(
  (select count(*)::int from public.push_tokens
    where expo_push_token = 'ExponentPushToken[p32-prune-me]'),
  1, 'the refused prune deleted nothing');                                                 -- 27

reset role;
select is(public.prune_push_tokens(array['ExponentPushToken[p32-prune-me]']), 1,
          'postgres/service_role may prune, and it reports one row removed');              -- 28
select is(public.prune_push_tokens(array[]::text[]), 0,
          'pruning an empty array is a no-op, not an error');                              -- 29
select is(public.prune_push_tokens(null), 0,
          'pruning null is a no-op, not an error');                                        -- 30

-- ---------------------------------------------------------------------------
-- 6. anon calls the definer functions DIRECTLY (must 42501, must not crash)
-- ---------------------------------------------------------------------------
-- This is the exact call shape that SIGSEGVs this Postgres when EXECUTE has
-- been revoked from the role, which is why these functions gate in the body
-- instead. The assertion is as much "the backend survived" as "it said 42501".

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is(auth.uid(), null, 'identity check: anon with no JWT claim');                     -- 31

select throws_ok(
  $$select public.register_push_token('ExponentPushToken[p32-anon]', 'ios')$$,
  '42501', null, 'anon register_push_token -> 42501');                                     -- 32
select throws_ok(
  $$select public.unregister_push_token('ExponentPushToken[p32-anon]')$$,
  '42501', null, 'anon unregister_push_token -> 42501');                                   -- 33
select throws_ok(
  $$select public.prune_push_tokens(array['ExponentPushToken[p32-anon]'])$$,
  '42501', null, 'anon prune_push_tokens -> 42501');                                       -- 34

reset role;

select * from finish();

rollback;
