-- ============================================================================
-- 30_admin_payments.test.sql
--
-- Pins migration 20260921130000 (subscription_events ledger, admin_mark_paid,
-- admin_cancel_subscription, admin_list_subscriptions, assert_admin_caller).
--
-- Run with: supabase test db supabase/tests/database/30_admin_payments.test.sql
--       or: psql "$DB_URL" -v ON_ERROR_STOP=1 -f <this file>
-- One transaction, rolled back. Fixture prefix 7a30… is unique to this file,
-- so the other lanes working on this shared database cannot move it.
--
-- MUTANT (run and confirmed, see the report):
--   drop trigger subscription_events_append_only on public.subscription_events;
--   -> 31, 32 turn RED (the ledger becomes rewritable), and 35 follows because
--      the now-successful DELETE empties the member's own ledger rows.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(46);

-- ---------------------------------------------------------------------------
-- Fixtures (superuser, RLS bypassed, rolled back at the end).
--   ..01 admin A1        ..02 coach C1          ..03 member M1 (C1)
--   ..04 member M2 (C1)  ..05 coach C2          ..06 member M3 (C2)
--   ..07 admin A2 (with a verified TOTP factor)
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'h30-' || u.n || '@test.invalid', 'x', now(), now()
from (values
  ('7a300000-0000-4000-8000-000000000001'::uuid, 1),
  ('7a300000-0000-4000-8000-000000000002'::uuid, 2),
  ('7a300000-0000-4000-8000-000000000003'::uuid, 3),
  ('7a300000-0000-4000-8000-000000000004'::uuid, 4),
  ('7a300000-0000-4000-8000-000000000005'::uuid, 5),
  ('7a300000-0000-4000-8000-000000000006'::uuid, 6),
  ('7a300000-0000-4000-8000-000000000007'::uuid, 7)
) as u(id, n);

insert into public.profiles (id, full_name, role, coach_id) values
  ('7a300000-0000-4000-8000-000000000001', 'H30 Admin One',  'admin',  null),
  ('7a300000-0000-4000-8000-000000000002', 'H30 Coach One',  'coach',  null),
  ('7a300000-0000-4000-8000-000000000003', 'H30 Member One', 'member', '7a300000-0000-4000-8000-000000000002'),
  ('7a300000-0000-4000-8000-000000000004', 'H30 Member Two', 'member', '7a300000-0000-4000-8000-000000000002'),
  ('7a300000-0000-4000-8000-000000000005', 'H30 Coach Two',  'coach',  null),
  ('7a300000-0000-4000-8000-000000000006', 'H30 Member Tri', 'member', '7a300000-0000-4000-8000-000000000005'),
  ('7a300000-0000-4000-8000-000000000007', 'H30 Admin Two',  'admin',  null);

-- A2 has enrolled and verified TOTP: the MFA branch must demand aal2 from them.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
values ('7a300000-0000-4000-8000-0000000000f1', '7a300000-0000-4000-8000-000000000007',
        'h30-totp', 'totp', 'verified', now(), now(), 'x');

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------

select has_table('public', 'subscription_events', 'subscription_events exists');           -- 1
select ok(
  (select relrowsecurity from pg_class where oid = 'public.subscription_events'::regclass),
  'subscription_events has RLS enabled');                                                  -- 2
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'subscription_events'
      and cmd in ('INSERT', 'UPDATE', 'DELETE')),
  0,
  'subscription_events has no client write policy at all');                                -- 3

-- ---------------------------------------------------------------------------
-- admin_mark_paid as admin A1 (no TOTP factor -> interim aal1 path)
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '7a300000-0000-4000-8000-000000000001', true);

select is(auth.uid(), '7a300000-0000-4000-8000-000000000001'::uuid,
          'identity: caller is admin A1');                                                 -- 4
select ok(public.is_admin(), 'identity: A1 is recognised as an admin');                    -- 5

select lives_ok(
  $$ select public.admin_mark_paid('7a300000-0000-4000-8000-000000000003',
                                   date_trunc('second', now()) + interval '30 days',
                                   'first payment', 4900, 'USD') $$,
  'mark_paid: an admin with no TOTP factor is let through (interim rule)');                -- 6

select is((select applied from public.admin_mark_paid(
            '7a300000-0000-4000-8000-000000000004',
            date_trunc('second', now()) + interval '30 days', 'm2')),
          true,
          'mark_paid: first call for a fresh member reports applied=true');                -- 7

select is((select status from public.subscriptions
            where member_id = '7a300000-0000-4000-8000-000000000003'),
          'active',
          'mark_paid: the subscription row is active');                                    -- 8
select is((select current_period_end from public.subscriptions
            where member_id = '7a300000-0000-4000-8000-000000000003'),
          date_trunc('second', now()) + interval '30 days',
          'mark_paid: current_period_end is the ABSOLUTE date that was passed');           -- 9
