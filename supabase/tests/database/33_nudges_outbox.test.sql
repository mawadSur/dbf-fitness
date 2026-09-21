-- ============================================================================
-- 33_nudges_outbox.test.sql
--
-- Coach nudges and the notification outbox
-- (20260921140000_push_tokens_nudges.sql, 20260921141000_notification_outbox.sql).
--
-- Two properties carry this file:
--   * A nudge is a COACH speaking to a member's lock screen, so the authority
--     is the member's CURRENT coach (profiles.coach_id) and the words are
--     chosen server-side from an allowlist. A former coach, another coach, the
--     member themselves and anon must all be refused, and no caller may supply
--     text.
--   * The outbox is the only delivery path, and its safety comes from three
--     database-level facts, each asserted here rather than assumed: the UNIQUE
--     dedupe_key (double enqueue is a no-op), the LEASE (a claimed row is not
--     handed out twice, and a crashed drain's row comes back), and the
--     service-only gate on claim/complete/fail.
--
-- The genuine two-session FOR UPDATE SKIP LOCKED proof needs committed rows and
-- so cannot live in this rolled-back transaction; it is run separately (see the
-- D3 report). What IS asserted here is the observable consequence a second
-- drain sees: a leased row is not re-claimed, an expired lease is.
--
-- Run with: supabase test db supabase/tests/database/33_nudges_outbox.test.sql
-- One transaction, rolled back: no fixture survives this file.
-- Fixture prefix 7a33… is unique to this file.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(46);

-- ---------------------------------------------------------------------------
-- Fixtures: two coaches, an admin, an entitled member, a lapsed member
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'nudge33-' || u.n || '@test.invalid', 'x', now(), now()
from (values
  ('7a330000-0000-4000-8000-000000000001'::uuid, 1),  -- coach A (current coach)
  ('7a330000-0000-4000-8000-000000000002'::uuid, 2),  -- coach B (former coach)
  ('7a330000-0000-4000-8000-000000000003'::uuid, 3),  -- member, active subscription
  ('7a330000-0000-4000-8000-000000000004'::uuid, 4),  -- member, expired subscription
  ('7a330000-0000-4000-8000-000000000005'::uuid, 5)   -- admin
) as u(id, n);

insert into public.profiles (id, role, coach_id, full_name) values
  ('7a330000-0000-4000-8000-000000000001', 'coach',  null,                                   'N33 Coach A'),
  ('7a330000-0000-4000-8000-000000000002', 'coach',  null,                                   'N33 Coach B'),
  ('7a330000-0000-4000-8000-000000000003', 'member', '7a330000-0000-4000-8000-000000000001', 'N33 Active Member'),
  ('7a330000-0000-4000-8000-000000000004', 'member', '7a330000-0000-4000-8000-000000000001', 'N33 Lapsed Member'),
  ('7a330000-0000-4000-8000-000000000005', 'admin',  null,                                   'N33 Admin');

insert into public.subscriptions (member_id, status, current_period_end) values
  ('7a330000-0000-4000-8000-000000000003', 'active',   now() + interval '20 days'),
  -- Past the 10-day grace boundary: no access, so no nudge.
  ('7a330000-0000-4000-8000-000000000004', 'past_due', now() - interval '30 days');

-- ---------------------------------------------------------------------------
-- 1. nudge_copy is the single source of the words
-- ---------------------------------------------------------------------------

select is((select count(*)::int from public.nudge_copy('check_in')), 1,
          'check_in resolves to exactly one copy row');                                    -- 1
select is((select count(*)::int from public.nudge_copy('missed_workout')), 1,
          'missed_workout resolves to exactly one copy row');                              -- 2
select is((select count(*)::int from public.nudge_copy('great_work')), 1,
          'great_work resolves to exactly one copy row');                                  -- 3
select is((select count(*)::int from public.nudge_copy('<script>alert(1)</script>')), 0,
          'an unknown template resolves to nothing, which is how send_nudge rejects it');  -- 4

-- ---------------------------------------------------------------------------
-- 2. send_nudge: the current coach, happy path
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '7a330000-0000-4000-8000-000000000001', true);
select is(auth.uid(), '7a330000-0000-4000-8000-000000000001'::uuid,
          'identity check: running as coach A');                                           -- 5

