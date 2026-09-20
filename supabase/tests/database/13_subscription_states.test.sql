-- ============================================================================
-- 13_subscription_states.test.sql
--
-- The subscription state machine, exercised at every boundary the canonical
-- spec names: none / active / grace (INCLUSIVE at current_period_end + 10 days)
-- / expired / canceled-gets-no-grace / staff, plus who is allowed to SEE a
-- state at all, plus the write-lockdown on public.subscriptions.
--
-- Objects under test:
--   public.subscription_grace_days()      (immutable, single source of 10)
--   public.subscription_state_row(uuid)   (security definer, visibility-gated)
--   public.get_subscription_state()       (rpc wrapper for auth.uid())
--   public.has_live_access(uuid)
--   RLS on public.subscriptions
--
-- Run with: supabase test db supabase/tests/database/13_subscription_states.test.sql
-- One transaction, rolled back: no fixture survives this file.
-- Fixture prefix 7a13… is unique to this file.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;

-- SET LOCAL survives the SET ROLE switches below, so both public.* and the
-- pgTAP assertions resolve under every identity this file assumes.
set local search_path = public, extensions;

select plan(52);

-- ---------------------------------------------------------------------------
-- Fixtures (superuser, RLS bypassed, rolled back at the end).
--   ..01 coach A          ..02 member ACTIVE        ..03 member GRACE (3d over)
--   ..04 member GRACE at the inclusive boundary     ..05 member 2s PAST it
--   ..06 member canceled, period still running      ..07 member canceled, ended
--   ..08 member with no subscription row            ..09 admin
--   ..10 coach B          ..11 member of coach B    ..12 stranger (no coach)
-- now() is the transaction timestamp, so every relative period_end below is
-- exact arithmetic against the now() the functions themselves observe.
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'sub13-' || u.n || '@test.invalid', 'x', now(), now()
from (values
  ('7a130000-0000-4000-8000-000000000001'::uuid, 1),
  ('7a130000-0000-4000-8000-000000000002'::uuid, 2),
  ('7a130000-0000-4000-8000-000000000003'::uuid, 3),
  ('7a130000-0000-4000-8000-000000000004'::uuid, 4),
  ('7a130000-0000-4000-8000-000000000005'::uuid, 5),
  ('7a130000-0000-4000-8000-000000000006'::uuid, 6),
  ('7a130000-0000-4000-8000-000000000007'::uuid, 7),
  ('7a130000-0000-4000-8000-000000000008'::uuid, 8),
  ('7a130000-0000-4000-8000-000000000009'::uuid, 9),
  ('7a130000-0000-4000-8000-000000000010'::uuid, 10),
  ('7a130000-0000-4000-8000-000000000011'::uuid, 11),
  ('7a130000-0000-4000-8000-000000000012'::uuid, 12)
) as u(id, n);

insert into public.profiles (id, role, coach_id, full_name) values
  ('7a130000-0000-4000-8000-000000000001', 'coach',  null,                                   'S13 Coach A'),
  ('7a130000-0000-4000-8000-000000000002', 'member', '7a130000-0000-4000-8000-000000000001', 'S13 Active'),
  ('7a130000-0000-4000-8000-000000000003', 'member', '7a130000-0000-4000-8000-000000000001', 'S13 Grace'),
  ('7a130000-0000-4000-8000-000000000004', 'member', '7a130000-0000-4000-8000-000000000001', 'S13 Boundary'),
  ('7a130000-0000-4000-8000-000000000005', 'member', '7a130000-0000-4000-8000-000000000001', 'S13 PastBoundary'),
  ('7a130000-0000-4000-8000-000000000006', 'member', '7a130000-0000-4000-8000-000000000001', 'S13 CancelRunning'),
  ('7a130000-0000-4000-8000-000000000007', 'member', '7a130000-0000-4000-8000-000000000001', 'S13 CancelEnded'),
  ('7a130000-0000-4000-8000-000000000008', 'member', '7a130000-0000-4000-8000-000000000001', 'S13 NoRow'),
  ('7a130000-0000-4000-8000-000000000009', 'admin',  null,                                   'S13 Admin'),
  ('7a130000-0000-4000-8000-000000000010', 'coach',  null,                                   'S13 Coach B'),
  ('7a130000-0000-4000-8000-000000000011', 'member', '7a130000-0000-4000-8000-000000000010', 'S13 Coach B Member'),
  ('7a130000-0000-4000-8000-000000000012', 'member', null,                                   'S13 Stranger');

