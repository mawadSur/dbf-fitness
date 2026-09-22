-- ============================================================================
-- 34_terms_acceptances.test.sql
--
-- Covers supabase/migrations/20260921150000_terms_acceptances.sql — the record
-- of who accepted the Terms of Service and Privacy Policy, which Apple App
-- Store guideline 1.2 (User-Generated Content) requires this app to keep.
--
-- What is asserted
--   A. shape: table, columns, the doc CHECK, the (user_id, doc, version) unique
--      key, the cascade from profiles, and RLS enabled
--   B. read matrix: owner reads own, admin reads everyone, a peer reads nothing
--   C. write matrix: NO client can insert / update / delete, in any role
--   D. accept_terms records BOTH documents, is idempotent, and keeps the first
--      accepted_at on a repeat call
--   E. has_accepted_terms is true only when BOTH docs are present at that exact
--      version, and a version bump flips it back to false
--   F. anon calls BOTH functions directly without writing anything and without
--      crashing the backend (the "never REVOKE EXECUTE" rule in common.md — a
--      revoke here segfaults Postgres 17.6)
--   G. privileges: EXECUTE is intact for anon and authenticated, and both
--      functions are SECURITY DEFINER with a pinned search_path
--
-- Run with:  supabase test db supabase/tests/database/34_terms_acceptances.test.sql
-- The whole file is ONE transaction and is rolled back. Fixtures use the
-- `73400000-…` prefix so they cannot collide with the demo seed or with another
-- agent's rows, and every assertion is scoped to those fixtures — never to a
-- global count, because other agents share this database.
-- ============================================================================

create extension if not exists pgtap with schema extensions;

begin;

set local search_path = public, extensions;

select plan(39);

-- ---------------------------------------------------------------------------
-- Fixtures (superuser, RLS bypassed, rolled back at the end).
--   ..01 coach C     ..02 member M1 (C)     ..03 member M2 (C)     ..04 admin A
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       't34-' || u.n || '@test.invalid', 'x', now(), now()
from (values
  ('73400000-0000-4000-8000-000000000001'::uuid, 1),
  ('73400000-0000-4000-8000-000000000002'::uuid, 2),
  ('73400000-0000-4000-8000-000000000003'::uuid, 3),
  ('73400000-0000-4000-8000-000000000004'::uuid, 4)
) as u(id, n);

insert into public.profiles (id, role, coach_id, full_name) values
  ('73400000-0000-4000-8000-000000000001', 'coach',  null,                                   'T34 Coach'),
  ('73400000-0000-4000-8000-000000000002', 'member', '73400000-0000-4000-8000-000000000001', 'T34 Member One'),
  ('73400000-0000-4000-8000-000000000003', 'member', '73400000-0000-4000-8000-000000000001', 'T34 Member Two'),
  ('73400000-0000-4000-8000-000000000004', 'admin',  null,                                   'T34 Admin');

-- ---------------------------------------------------------------------------
-- A. Shape
-- ---------------------------------------------------------------------------
select has_table('public', 'terms_acceptances', 'terms_acceptances exists');            -- 1
select has_column('public', 'terms_acceptances', 'user_id', 'has user_id');             -- 2
select has_column('public', 'terms_acceptances', 'doc', 'has doc');                     -- 3
select has_column('public', 'terms_acceptances', 'version', 'has version');             -- 4
select has_column('public', 'terms_acceptances', 'accepted_at', 'has accepted_at');     -- 5

select is(
  (select relrowsecurity from pg_class where oid = 'public.terms_acceptances'::regclass),
  true,
  'RLS is enabled on terms_acceptances');                                               -- 6

select is(
  (select count(*)::int from pg_constraint
    where conrelid = 'public.terms_acceptances'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%user_id%doc%version%'),
  1,
  'unique (user_id, doc, version) exists');                                             -- 7

select is(
  (select confdeltype::text from pg_constraint
    where conrelid = 'public.terms_acceptances'::regclass
      and contype = 'f'
      and confrelid = 'public.profiles'::regclass),
  'c',
  'user_id cascades when the profile is deleted (account deletion leaves nothing behind)'); -- 8

-- The doc CHECK really rejects an unknown document name.
select throws_ok(
  $$insert into public.terms_acceptances (user_id, doc, version)
    values ('73400000-0000-4000-8000-000000000002', 'cookies', '2026-09-21')$$,
  '23514',
  null,
  'doc is constrained to terms | privacy');                                             -- 9

-- ---------------------------------------------------------------------------
-- D. accept_terms writes both documents and is idempotent
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '73400000-0000-4000-8000-000000000002', true);