select lives_ok(
  $$select public.send_nudge('7a330000-0000-4000-8000-000000000003', 'check_in')$$,
  'the current coach can nudge their entitled member');                                    -- 6

reset role;
select is(
  (select count(*)::int from public.nudges
    where member_id = '7a330000-0000-4000-8000-000000000003'),
  1, 'one nudge row was written');                                                         -- 7

select is(
  (select count(*)::int from public.notification_outbox
    where user_id = '7a330000-0000-4000-8000-000000000003' and kind = 'nudge'),
  1, 'and it ENQUEUED exactly one outbox row (never pushed inline)');                      -- 8

select is(
  (select title from public.notification_outbox
    where user_id = '7a330000-0000-4000-8000-000000000003' and kind = 'nudge'),
  'A note from your coach',
  'the push text came from nudge_copy, not from the caller');                              -- 9

select is(
  (select payload->>'route' from public.notification_outbox
    where user_id = '7a330000-0000-4000-8000-000000000003' and kind = 'nudge'),
  '/(tabs)', 'the tap route is one of the allowlisted app routes');                        -- 10

select is(
  (select status from public.notification_outbox
    where user_id = '7a330000-0000-4000-8000-000000000003' and kind = 'nudge'),
  'queued', 'the row starts queued, waiting for the drain');                               -- 11

-- ---------------------------------------------------------------------------
-- 3. send_nudge: the spam limit and the template allowlist
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '7a330000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$select public.send_nudge('7a330000-0000-4000-8000-000000000003', 'great_work')$$,
  '23505', 'already_nudged_today',
  'a second nudge the same day is refused by the UNIQUE, with a stable message');          -- 12

select throws_ok(
  $$select public.send_nudge('7a330000-0000-4000-8000-000000000003', 'you owe me money')$$,
  '22023', null, 'a template outside the allowlist is refused (no free text)');            -- 13

-- The lapsed member: a "come back and train" push landing on a paywall is worse
-- than silence, and agora-rtc-token would refuse them anyway.
select throws_ok(
  $$select public.send_nudge('7a330000-0000-4000-8000-000000000004', 'check_in')$$,
  '42501', null, 'a member past the grace period cannot be nudged');                       -- 14

reset role;
select is(
  (select count(*)::int from public.notification_outbox
    where user_id = '7a330000-0000-4000-8000-000000000004'),
  0, 'and nothing was enqueued for them');                                                 -- 15

-- ---------------------------------------------------------------------------
-- 4. send_nudge: the authorization matrix
-- ---------------------------------------------------------------------------

-- Coach B is not this member's coach.
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a330000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select public.send_nudge('7a330000-0000-4000-8000-000000000003', 'check_in')$$,
  '42501', null, 'another coach cannot nudge someone else''s member');                     -- 16

-- The member themselves.
select set_config('request.jwt.claim.sub', '7a330000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select public.send_nudge('7a330000-0000-4000-8000-000000000003', 'check_in')$$,
  '42501', null, 'a member cannot nudge themselves (or anyone)');                          -- 17

-- The admin may, and gets their own per-day slot (the UNIQUE is per coach).
select set_config('request.jwt.claim.sub', '7a330000-0000-4000-8000-000000000005', true);
select lives_ok(
  $$select public.send_nudge('7a330000-0000-4000-8000-000000000003', 'great_work')$$,
  'an admin can nudge any member');                                                        -- 18

-- FORMER COACH: authority follows profiles.coach_id, so moving the member to
-- coach B must flip both directions at once.
reset role;
update public.profiles
   set coach_id = '7a330000-0000-4000-8000-000000000002'
 where id = '7a330000-0000-4000-8000-000000000003';

set local role authenticated;
select set_config('request.jwt.claim.sub', '7a330000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.send_nudge('7a330000-0000-4000-8000-000000000003', 'check_in')$$,
  '42501', null, 'the FORMER coach loses the ability to nudge immediately');               -- 19

select set_config('request.jwt.claim.sub', '7a330000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select public.send_nudge('7a330000-0000-4000-8000-000000000003', 'check_in')$$,
  'the NEW coach gains it');                                                               -- 20

