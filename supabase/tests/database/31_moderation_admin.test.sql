-- ============================================================================
-- 31_moderation_admin.test.sql
--
-- Pins migration 20260921131000: moderation is an ADMIN-ONLY queue, coaches are
-- no longer moderators, the accused never sees a report about themselves, and
-- moderation_actions is an append-only audit.
--
-- Run with: supabase test db supabase/tests/database/31_moderation_admin.test.sql
--       or: psql "$DB_URL" -v ON_ERROR_STOP=1 -f <this file>
-- One transaction, rolled back. Fixture prefix 7a31… is unique to this file.
--
-- MUTANT (run and confirmed, see the report): recreate
-- "moderation_reports_select_reporter_or_admin" without the
-- `reported_user_id <> auth.uid()` guard -> 13 and 14 turn RED (the accused
-- admin reads the report filed against them).
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(46);

-- ---------------------------------------------------------------------------
-- Fixtures.
--   ..01 admin A1   ..02 coach C1 (coaches M1, M2)   ..03 member M1 (reporter)
--   ..04 member M2 (accused)  ..05 coach C2  ..06 admin A2 (ACCUSED in R3)
--   ..0a group G1 (M1 + M2 are in it)
--   R1 open (M1 -> M2), R2 open (M2 -> M1), R3 open (M1 -> A2)
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'h31-' || u.n || '@test.invalid', 'x', now(), now()
from (values
  ('7a310000-0000-4000-8000-000000000001'::uuid, 1),
  ('7a310000-0000-4000-8000-000000000002'::uuid, 2),
  ('7a310000-0000-4000-8000-000000000003'::uuid, 3),
  ('7a310000-0000-4000-8000-000000000004'::uuid, 4),
  ('7a310000-0000-4000-8000-000000000005'::uuid, 5),
  ('7a310000-0000-4000-8000-000000000006'::uuid, 6)
) as u(id, n);

insert into public.profiles (id, full_name, role, coach_id) values
  ('7a310000-0000-4000-8000-000000000001', 'H31 Admin One',  'admin',  null),
  ('7a310000-0000-4000-8000-000000000002', 'H31 Coach One',  'coach',  null),
  ('7a310000-0000-4000-8000-000000000003', 'H31 Member One', 'member', '7a310000-0000-4000-8000-000000000002'),
  ('7a310000-0000-4000-8000-000000000004', 'H31 Member Two', 'member', '7a310000-0000-4000-8000-000000000002'),
  ('7a310000-0000-4000-8000-000000000005', 'H31 Coach Two',  'coach',  null),
  ('7a310000-0000-4000-8000-000000000006', 'H31 Admin Two',  'admin',  null);

insert into public.groups (id, name, created_by)
values ('7a310000-0000-4000-8000-00000000000a', 'H31 Morning Crew',
        '7a310000-0000-4000-8000-000000000002');

insert into public.group_members (group_id, member_id) values
  ('7a310000-0000-4000-8000-00000000000a', '7a310000-0000-4000-8000-000000000003'),
  ('7a310000-0000-4000-8000-00000000000a', '7a310000-0000-4000-8000-000000000004');

insert into public.moderation_reports (id, reporter_id, reported_user_id, reason, status, content_ref) values
  ('7a310000-0000-4000-8000-0000000000b1', '7a310000-0000-4000-8000-000000000003',
   '7a310000-0000-4000-8000-000000000004', 'H31 R1: abusive message', 'open', 'group_message:1'),
  ('7a310000-0000-4000-8000-0000000000b2', '7a310000-0000-4000-8000-000000000004',
   '7a310000-0000-4000-8000-000000000003', 'H31 R2: counter report', 'open', null),
  ('7a310000-0000-4000-8000-0000000000b3', '7a310000-0000-4000-8000-000000000003',
   '7a310000-0000-4000-8000-000000000006', 'H31 R3: report against admin A2', 'open', null);

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------

select has_column('public', 'moderation_reports', 'resolved_by', 'resolved_by added');     -- 1
select has_column('public', 'moderation_reports', 'resolved_at', 'resolved_at added');     -- 2
select has_column('public', 'moderation_reports', 'resolution_note', 'resolution_note added'); -- 3
select has_column('public', 'moderation_reports', 'content_ref', 'content_ref added');     -- 4
select has_table('public', 'moderation_actions', 'moderation_actions exists');             -- 5
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'moderation_actions'
      and cmd in ('INSERT', 'UPDATE', 'DELETE')),
  0,
  'moderation_actions has no client write policy');                                        -- 6

-- ---------------------------------------------------------------------------
-- Report visibility matrix
-- ---------------------------------------------------------------------------

set local role authenticated;

-- Reporter M1 sees R1 and R3 (the ones they filed) but NOT R2 (filed against them).
select set_config('request.jwt.claim.sub', '7a310000-0000-4000-8000-000000000003', true);
select is(auth.uid(), '7a310000-0000-4000-8000-000000000003'::uuid,
          'identity: caller is member M1');                                                -- 7