insert into public.subscriptions (member_id, status, current_period_end) values
  ('7a130000-0000-4000-8000-000000000002', 'active',   now() + interval '5 days'),
  ('7a130000-0000-4000-8000-000000000003', 'past_due', now() - interval '3 days'),
  -- period ended 10 days ago minus 2 seconds => now() <= period_end + 10 days  => still GRACE
  ('7a130000-0000-4000-8000-000000000004', 'past_due', now() - interval '10 days' + interval '2 seconds'),
  -- two seconds the other side of the same boundary => EXPIRED
  ('7a130000-0000-4000-8000-000000000005', 'past_due', now() - interval '10 days' - interval '2 seconds'),
  ('7a130000-0000-4000-8000-000000000006', 'canceled', now() + interval '5 days'),
  ('7a130000-0000-4000-8000-000000000007', 'canceled', now() - interval '3 days'),
  ('7a130000-0000-4000-8000-000000000011', 'active',   now() + interval '5 days');

-- ===========================================================================
-- ACTIVE member: the rightful actor.
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a130000-0000-4000-8000-000000000002', true);

select is(auth.uid(), '7a130000-0000-4000-8000-000000000002'::uuid,
          'identity: caller is the ACTIVE member');                                        -- 1

select is((select state from public.get_subscription_state()), 'active',
          'active: now() <= current_period_end => state active');                          -- 2
select is((select days_overdue from public.get_subscription_state()), 0,
          'active: days_overdue is 0');                                                    -- 3
select is((select grace_days_left from public.get_subscription_state()), 0,
          'active: grace_days_left is 0');                                                 -- 4
select is((select current_period_end from public.get_subscription_state()),
          now() + interval '5 days',
          'active: current_period_end is echoed back verbatim');                           -- 5
select ok(public.has_live_access(auth.uid()),
          'active: has_live_access is true');                                              -- 6

-- RLS: a member reads exactly their own row and cannot write at all.
select is((select count(*)::int from public.subscriptions
            where member_id::text like '7a130000%'), 1,
          'active: member sees only their own subscription row');                          -- 7
select throws_ok(
  $$insert into public.subscriptions (member_id, status, current_period_end)
    values ('7a130000-0000-4000-8000-000000000012', 'active', now() + interval '99 days')$$,
  '42501',
  'new row violates row-level security policy for table "subscriptions"',
  'active: member cannot INSERT a subscription (no insert policy)');                       -- 8
with u as (update public.subscriptions set current_period_end = now() + interval '999 days'
            where member_id = auth.uid() returning 1)
select is((select count(*)::int from u), 0,
          'active: member UPDATE of own subscription matches no row');                     -- 9
with d as (delete from public.subscriptions where member_id = auth.uid() returning 1)
select is((select count(*)::int from d), 0,
          'active: member DELETE of own subscription matches no row');                     -- 10

-- ===========================================================================
-- GRACE member: 3 days overdue, 7 of the 10 grace days left.
-- ===========================================================================
select set_config('request.jwt.claim.sub', '7a130000-0000-4000-8000-000000000003', true);

select is(auth.uid(), '7a130000-0000-4000-8000-000000000003'::uuid,
          'identity: caller is the GRACE member');                                         -- 11