select is((select provider from public.subscriptions
            where member_id = '7a300000-0000-4000-8000-000000000003'),
          'manual',
          'mark_paid: provider is manual');                                                -- 10
select is((select count(*)::int from public.subscription_events
            where member_id = '7a300000-0000-4000-8000-000000000003' and kind = 'mark_paid'),
          1,
          'mark_paid: exactly one ledger row was appended');                               -- 11

-- ---------------------------------------------------------------------------
-- Idempotent replay, optimistic concurrency, bounds
-- ---------------------------------------------------------------------------

select is((select applied from public.admin_mark_paid(
            '7a300000-0000-4000-8000-000000000003',
            date_trunc('second', now()) + interval '30 days', 'retry')),
          false,
          'idempotent: replaying the SAME absolute end reports applied=false');            -- 12
select is((select count(*)::int from public.subscription_events
            where member_id = '7a300000-0000-4000-8000-000000000003' and kind = 'mark_paid'),
          1,
          'idempotent: the replay appended NO second ledger row');                         -- 13

-- A retry that still carries the pre-payment expected end must NOT 40001: the
-- idempotency check runs first, on purpose.
select is((select applied from public.admin_mark_paid(
            '7a300000-0000-4000-8000-000000000003',
            date_trunc('second', now()) + interval '30 days', 'retry with stale expectation',
            null, null, null)),
          false,
          'idempotent: a replay is decided before the expected-previous-end check');       -- 14

select throws_ok(
  $$ select public.admin_mark_paid('7a300000-0000-4000-8000-000000000003',
                                   date_trunc('second', now()) + interval '60 days',
                                   null, null, null,
                                   timestamptz '2001-01-01') $$,
  '40001',
  'stale_subscription',
  'stale: a wrong p_expected_previous_end is refused with 40001');                         -- 15

select throws_ok(
  $$ select public.admin_mark_paid('7a300000-0000-4000-8000-000000000003',
                                   date_trunc('second', now()) + interval '1 day') $$,
  '22023',
  'period_backwards',
  'backwards: moving the period end earlier is refused');                                  -- 16

select is((select applied from public.admin_mark_paid(
            '7a300000-0000-4000-8000-000000000003',
            date_trunc('second', now()) + interval '1 day',
            'correction', null, null, null, true)),
          true,
          'backwards: p_allow_backwards => true lets a correction through');               -- 17

select throws_ok(
  $$ select public.admin_mark_paid('7a300000-0000-4000-8000-000000000004',
                                   now() + interval '401 days') $$,
  '22023',
  'period_out_of_bounds',
  'bounds: more than 400 days in the future is refused');                                  -- 18
select throws_ok(
  $$ select public.admin_mark_paid('7a300000-0000-4000-8000-000000000004',
                                   timestamptz '2019-06-01') $$,
  '22023',
  'period_out_of_bounds',
  'bounds: a period end before 2020 is refused');                                          -- 19
select throws_ok(
  $$ select public.admin_mark_paid('7a300000-0000-4000-8000-00000000dead',
                                   now() + interval '30 days') $$,
  'P0002',
  'member_not_found',
  'unknown member is refused with P0002');                                                 -- 20

-- ---------------------------------------------------------------------------
-- Cancel keeps access until the period end
-- ---------------------------------------------------------------------------

select is((select applied from public.admin_cancel_subscription(
            '7a300000-0000-4000-8000-000000000004', 'member asked')),
          true,
          'cancel: first cancel applies');                                                 -- 21
select is((select status from public.subscriptions
            where member_id = '7a300000-0000-4000-8000-000000000004'),
          'canceled',
          'cancel: status becomes canceled');                                              -- 22
select is((select current_period_end from public.subscriptions
            where member_id = '7a300000-0000-4000-8000-000000000004'),
          date_trunc('second', now()) + interval '30 days',
          'cancel: current_period_end is untouched, so access continues');                 -- 23
select ok(public.has_live_access('7a300000-0000-4000-8000-000000000004'),
          'cancel: the member still has live access inside the paid period');              -- 24
select is((select applied from public.admin_cancel_subscription(
            '7a300000-0000-4000-8000-000000000004')),
          false,
          'cancel: a second cancel is idempotent (applied=false)');                        -- 25
select throws_ok(
  $$ select public.admin_cancel_subscription('7a300000-0000-4000-8000-000000000006') $$,
  'P0002',
  'subscription_not_found',
  'cancel: a member with no subscription row is refused with P0002');                      -- 26

-- ---------------------------------------------------------------------------
-- admin_list_subscriptions
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.admin_list_subscriptions(null, null, 200)
    where member_id in ('7a300000-0000-4000-8000-000000000003',
                        '7a300000-0000-4000-8000-000000000004',
                        '7a300000-0000-4000-8000-000000000006')),
  3,
  'list: every member of this fixture is listed, including the one with no subscription'); -- 27