select is(current_user::text, 'authenticated', 'identity: running as authenticated');   -- 10
select is(auth.uid(), '73400000-0000-4000-8000-000000000002'::uuid, 'identity: M1');    -- 11

select lives_ok(
  $$select public.accept_terms('2026-09-21')$$,
  'M1 can accept the current version');                                                 -- 12

select is(
  (select count(*)::int from public.terms_acceptances
    where user_id = '73400000-0000-4000-8000-000000000002'),
  2,
  'one call records BOTH terms and privacy');                                           -- 13

select is(
  (select array_agg(doc order by doc)::text from public.terms_acceptances
    where user_id = '73400000-0000-4000-8000-000000000002'),
  '{privacy,terms}',
  'the two rows are exactly terms and privacy');                                        -- 14

-- Idempotence: a retry after a network error must not double-write or move the
-- timestamp, or the compliance record would claim a fresh acceptance.
select set_config('t34.first_accept', (
  select min(accepted_at)::text from public.terms_acceptances
   where user_id = '73400000-0000-4000-8000-000000000002'), true);

select lives_ok(
  $$select public.accept_terms('2026-09-21')$$,
  'accepting the same version twice does not raise');                                   -- 15

select is(
  (select count(*)::int from public.terms_acceptances
    where user_id = '73400000-0000-4000-8000-000000000002'),
  2,
  'the repeat call inserted nothing (idempotent)');                                     -- 16

select is(
  (select min(accepted_at)::text from public.terms_acceptances
    where user_id = '73400000-0000-4000-8000-000000000002'),
  current_setting('t34.first_accept'),
  'the repeat call kept the ORIGINAL accepted_at');                                     -- 17

select throws_ok(
  $$select public.accept_terms('   ')$$,
  '22023',
  null,
  'a blank version is rejected');                                                       -- 18

-- ---------------------------------------------------------------------------
-- E. has_accepted_terms
-- ---------------------------------------------------------------------------
select is(public.has_accepted_terms('2026-09-21'), true,
  'M1 has accepted the current version');                                               -- 19
select is(public.has_accepted_terms('2027-01-01'), false,
  'a version bump flips acceptance back to false (re-prompt)');                         -- 20
select is(public.has_accepted_terms(null), false,
  'a null version is false, not null');                                                 -- 21
select is(public.has_accepted_terms('  2026-09-21  '), true,
  'the version is trimmed on read, matching the trim on write');                        -- 22

-- BOTH documents are required: delete the privacy row as superuser and re-check.
reset role;
delete from public.terms_acceptances
 where user_id = '73400000-0000-4000-8000-000000000002' and doc = 'privacy';

set local role authenticated;
select set_config('request.jwt.claim.sub', '73400000-0000-4000-8000-000000000002', true);
select is(public.has_accepted_terms('2026-09-21'), false,
  'terms alone is NOT enough — both documents must be recorded');                       -- 23

-- Put it back so the read matrix below sees two rows.
reset role;
insert into public.terms_acceptances (user_id, doc, version)
values ('73400000-0000-4000-8000-000000000002', 'privacy', '2026-09-21');

-- ---------------------------------------------------------------------------
-- B. Read matrix
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '73400000-0000-4000-8000-000000000002', true);
select is(
  (select count(*)::int from public.terms_acceptances
    where user_id::text like '73400000%'),
  2,
  'M1 reads their OWN two rows');                                                       -- 24

-- M2 (a peer of the same coach) must see nothing of M1's.
select set_config('request.jwt.claim.sub', '73400000-0000-4000-8000-000000000003', true);
select is(
  (select count(*)::int from public.terms_acceptances
    where user_id::text like '73400000%'),
  0,
  'a peer member reads NONE of another member''s acceptances');                         -- 25

-- The coach is not entitled either: this is a legal record, not roster data.
select set_config('request.jwt.claim.sub', '73400000-0000-4000-8000-000000000001', true);
select is(
  (select count(*)::int from public.terms_acceptances
    where user_id::text like '73400000%'),
  0,
  'the member''s own coach reads none of it');                                          -- 26

select set_config('request.jwt.claim.sub', '73400000-0000-4000-8000-000000000004', true);
select is(
  (select count(*)::int from public.terms_acceptances
    where user_id::text like '73400000%'),
  2,
  'an admin reads the compliance record');                                              -- 27