select bag_eq(
  $$ select id from public.moderation_reports where reason like 'H31 %' $$,
  $$ values ('7a310000-0000-4000-8000-0000000000b1'::uuid),
            ('7a310000-0000-4000-8000-0000000000b3'::uuid) $$,
  'visibility: a reporter reads their own reports and never one filed against them');      -- 8

-- The ACCUSED (M2) sees only the report THEY filed, never R1 about them.
select set_config('request.jwt.claim.sub', '7a310000-0000-4000-8000-000000000004', true);
select bag_eq(
  $$ select id from public.moderation_reports where reason like 'H31 %' $$,
  $$ values ('7a310000-0000-4000-8000-0000000000b2'::uuid) $$,
  'visibility: the accused never reads the report filed about them');                      -- 9

-- The members' own COACH now reads nothing: coaches are not moderators.
select set_config('request.jwt.claim.sub', '7a310000-0000-4000-8000-000000000002', true);
select is((select count(*)::int from public.moderation_reports where reason like 'H31 %'),
          0,
          'visibility: the members'' own coach reads no reports at all any more');         -- 10
select set_config('request.jwt.claim.sub', '7a310000-0000-4000-8000-000000000005', true);
select is((select count(*)::int from public.moderation_reports where reason like 'H31 %'),
          0,
          'visibility: an unrelated coach reads no reports');                              -- 11

-- Admin A1 reads all three.
select set_config('request.jwt.claim.sub', '7a310000-0000-4000-8000-000000000001', true);
select is((select count(*)::int from public.moderation_reports where reason like 'H31 %'),
          3,
          'visibility: an admin reads every report');                                      -- 12

-- Admin A2 is the ACCUSED in R3: they must not read it, admin or not.
select set_config('request.jwt.claim.sub', '7a310000-0000-4000-8000-000000000006', true);
select is((select count(*)::int from public.moderation_reports
            where id = '7a310000-0000-4000-8000-0000000000b3'),
          0,
          'visibility: an ADMIN who is the accused cannot read the report about them');    -- 13
select is((select count(*)::int from public.moderation_reports where reason like 'H31 %'),
          2,
          'visibility: that admin still reads the other reports');                         -- 14
select is((select count(*)::int from public.admin_list_reports('all', null, null, 100)
            where id = '7a310000-0000-4000-8000-0000000000b3'),
          0,
          'queue: admin_list_reports also hides the calling admin''s own report');         -- 15

-- ---------------------------------------------------------------------------
-- admin_list_reports / review_report as admin A1
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', '7a310000-0000-4000-8000-000000000001', true);

select is(
  (select count(*)::int from public.admin_list_reports('open', null, null, 100)
    where reason like 'H31 %'),
  3,
  'queue: the three open fixture reports are listed');                                     -- 16
select is(
  (select reporter_name from public.admin_list_reports('open', null, null, 100)
    where id = '7a310000-0000-4000-8000-0000000000b1'),
  'H31 Member One',
  'queue: the reporter name is joined in');                                                -- 17
select is(
  (select reported_name from public.admin_list_reports('open', null, null, 100)
    where id = '7a310000-0000-4000-8000-0000000000b1'),
  'H31 Member Two',
  'queue: the reported name is joined in');                                                -- 18
select throws_ok(
  $$ select public.admin_list_reports('nonsense') $$,
  '22023', 'invalid_status_filter',
  'queue: an unknown status filter is refused');                                           -- 19

select is((select status from public.review_report(
            '7a310000-0000-4000-8000-0000000000b1', 'actioned', 'warned the member')),
          'actioned',
          'review: an admin resolves a report');                                           -- 20
select is((select status from public.moderation_reports
            where id = '7a310000-0000-4000-8000-0000000000b1'),
          'actioned',
          'review: the report status is persisted');                                       -- 21
select is((select resolved_by from public.moderation_reports
            where id = '7a310000-0000-4000-8000-0000000000b1'),
          '7a310000-0000-4000-8000-000000000001'::uuid,
          'review: resolved_by is the acting admin');                                      -- 22
select ok((select resolved_at is not null from public.moderation_reports
            where id = '7a310000-0000-4000-8000-0000000000b1'),
          'review: resolved_at is stamped');                                               -- 23
select is((select count(*)::int from public.moderation_actions
            where report_id = '7a310000-0000-4000-8000-0000000000b1' and action = 'warn'),
          1,
          'review: an audit row was appended');                                            -- 24
select is((select count(*)::int from public.admin_list_reports('open', null, null, 100)
            where reason like 'H31 %'),
          2,
          'queue: the resolved report drops out of the open queue');                       -- 25
select throws_ok(
  $$ select public.review_report('7a310000-0000-4000-8000-0000000000b1', 'bogus') $$,
  '22023', 'invalid_status',
  'review: an unknown target status is refused');                                          -- 26
select throws_ok(
  $$ select public.review_report('7a310000-0000-4000-8000-00000000dead', 'reviewed') $$,
  'P0002', 'report_not_found',
  'review: an unknown report is refused');                                                 -- 27