select is((select state from public.get_subscription_state()), 'grace',
          'grace: past_due 3 days past period end is grace');                              -- 12
select is((select days_overdue from public.get_subscription_state()), 3,
          'grace: days_overdue is 3 whole days');                                          -- 13
select is((select grace_days_left from public.get_subscription_state()), 7,
          'grace: grace_days_left is 7');                                                  -- 14
select ok(public.has_live_access(auth.uid()),
          'grace: has_live_access is true (access continues during grace)');               -- 15

-- ===========================================================================
-- The inclusive boundary: exactly period_end + 10 days is STILL grace.
-- ===========================================================================
select set_config('request.jwt.claim.sub', '7a130000-0000-4000-8000-000000000004', true);

select is((select state from public.get_subscription_state()), 'grace',
          'boundary: 2 seconds inside period_end + 10 days is still grace');               -- 16
select is((select grace_days_left from public.get_subscription_state()), 1,
          'boundary: a sliver of grace left rounds up to 1 (ceil)');                       -- 17
select ok(public.has_live_access(auth.uid()),
          'boundary: has_live_access is still true at the inclusive edge');                -- 18

-- ...and two seconds later it is not.
select set_config('request.jwt.claim.sub', '7a130000-0000-4000-8000-000000000005', true);

select is((select state from public.get_subscription_state()), 'expired',
          'past boundary: 2 seconds past period_end + 10 days is expired');                -- 19
select ok(not public.has_live_access(auth.uid()),
          'past boundary: has_live_access is false');                                      -- 20
select is((select days_overdue from public.get_subscription_state()), 0,
          'past boundary: days_overdue resets to 0 outside grace');                        -- 21
select is((select grace_days_left from public.get_subscription_state()), 0,
          'past boundary: grace_days_left resets to 0 outside grace');                     -- 22

-- ===========================================================================
-- canceled: keeps access until the period ends, then gets NO grace.
-- ===========================================================================
select set_config('request.jwt.claim.sub', '7a130000-0000-4000-8000-000000000006', true);
select is((select state from public.get_subscription_state()), 'active',
          'canceled + period still running is active');                                    -- 23
select ok(public.has_live_access(auth.uid()),
          'canceled + period still running keeps live access');                            -- 24

select set_config('request.jwt.claim.sub', '7a130000-0000-4000-8000-000000000007', true);
select is((select state from public.get_subscription_state()), 'expired',
          'canceled + period ended is expired, NOT grace');                                -- 25
select ok(not public.has_live_access(auth.uid()),
          'canceled + period ended loses live access immediately');                        -- 26

-- ===========================================================================
-- none / staff.
-- ===========================================================================
select set_config('request.jwt.claim.sub', '7a130000-0000-4000-8000-000000000008', true);
select is((select state from public.get_subscription_state()), 'none',
          'no subscription row => state none');                                            -- 27
select is((select current_period_end from public.get_subscription_state()), null::timestamptz,
          'none: current_period_end is null');                                             -- 28
select ok(not public.has_live_access(auth.uid()),
          'none: has_live_access is false');                                               -- 29

select set_config('request.jwt.claim.sub', '7a130000-0000-4000-8000-000000000009', true);
select is((select state from public.get_subscription_state()), 'staff',
          'admin role => state staff without any subscription row');                       -- 30
select ok(public.has_live_access(auth.uid()),
          'staff (admin): has_live_access is true');                                       -- 31

select set_config('request.jwt.claim.sub', '7a130000-0000-4000-8000-000000000001', true);
select is((select state from public.get_subscription_state()), 'staff',
          'coach role => state staff');                                                    -- 32
select ok(public.has_live_access(auth.uid()),
          'staff (coach): has_live_access is true');                                       -- 33

-- A coach may read their own members' billing state, and nobody else's.
select is((select count(*)::int from public.subscriptions
            where member_id in ('7a130000-0000-4000-8000-000000000002',
                                '7a130000-0000-4000-8000-000000000003')), 2,
          'coach A reads their own members subscription rows');                            -- 34