-- anon, direct call (the shape that SIGSEGVs when EXECUTE is revoked).
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is(auth.uid(), null, 'identity check: anon with no JWT claim');                     -- 21
select throws_ok(
  $$select public.send_nudge('7a330000-0000-4000-8000-000000000003', 'check_in')$$,
  '42501', null, 'anon send_nudge -> 42501');                                              -- 22

-- ---------------------------------------------------------------------------
-- 5. Outbox: nobody but the service role may run the drain protocol
-- ---------------------------------------------------------------------------

select throws_ok($$select * from public.claim_notifications(10, 60)$$,
  '42501', null, 'anon claim_notifications -> 42501');                                     -- 23
select throws_ok($$select public.complete_notification(gen_random_uuid(), null)$$,
  '42501', null, 'anon complete_notification -> 42501');                                   -- 24
select throws_ok($$select public.fail_notification(gen_random_uuid(), 'x', true)$$,
  '42501', null, 'anon fail_notification -> 42501');                                       -- 25
select throws_ok($$select public.enqueue_live_class_reminders()$$,
  '42501', null, 'anon enqueue_live_class_reminders -> 42501');                            -- 26

set local role authenticated;
select set_config('request.jwt.claim.sub', '7a330000-0000-4000-8000-000000000001', true);
select throws_ok($$select * from public.claim_notifications(10, 60)$$,
  '42501', null, 'a signed-in coach cannot claim the queue either');                       -- 27

-- A client cannot inject a push: enqueue_notification is SECURITY INVOKER and
-- notification_outbox has no INSERT policy, so RLS refuses it.
select throws_ok(
  $$select public.enqueue_notification('7a330000-0000-4000-8000-000000000003', 'nudge',
      'forged:1', 'Pay me', 'Send bitcoin', '{}'::jsonb)$$,
  '42501', null, 'a client calling enqueue_notification directly is refused by RLS');      -- 28

reset role;

-- ---------------------------------------------------------------------------
-- 6. Outbox mechanics (as postgres, i.e. as the drain sees them)
-- ---------------------------------------------------------------------------

-- Dedupe: the same key twice is a no-op, which is what makes an overlapping
-- scheduler run harmless.
select isnt(
  public.enqueue_notification('7a330000-0000-4000-8000-000000000003', 'live_class',
    '7a33:dedupe', 'Starting soon', 'Class is about to start', '{}'::jsonb),
  null, 'the first enqueue returns a row id');                                             -- 29
select is(
  public.enqueue_notification('7a330000-0000-4000-8000-000000000003', 'live_class',
    '7a33:dedupe', 'Starting soon', 'Class is about to start', '{}'::jsonb),
  null, 'the same dedupe_key returns NULL and inserts nothing');                           -- 30
select is(
  (select count(*)::int from public.notification_outbox where dedupe_key = '7a33:dedupe'),
  1, 'still exactly one row for that key');                                                -- 31

-- Claim takes a lease. A second claim in the same instant must NOT see the row
-- again — that is the property two concurrent drains rely on.
select is(
  (select count(*)::int from public.claim_notifications(100, 300)
    where dedupe_key = '7a33:dedupe'),
  1, 'the first claim leases the row');                                                    -- 32
select is(
  (select count(*)::int from public.claim_notifications(100, 300)
    where dedupe_key = '7a33:dedupe'),
  0, 'a second claim does not hand the same row out again (live lease)');                  -- 33

-- Lease recovery: a drain that died leaves `sending` with an expired lease.
update public.notification_outbox
   set locked_until = now() - interval '1 minute'
 where dedupe_key = '7a33:dedupe';
select is(
  (select count(*)::int from public.claim_notifications(100, 300)
    where dedupe_key = '7a33:dedupe'),
  1, 'an EXPIRED lease makes the row claimable again (crashed drain recovers)');           -- 34

-- Dead-letter: a permanent error skips the retry ladder entirely.
select is(
  public.fail_notification(
    (select id from public.notification_outbox where dedupe_key = '7a33:dedupe'),
    'DeviceNotRegistered', false),
  'dead', 'a permanent failure dead-letters the row on the spot');                         -- 35