select is(
  (select state from public.admin_list_subscriptions(null, null, 200)
    where member_id = '7a300000-0000-4000-8000-000000000006'),
  'none',
  'list: a member without a subscription row gets state none');                            -- 28
select is(
  (select coach_name from public.admin_list_subscriptions(null, null, 200)
    where member_id = '7a300000-0000-4000-8000-000000000003'),
  'H30 Coach One',
  'list: the coach name comes along for the owner screen');                                -- 29
select throws_ok(
  $$ select public.admin_list_subscriptions('nonsense') $$,
  '22023',
  'invalid_state_filter',
  'list: an unknown state filter is refused');                                             -- 30

-- ---------------------------------------------------------------------------
-- The ledger is append-only, even for postgres (the strongest claim: an RLS
-- role is already stopped by the missing UPDATE/DELETE policy, so this runs as
-- the RLS-bypassing owner to reach the trigger itself).
-- ---------------------------------------------------------------------------

reset role;

select throws_ok(
  $$ update public.subscription_events set note = 'tampered'
      where member_id = '7a300000-0000-4000-8000-000000000003' $$,
  '42501',
  'subscription_events_append_only',
  'ledger: UPDATE is rejected even for the RLS-bypassing owner');                          -- 31
select throws_ok(
  $$ delete from public.subscription_events
      where member_id = '7a300000-0000-4000-8000-000000000003' $$,
  '42501',
  'subscription_events_append_only',
  'ledger: DELETE is rejected even for the RLS-bypassing owner');                          -- 32

-- ---------------------------------------------------------------------------
-- Authorization matrix: member / coach / other coach / anon
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '7a300000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$ select public.admin_mark_paid('7a300000-0000-4000-8000-000000000003',
                                   now() + interval '365 days') $$,
  '42501', 'admin_required',
  'authz: a member cannot mark themselves paid');                                          -- 33
select is(
  (select count(*)::int from public.subscription_events
    where member_id = '7a300000-0000-4000-8000-000000000004'),
  0,
  'authz: a member reads only their OWN ledger rows (RLS)');                               -- 34
select ok(
  (select count(*) from public.subscription_events
    where member_id = '7a300000-0000-4000-8000-000000000003') > 0,
  'authz: a member does read their own ledger rows');                                      -- 35

select set_config('request.jwt.claim.sub', '7a300000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$ select public.admin_cancel_subscription('7a300000-0000-4000-8000-000000000003') $$,
  '42501', 'admin_required',
  'authz: the member''s own coach is not a payments admin');                               -- 36
select throws_ok(
  $$ select public.admin_list_subscriptions() $$,
  '42501', 'admin_required',
  'authz: a coach cannot list subscriptions');                                             -- 37

select set_config('request.jwt.claim.sub', '7a300000-0000-4000-8000-000000000005', true);
select throws_ok(
  $$ select public.admin_mark_paid('7a300000-0000-4000-8000-000000000003',
                                   now() + interval '365 days') $$,
  '42501', 'admin_required',
  'authz: another coach cannot mark a stranger paid');                                     -- 38

-- ---------------------------------------------------------------------------
-- MFA branch: an admin WITH a verified TOTP factor needs aal2
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', '7a300000-0000-4000-8000-000000000007', true);
select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$ select public.admin_list_subscriptions() $$,
  '42501', 'mfa_required',
  'mfa: an admin with a verified TOTP factor is refused at aal1');                         -- 39

select set_config('request.jwt.claims',
  '{"sub":"7a300000-0000-4000-8000-000000000007","aal":"aal2","role":"authenticated"}', true);
select lives_ok(
  $$ select public.admin_list_subscriptions() $$,
  'mfa: the same admin is let through with an aal2 JWT');                                  -- 40
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- Direct anon calls of every new function (the segfault-prone path)
-- ---------------------------------------------------------------------------

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $$ select public.assert_admin_caller() $$, '42501', 'admin_required',
  'anon: assert_admin_caller raises instead of crashing');                                 -- 41
select throws_ok(
  $$ select public.admin_mark_paid('7a300000-0000-4000-8000-000000000003', now() + interval '1 day') $$,
  '42501', 'admin_required', 'anon: admin_mark_paid is refused');                          -- 42
select throws_ok(
  $$ select public.admin_cancel_subscription('7a300000-0000-4000-8000-000000000003') $$,
  '42501', 'admin_required', 'anon: admin_cancel_subscription is refused');                -- 43
select throws_ok(
  $$ select public.admin_list_subscriptions() $$,
  '42501', 'admin_required', 'anon: admin_list_subscriptions is refused');                 -- 44
select is((select public.admin_mfa_required()), false,
          'anon: admin_mfa_required is callable and false (interim rule)');                -- 45
select is((select count(*)::int from public.subscription_events), 0,
          'anon: reads no ledger rows at all');                                            -- 46

select * from finish();
rollback;