select is((select s.state from public.subscription_state_row('7a130000-0000-4000-8000-000000000003') s),
          'grace',
          'coach A resolves their own members real state');                                -- 35
select is((select count(*)::int from public.subscriptions
            where member_id = '7a130000-0000-4000-8000-000000000011'), 0,
          'coach A cannot read coach B member subscription row');                          -- 36
select is((select s.state from public.subscription_state_row('7a130000-0000-4000-8000-000000000011') s),
          'none',
          'coach A gets none (not a leak) for coach B member');                            -- 37

-- ===========================================================================
-- Coach of another coach: no visibility either way.
-- ===========================================================================
select set_config('request.jwt.claim.sub', '7a130000-0000-4000-8000-000000000010', true);
select is(auth.uid(), '7a130000-0000-4000-8000-000000000010'::uuid,
          'identity: caller is coach B');                                                  -- 38
select is((select s.state from public.subscription_state_row('7a130000-0000-4000-8000-000000000003') s),
          'none',
          'coach B gets none for coach A grace member');                                   -- 39
select is((select count(*)::int from public.subscriptions
            where member_id in ('7a130000-0000-4000-8000-000000000002',
                                '7a130000-0000-4000-8000-000000000003')), 0,
          'coach B reads no rows of coach A members');                                     -- 40

-- ===========================================================================
-- Stranger: an authenticated member with no relationship to anyone here.
-- ===========================================================================
select set_config('request.jwt.claim.sub', '7a130000-0000-4000-8000-000000000012', true);
select is((select count(*)::int from public.subscriptions where member_id::text like '7a130000%'), 0,
          'stranger reads none of this file subscription rows');                           -- 41
select ok(not public.has_live_access('7a130000-0000-4000-8000-000000000002'),
          'stranger cannot probe another member live access');                             -- 42
select is((select s.state from public.subscription_state_row('7a130000-0000-4000-8000-000000000002') s),
          'none',
          'stranger gets none for a stranger member');                                     -- 43

-- ===========================================================================
-- anon. Three direct SECURITY DEFINER calls: clean, empty, and no crash.
-- ===========================================================================
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select is(auth.uid(), null::uuid, 'identity: anon has a null auth.uid()');                 -- 44
select is((select state from public.get_subscription_state()), 'none',
          'anon call 1: get_subscription_state returns none, not an error');               -- 45
select ok(not public.has_live_access('7a130000-0000-4000-8000-000000000002'),
          'anon call 2: has_live_access is false, not null');                              -- 46
select is((select s.state from public.subscription_state_row('7a130000-0000-4000-8000-000000000002') s),
          'none',
          'anon call 3: subscription_state_row leaks nothing');                            -- 47
select is(public.subscription_grace_days(), 10,
          'anon call 4: subscription_grace_days() is 10');                                 -- 48
select is((select count(*)::int from public.subscriptions where member_id::text like '7a130000%'), 0,
          'anon reads no subscription rows');                                              -- 49
select throws_ok(
  $$insert into public.subscriptions (member_id, status, current_period_end)
    values ('7a130000-0000-4000-8000-000000000012', 'active', now() + interval '99 days')$$,
  '42501',
  'new row violates row-level security policy for table "subscriptions"',
  'anon cannot INSERT a subscription');                                                    -- 50

-- ===========================================================================
-- Structural guarantees the spec pins down.
-- ===========================================================================
set local role postgres;

select is((select p.provolatile from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'subscription_grace_days'), 'i'::"char",
          'subscription_grace_days() is IMMUTABLE (one place defines 10)');                -- 51
select is((select count(*)::int from pg_policies
            where schemaname = 'public' and tablename = 'subscriptions'
              and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')), 0,
          'subscriptions has no client write policy of any kind');                         -- 52

select * from finish();

rollback;