-- ...and the attempt ceiling does the same for a repeatedly failing row.
update public.notification_outbox
   set status = 'sending', attempts = public.notification_max_attempts()
 where dedupe_key = '7a33:dedupe';
select is(
  public.fail_notification(
    (select id from public.notification_outbox where dedupe_key = '7a33:dedupe'),
    'timeout', true),
  'dead', 'a retryable failure on the last attempt dead-letters it too');                  -- 36

-- ---------------------------------------------------------------------------
-- 7. Scheduling entry points (20260921142000) are service-only too
-- ---------------------------------------------------------------------------
-- drain_notifications_tick reads the service-role key out of Vault, so a client
-- reaching it would be a credential leak, not just an unauthorized action.

set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select throws_ok($$select public.notification_setting('notification_service_role_key')$$,
  '42501', null, 'anon cannot read a scheduling secret out of Vault');                     -- 37
select throws_ok($$select public.drain_notifications_tick()$$,
  '42501', null, 'anon drain_notifications_tick -> 42501');                                -- 38
select throws_ok($$select public.enqueue_live_class_reminders_tick()$$,
  '42501', null, 'anon enqueue_live_class_reminders_tick -> 42501');                       -- 39
select throws_ok($$select public.schedule_notification_jobs()$$,
  '42501', null, 'anon schedule_notification_jobs -> 42501');                              -- 40

reset role;

-- ---------------------------------------------------------------------------
-- 8. enqueue_live_class_reminders: the positive path
-- ---------------------------------------------------------------------------
-- This is what replaced the Edge Function's per-class fan-out. The three things
-- worth proving are that it reaches the ENTITLED member, skips the LAPSED one,
-- and is idempotent — the last being the whole reason overlapping ticks stopped
-- producing duplicate pushes.

-- Coach A is the current coach of the lapsed member only at this point (the
-- active member was moved to coach B in section 4), so give coach B the class.
insert into public.live_classes (id, coach_id, title, agora_channel_name, starts_at, status)
values ('7a330000-0000-4000-8000-0000000000c1',
        '7a330000-0000-4000-8000-000000000002',
        'N33 Morning Session', 'n33-morning', now() + interval '5 minutes', 'scheduled');

-- Only people with a registered device are enqueued, so give both members one.
insert into public.push_tokens (user_id, expo_push_token, platform) values
  ('7a330000-0000-4000-8000-000000000003', 'ExponentPushToken[n33-active]', 'ios'),
  ('7a330000-0000-4000-8000-000000000004', 'ExponentPushToken[n33-lapsed]', 'ios');

select is(public.enqueue_live_class_reminders(), 1,
          'one recipient is enqueued: the entitled member (the coach has no device)');     -- 41

select is(
  (select count(*)::int from public.notification_outbox
    where dedupe_key = 'live_class:7a330000-0000-4000-8000-0000000000c1:7a330000-0000-4000-8000-000000000003'),
  1, 'the entitled member got the per-(class, user) row');                                 -- 42

select is(
  (select count(*)::int from public.notification_outbox
    where user_id = '7a330000-0000-4000-8000-000000000004' and kind = 'live_class'),
  0, 'the LAPSED member was skipped (agora-rtc-token would 403 them anyway)');             -- 43

-- Scoped by dedupe_key, not by (user, kind): section 6 left this same member a
-- hand-made 'live_class' row ('7a33:dedupe'), so a kind-only lookup is ambiguous.
select is(
  (select payload->>'route' from public.notification_outbox
    where dedupe_key = 'live_class:7a330000-0000-4000-8000-0000000000c1:7a330000-0000-4000-8000-000000000003'),
  '/community/live/7a330000-0000-4000-8000-0000000000c1',
  'the tap route is the allowlisted /community/live/<uuid> shape');                        -- 44

-- The idempotency that makes the every-minute tick safe: this used to be the
-- overlapping-run duplicate-push bug.
select is(public.enqueue_live_class_reminders(), 0,
          'a second tick in the same window enqueues nothing');                            -- 45
select is(
  (select count(*)::int from public.notification_outbox
    where kind = 'live_class'
      and dedupe_key like 'live_class:7a330000-0000-4000-8000-0000000000c1:%'),
  1, 'still exactly one row for that class');                                              -- 46

select * from finish();

rollback;