-- Admin A2 may not resolve the report filed against them.
select set_config('request.jwt.claim.sub', '7a310000-0000-4000-8000-000000000006', true);
select throws_ok(
  $$ select public.review_report('7a310000-0000-4000-8000-0000000000b3', 'dismissed') $$,
  '42501', 'accused_cannot_review',
  'review: the ACCUSED admin cannot dismiss the report about themselves');                 -- 28

-- ---------------------------------------------------------------------------
-- remove_from_group
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', '7a310000-0000-4000-8000-000000000001', true);
select is((select removed from public.remove_from_group(
            '7a310000-0000-4000-8000-00000000000a',
            '7a310000-0000-4000-8000-000000000004',
            '7a310000-0000-4000-8000-0000000000b1', 'repeat offender')),
          true,
          'remove: the membership is deleted');                                            -- 29
select is((select count(*)::int from public.group_members
            where group_id = '7a310000-0000-4000-8000-00000000000a'
              and member_id = '7a310000-0000-4000-8000-000000000004'),
          0,
          'remove: the row really is gone');                                               -- 30
select is((select count(*)::int from public.moderation_actions
            where action = 'remove_from_group'
              and target_member = '7a310000-0000-4000-8000-000000000004'),
          1,
          'remove: an audit row was appended');                                            -- 31
select is((select removed from public.remove_from_group(
            '7a310000-0000-4000-8000-00000000000a',
            '7a310000-0000-4000-8000-000000000004')),
          false,
          'remove: a repeat call reports removed=false but is still audited');             -- 32
select throws_ok(
  $$ select public.remove_from_group('7a310000-0000-4000-8000-00000000dead',
                                     '7a310000-0000-4000-8000-000000000003') $$,
  'P0002', 'group_not_found',
  'remove: an unknown group is refused');                                                  -- 33

-- ---------------------------------------------------------------------------
-- Non-admins are refused by every RPC
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', '7a310000-0000-4000-8000-000000000003', true);
select throws_ok($$ select public.admin_list_reports() $$, '42501', 'admin_required',
  'authz: a member cannot list reports');                                                  -- 34
select set_config('request.jwt.claim.sub', '7a310000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$ select public.review_report('7a310000-0000-4000-8000-0000000000b2', 'dismissed') $$,
  '42501', 'admin_required',
  'authz: the members'' coach cannot resolve a report');                                   -- 35
select throws_ok(
  $$ select public.remove_from_group('7a310000-0000-4000-8000-00000000000a',
                                     '7a310000-0000-4000-8000-000000000003') $$,
  '42501', 'admin_required',
  'authz: a coach cannot remove a member from a group via the moderation RPC');            -- 36
select set_config('request.jwt.claim.sub', '7a310000-0000-4000-8000-000000000005', true);
select throws_ok($$ select public.admin_list_reports() $$, '42501', 'admin_required',
  'authz: an unrelated coach cannot list reports');                                        -- 37
select is((select count(*)::int from public.moderation_actions), 0,
          'authz: a coach reads no audit rows');                                           -- 38

-- ---------------------------------------------------------------------------
-- Audit is append-only (run as the RLS-bypassing owner to reach the trigger)
-- ---------------------------------------------------------------------------

reset role;
select throws_ok(
  $$ update public.moderation_actions set note = 'tampered'
      where target_member = '7a310000-0000-4000-8000-000000000004' $$,
  '42501', 'moderation_actions_append_only',
  'audit: UPDATE is rejected even for the owner');                                         -- 39
select throws_ok(
  $$ delete from public.moderation_actions
      where target_member = '7a310000-0000-4000-8000-000000000004' $$,
  '42501', 'moderation_actions_append_only',
  'audit: DELETE is rejected even for the owner');                                         -- 40

-- ---------------------------------------------------------------------------
-- Direct anon calls (the segfault-prone path)
-- ---------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select throws_ok($$ select public.admin_list_reports() $$, '42501', 'admin_required',
  'anon: admin_list_reports is refused, not a crash');                                     -- 41
select throws_ok(
  $$ select public.review_report('7a310000-0000-4000-8000-0000000000b2', 'dismissed') $$,
  '42501', 'admin_required', 'anon: review_report is refused');                            -- 42
select throws_ok(
  $$ select public.remove_from_group('7a310000-0000-4000-8000-00000000000a',
                                     '7a310000-0000-4000-8000-000000000003') $$,
  '42501', 'admin_required', 'anon: remove_from_group is refused');                        -- 43
select is((select count(*)::int from public.moderation_reports where reason like 'H31 %'), 0,
          'anon: reads no reports');                                                       -- 44
select is((select count(*)::int from public.moderation_actions), 0,
          'anon: reads no audit rows');                                                    -- 45

-- ---------------------------------------------------------------------------
-- Old clients: filing a report still works exactly as before
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a310000-0000-4000-8000-000000000004', true);
select lives_ok(
  $$ insert into public.moderation_reports (reporter_id, reported_user_id, reason)
     values ('7a310000-0000-4000-8000-000000000004',
             '7a310000-0000-4000-8000-000000000003',
             'H31 legacy client insert') $$,
  'backcompat: the old direct insert from reportUser() still succeeds');                   -- 46

select * from finish();
rollback;