-- `set local role anon` alone does NOT make the session anonymous: the
-- request.jwt.claim.sub set above survives it, so auth.uid() would still return
-- the admin and the assertion would pass for the wrong reason. Clear the claim.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is(
  (select count(*)::int from public.terms_acceptances where user_id::text like '73400000%'),
  0,
  'anon reads nothing');                                                                -- 28

-- ---------------------------------------------------------------------------
-- C. Write matrix — accept_terms() is the ONLY writer
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '73400000-0000-4000-8000-000000000002', true);

-- 42501 = insufficient_privilege, which is what RLS raises when no permissive
-- policy exists for the command.
select throws_ok(
  $$insert into public.terms_acceptances (user_id, doc, version)
    values ('73400000-0000-4000-8000-000000000002', 'terms', '2099-01-01')$$,
  '42501',
  null,
  'a member cannot insert their own acceptance directly (must go through accept_terms)'); -- 29

select throws_ok(
  $$insert into public.terms_acceptances (user_id, doc, version)
    values ('73400000-0000-4000-8000-000000000003', 'terms', '2099-01-01')$$,
  '42501',
  null,
  'a member cannot forge an acceptance for SOMEONE ELSE');                              -- 30

-- update / delete have no policy either, so they silently affect zero rows
-- rather than raising. Prove the row is still there and unchanged.
-- A data-modifying statement cannot sit in a sub-SELECT, so each one is a
-- top-level CTE whose returned rows are then counted.
with attempted_update as (
  update public.terms_acceptances set version = '2099-01-01'
   where user_id = '73400000-0000-4000-8000-000000000002'
  returning 1
)
select is(
  (select count(*)::int from attempted_update),
  0,
  'a member cannot back-date or re-version their acceptance');                          -- 31

with attempted_delete as (
  delete from public.terms_acceptances
   where user_id = '73400000-0000-4000-8000-000000000002'
  returning 1
)
select is(
  (select count(*)::int from attempted_delete),
  0,
  'a member cannot delete their acceptance record');                                    -- 32

-- The admin has SELECT only; the compliance record is append-only for everyone.
select set_config('request.jwt.claim.sub', '73400000-0000-4000-8000-000000000004', true);
select throws_ok(
  $$insert into public.terms_acceptances (user_id, doc, version)
    values ('73400000-0000-4000-8000-000000000003', 'terms', '2099-01-01')$$,
  '42501',
  null,
  'not even an admin can insert an acceptance');                                        -- 33

-- ---------------------------------------------------------------------------
-- F. anon calls both functions DIRECTLY (the segfault path from common.md)
-- ---------------------------------------------------------------------------
-- Clear the JWT subject as well as the role. Without this the block still
-- carries the admin's uid from the read matrix above, accept_terms writes the
-- ADMIN's acceptance, and "anon wrote nothing" fails — which is exactly how
-- this bug was caught. Assertion 35 now pins the precondition.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select is(current_user::text, 'anon', 'identity: running as anon');                     -- 34
select ok(auth.uid() is null, 'identity: anon really has no JWT subject');              -- 35

select is(public.has_accepted_terms('2026-09-21'), false,
  'anon gets false from has_accepted_terms (gated in the body, not by REVOKE)');        -- 36

select lives_ok(
  $$select public.accept_terms('2026-09-21')$$,
  'anon calling accept_terms is a silent no-op, not an error and not a crash');         -- 37

reset role;
select is(
  (select count(*)::int from public.terms_acceptances where user_id::text like '73400000%'),
  2,
  'the anon accept_terms call wrote nothing');                                          -- 38

-- ---------------------------------------------------------------------------
-- G. Privileges and function hardening
-- ---------------------------------------------------------------------------
-- EXECUTE must remain granted to anon AND authenticated on both functions:
-- revoking it segfaults this Postgres when the role calls the function via
-- direct SQL (reproduced on 17.6; see common.md). Both functions must also be
-- SECURITY DEFINER with search_path pinned to public.
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('accept_terms', 'has_accepted_terms')
      and p.prosecdef
      and p.proconfig @> array['search_path=public']
      and has_function_privilege('anon', p.oid, 'EXECUTE')
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  2,
  'both functions are SECURITY DEFINER, pin search_path, and keep EXECUTE for anon+authenticated'); -- 39

select * from finish();

rollback;
