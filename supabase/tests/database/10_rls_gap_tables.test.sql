-- ============================================================================
-- 10_rls_gap_tables.test.sql
--
-- RLS for the four policy-bearing tables the existing suite never exercises
-- end to end: user_blocks, moderation_reports, push_tokens and
-- live_class_participants -- plus the two row-cap triggers that guard the
-- last two (push_tokens_enforce_row_cap, moderation_reports_enforce_row_cap).
--
-- Every table is probed as: the rightful actor, another member, an EXPIRED
-- member, a coach of another coach, an admin, a stranger and anon. anon must
-- always come back clean-empty or cleanly denied -- never a crash.
--
-- Run with: supabase test db supabase/tests/database/10_rls_gap_tables.test.sql
-- One transaction, rolled back. Fixture prefix 7a10… is unique to this file.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;

-- SET LOCAL survives the SET ROLE switches below, so public.* and the pgTAP
-- assertions both resolve under every identity this file assumes.
set local search_path = public, extensions;

select plan(50);

-- ---------------------------------------------------------------------------
-- Fixtures (superuser, RLS bypassed, rolled back at the end).
--   ..01 coach A   ..02 member A1 ACTIVE   ..03 member A2 EXPIRED
--   ..04 coach B   ..05 member B1 ACTIVE   ..06 admin   ..07 stranger
--   ..c1 coach A's class                   ..c2 coach B's class
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'gap10-' || u.n || '@test.invalid', 'x', now(), now()
from (values
  ('7a100000-0000-4000-8000-000000000001'::uuid, 1),
  ('7a100000-0000-4000-8000-000000000002'::uuid, 2),
  ('7a100000-0000-4000-8000-000000000003'::uuid, 3),
  ('7a100000-0000-4000-8000-000000000004'::uuid, 4),
  ('7a100000-0000-4000-8000-000000000005'::uuid, 5),
  ('7a100000-0000-4000-8000-000000000006'::uuid, 6),
  ('7a100000-0000-4000-8000-000000000007'::uuid, 7)
) as u(id, n);

insert into public.profiles (id, role, coach_id, full_name) values
  ('7a100000-0000-4000-8000-000000000001', 'coach',  null,                                   'S10 Coach A'),
  ('7a100000-0000-4000-8000-000000000002', 'member', '7a100000-0000-4000-8000-000000000001', 'S10 Member A1'),
  ('7a100000-0000-4000-8000-000000000003', 'member', '7a100000-0000-4000-8000-000000000001', 'S10 Member A2 Expired'),
  ('7a100000-0000-4000-8000-000000000004', 'coach',  null,                                   'S10 Coach B'),
  ('7a100000-0000-4000-8000-000000000005', 'member', '7a100000-0000-4000-8000-000000000004', 'S10 Member B1'),
  ('7a100000-0000-4000-8000-000000000006', 'admin',  null,                                   'S10 Admin'),
  ('7a100000-0000-4000-8000-000000000007', 'member', null,                                   'S10 Stranger');

insert into public.subscriptions (member_id, status, current_period_end) values
  ('7a100000-0000-4000-8000-000000000002', 'active',   now() + interval '30 days'),
  -- 30 days past the end of a 10-day grace window: unambiguously EXPIRED.
  ('7a100000-0000-4000-8000-000000000003', 'past_due', now() - interval '40 days'),
  ('7a100000-0000-4000-8000-000000000005', 'active',   now() + interval '30 days');

insert into public.live_classes (id, coach_id, title, agora_channel_name, starts_at, status) values
  ('7a100000-0000-4000-8000-0000000000c1', '7a100000-0000-4000-8000-000000000001',
   'S10 Coach A Class', 's10-coach-a-chan', now() + interval '1 hour', 'scheduled'),
  ('7a100000-0000-4000-8000-0000000000c2', '7a100000-0000-4000-8000-000000000004',
   'S10 Coach B Class', 's10-coach-b-chan', now() + interval '1 hour', 'scheduled');

-- A block filed by someone else, so "I only see my own" is a real claim and
-- not just an empty table.
insert into public.user_blocks (blocker_id, blocked_id) values
  ('7a100000-0000-4000-8000-000000000003', '7a100000-0000-4000-8000-000000000007');

-- ===========================================================================
-- user_blocks -- blocker-only, in every direction.
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a100000-0000-4000-8000-000000000002', true);

select is(auth.uid(), '7a100000-0000-4000-8000-000000000002'::uuid,
          'identity: caller is member A1');                                                -- 1

select lives_ok(
  $$insert into public.user_blocks (blocker_id, blocked_id)
    values ('7a100000-0000-4000-8000-000000000002', '7a100000-0000-4000-8000-000000000003')$$,
  'user_blocks: a member may block someone as themselves');                                -- 2
select is((select count(*)::int from public.user_blocks
            where blocker_id::text like '7a100000%'), 1,
          'user_blocks: A1 sees only the row A1 filed, not A2 pre-existing block');        -- 3
select throws_ok(
  $$insert into public.user_blocks (blocker_id, blocked_id)
    values ('7a100000-0000-4000-8000-000000000003', '7a100000-0000-4000-8000-000000000002')$$,
  '42501',
  'new row violates row-level security policy for table "user_blocks"',
  'user_blocks: a member cannot file a block on someone else behalf');                     -- 4

with u as (update public.user_blocks set blocked_id = '7a100000-0000-4000-8000-000000000007'
            where blocker_id = auth.uid() returning 1)
select is((select count(*)::int from u), 0,
          'user_blocks: there is no UPDATE policy, so even own row updates 0 rows');       -- 5
with d as (delete from public.user_blocks
            where blocker_id = '7a100000-0000-4000-8000-000000000003' returning 1)
select is((select count(*)::int from d), 0,
          'user_blocks: a member cannot delete someone else block');                       -- 6

-- The blocked party must not learn they were blocked.
select set_config('request.jwt.claim.sub', '7a100000-0000-4000-8000-000000000003', true);
select is((select count(*)::int from public.user_blocks
            where blocker_id = '7a100000-0000-4000-8000-000000000002'), 0,
          'user_blocks: the blocked member cannot see the block filed against them');      -- 7

-- No coach or admin override on this table: blocks are private to the blocker.
select set_config('request.jwt.claim.sub', '7a100000-0000-4000-8000-000000000001', true);
select is((select count(*)::int from public.user_blocks
            where blocker_id::text like '7a100000%'), 0,
          'user_blocks: a coach sees none of their members blocks');                       -- 8
select set_config('request.jwt.claim.sub', '7a100000-0000-4000-8000-000000000006', true);
select is((select count(*)::int from public.user_blocks
            where blocker_id::text like '7a100000%'), 0,
          'user_blocks: an admin sees no blocks either');                                  -- 9

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is(auth.uid(), null::uuid, 'identity: anon has a null auth.uid()');                 -- 10
select is((select count(*)::int from public.user_blocks
            where blocker_id::text like '7a100000%'), 0,
          'user_blocks: anon reads nothing (clean empty, no error)');                      -- 11
select throws_ok(
  $$insert into public.user_blocks (blocker_id, blocked_id)
    values ('7a100000-0000-4000-8000-000000000002', '7a100000-0000-4000-8000-000000000007')$$,
  '42501',
  'new row violates row-level security policy for table "user_blocks"',
  'user_blocks: anon cannot file a block');                                                -- 12

-- ===========================================================================
-- moderation_reports -- reporter + the moderators with a real relationship.
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a100000-0000-4000-8000-000000000002', true);

select lives_ok(
  $$insert into public.moderation_reports (reporter_id, reported_user_id, reason, status)
    values ('7a100000-0000-4000-8000-000000000002',
            '7a100000-0000-4000-8000-000000000005', 'S10 spam in the group chat', 'open')$$,
  'moderation_reports: a member may report someone as themselves');                        -- 13
select is((select count(*)::int from public.moderation_reports
            where reporter_id = '7a100000-0000-4000-8000-000000000002'
              and reported_user_id = '7a100000-0000-4000-8000-000000000005'), 1,
          'moderation_reports: the reporter reads their own report back');                 -- 14
select throws_ok(
  $$insert into public.moderation_reports (reporter_id, reported_user_id, reason, status)
    values ('7a100000-0000-4000-8000-000000000003',
            '7a100000-0000-4000-8000-000000000005', 'S10 forged report', 'open')$$,
  '42501',
  'new row violates row-level security policy for table "moderation_reports"',
  'moderation_reports: a member cannot file a report under another reporter_id');          -- 15

with u as (update public.moderation_reports set status = 'dismissed'
            where reporter_id = auth.uid() returning 1)
select is((select count(*)::int from u), 0,
          'moderation_reports: the reporter cannot adjudicate their own report');          -- 16

-- The reported member must not see the report about them.
select set_config('request.jwt.claim.sub', '7a100000-0000-4000-8000-000000000005', true);
select is((select count(*)::int from public.moderation_reports
            where reported_user_id = '7a100000-0000-4000-8000-000000000005'), 0,
          'moderation_reports: the reported member cannot see the report');                -- 17

-- 20260921131000 (moderation_admin) replaced the "reporter or moderator" pair
-- of policies with "reporter or admin": a coach is no longer a moderator by
-- virtue of a relationship to either party. Neither coach may read or action it
-- now; the admin control below is what keeps these from passing vacuously.
select set_config('request.jwt.claim.sub', '7a100000-0000-4000-8000-000000000001', true);
select is((select count(*)::int from public.moderation_reports
            where reporter_id = '7a100000-0000-4000-8000-000000000002'), 0,
          'moderation_reports: the reporter coach cannot see the report (admin-only)');    -- 18
with u as (update public.moderation_reports set status = 'reviewed'
            where reporter_id = '7a100000-0000-4000-8000-000000000002'
              and reported_user_id = '7a100000-0000-4000-8000-000000000005' returning 1)
select is((select count(*)::int from u), 0,
          'moderation_reports: the reporter coach cannot move it to reviewed');            -- 19

-- ...and neither is the reported member's coach.
select set_config('request.jwt.claim.sub', '7a100000-0000-4000-8000-000000000004', true);
select is((select count(*)::int from public.moderation_reports
            where reported_user_id = '7a100000-0000-4000-8000-000000000005'), 0,
          'moderation_reports: the reported member coach cannot see the report');          -- 20

-- Admin sees it; an unrelated member does not.
select set_config('request.jwt.claim.sub', '7a100000-0000-4000-8000-000000000006', true);
select is((select count(*)::int from public.moderation_reports
            where reporter_id = '7a100000-0000-4000-8000-000000000002'), 1,
          'moderation_reports: an admin can see the report');                              -- 21
select set_config('request.jwt.claim.sub', '7a100000-0000-4000-8000-000000000007', true);
select is((select count(*)::int from public.moderation_reports
            where reporter_id::text like '7a100000%'), 0,
          'moderation_reports: an unrelated member sees nothing');                         -- 22

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is((select count(*)::int from public.moderation_reports
            where reporter_id::text like '7a100000%'), 0,
          'moderation_reports: anon reads nothing');                                       -- 23
select throws_ok(
  $$insert into public.moderation_reports (reporter_id, reported_user_id, reason, status)
    values ('7a100000-0000-4000-8000-000000000002',
            '7a100000-0000-4000-8000-000000000005', 'S10 anon report', 'open')$$,
  '42501',
  'new row violates row-level security policy for table "moderation_reports"',
  'moderation_reports: anon cannot file a report');                                        -- 24

-- A moderator may not adjudicate a report filed about themselves.
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a100000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$insert into public.moderation_reports (reporter_id, reported_user_id, reason, status)
    values ('7a100000-0000-4000-8000-000000000002',
            '7a100000-0000-4000-8000-000000000006', 'S10 report about the admin', 'open')$$,
  'moderation_reports: a member may report an admin');                                     -- 25
select set_config('request.jwt.claim.sub', '7a100000-0000-4000-8000-000000000006', true);
with u as (update public.moderation_reports set status = 'dismissed'
            where reported_user_id = '7a100000-0000-4000-8000-000000000006' returning 1)
select is((select count(*)::int from u), 0,
          'moderation_reports: an admin cannot dismiss a report about themselves');        -- 26

-- Row cap: three open reports about one pair is the ceiling.
select set_config('request.jwt.claim.sub', '7a100000-0000-4000-8000-000000000002', true);
insert into public.moderation_reports (reporter_id, reported_user_id, reason, status)
values ('7a100000-0000-4000-8000-000000000002', '7a100000-0000-4000-8000-000000000003', 'S10 cap 1', 'open');
insert into public.moderation_reports (reporter_id, reported_user_id, reason, status)
values ('7a100000-0000-4000-8000-000000000002', '7a100000-0000-4000-8000-000000000003', 'S10 cap 2', 'open');
insert into public.moderation_reports (reporter_id, reported_user_id, reason, status)
values ('7a100000-0000-4000-8000-000000000002', '7a100000-0000-4000-8000-000000000003', 'S10 cap 3', 'open');
select throws_ok(
  $$insert into public.moderation_reports (reporter_id, reported_user_id, reason, status)
    values ('7a100000-0000-4000-8000-000000000002',
            '7a100000-0000-4000-8000-000000000003', 'S10 cap 4', 'open')$$,
  '54000',
  'you already have an open report about this member',
  'moderation_reports: the 4th open report about one member is refused');                  -- 27

-- ===========================================================================
-- push_tokens -- strictly self-service, with no staff override.
-- ===========================================================================
select lives_ok(
  $$insert into public.push_tokens (user_id, expo_push_token, platform)
    values ('7a100000-0000-4000-8000-000000000002', 'ExponentPushToken[s10-a1]', 'ios')$$,
  'push_tokens: a member may register their own token');                                   -- 28
select is((select count(*)::int from public.push_tokens
            where user_id = '7a100000-0000-4000-8000-000000000002'), 1,
          'push_tokens: the owner reads their own token back');                            -- 29
select throws_ok(
  $$insert into public.push_tokens (user_id, expo_push_token)
    values ('7a100000-0000-4000-8000-000000000003', 'ExponentPushToken[s10-forged]')$$,
  '42501',
  'new row violates row-level security policy for table "push_tokens"',
  'push_tokens: a member cannot register a token for someone else');                       -- 30
with u as (update public.push_tokens set platform = 'android'
            where user_id = auth.uid() returning 1)
select is((select count(*)::int from u), 1,
          'push_tokens: the owner may update their own token');                            -- 31

select set_config('request.jwt.claim.sub', '7a100000-0000-4000-8000-000000000003', true);
select is((select count(*)::int from public.push_tokens
            where user_id = '7a100000-0000-4000-8000-000000000002'), 0,
          'push_tokens: another member cannot read the token');                            -- 32
select set_config('request.jwt.claim.sub', '7a100000-0000-4000-8000-000000000001', true);
select is((select count(*)::int from public.push_tokens
            where user_id = '7a100000-0000-4000-8000-000000000002'), 0,
          'push_tokens: the member own coach cannot read the token');                      -- 33
select set_config('request.jwt.claim.sub', '7a100000-0000-4000-8000-000000000006', true);
select is((select count(*)::int from public.push_tokens
            where user_id = '7a100000-0000-4000-8000-000000000002'), 0,
          'push_tokens: an admin cannot read the token');                                  -- 34

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is((select count(*)::int from public.push_tokens
            where user_id::text like '7a100000%'), 0,
          'push_tokens: anon reads nothing');                                              -- 35
select throws_ok(
  $$insert into public.push_tokens (user_id, expo_push_token)
    values ('7a100000-0000-4000-8000-000000000002', 'ExponentPushToken[s10-anon]')$$,
  '42501',
  'new row violates row-level security policy for table "push_tokens"',
  'push_tokens: anon cannot register a token');                                            -- 36

-- Row cap: 20 tokens per user. Insert one row per statement so the BEFORE
-- trigger sees each previous row committed to the subtransaction.
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a100000-0000-4000-8000-000000000002', true);
do $cap$
begin
  for i in 2..20 loop
    insert into public.push_tokens (user_id, expo_push_token)
    values ('7a100000-0000-4000-8000-000000000002', 'ExponentPushToken[s10-cap-' || i || ']');
  end loop;
end
$cap$;
select is((select count(*)::int from public.push_tokens
            where user_id = '7a100000-0000-4000-8000-000000000002'), 20,
          'push_tokens: 20 tokens is allowed');                                            -- 37
select throws_ok(
  $$insert into public.push_tokens (user_id, expo_push_token)
    values ('7a100000-0000-4000-8000-000000000002', 'ExponentPushToken[s10-cap-21]')$$,
  '54000',
  'too many registered push tokens for this user',
  'push_tokens: the 21st token is refused');                                               -- 38
with d as (delete from public.push_tokens
            where user_id = auth.uid() and expo_push_token = 'ExponentPushToken[s10-a1]'
            returning 1)
select is((select count(*)::int from d), 1,
          'push_tokens: the owner may delete their own token');                            -- 39

-- ===========================================================================
-- live_class_participants -- gated by can_join_live_class on write.
-- ===========================================================================
select lives_ok(
  $$insert into public.live_class_participants (live_class_id, member_id, joined_at)
    values ('7a100000-0000-4000-8000-0000000000c1',
            '7a100000-0000-4000-8000-000000000002', now())$$,
  'live_class_participants: an entitled member of the class coach may join');               -- 40
select throws_ok(
  $$insert into public.live_class_participants (live_class_id, member_id)
    values ('7a100000-0000-4000-8000-0000000000c1',
            '7a100000-0000-4000-8000-000000000003')$$,
  '42501',
  'new row violates row-level security policy for table "live_class_participants"',
  'live_class_participants: a member cannot enrol someone else');                          -- 41
select is((select count(*)::int from public.live_class_participants
            where live_class_id = '7a100000-0000-4000-8000-0000000000c1'), 1,
          'live_class_participants: the member sees their own participation row');         -- 42

-- An EXPIRED member of the same coach is refused.
select set_config('request.jwt.claim.sub', '7a100000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$insert into public.live_class_participants (live_class_id, member_id)
    values ('7a100000-0000-4000-8000-0000000000c1',
            '7a100000-0000-4000-8000-000000000003')$$,
  '42501',
  'new row violates row-level security policy for table "live_class_participants"',
  'live_class_participants: an EXPIRED member of the coach cannot join');                  -- 43
select is((select count(*)::int from public.live_class_participants
            where live_class_id = '7a100000-0000-4000-8000-0000000000c1'), 0,
          'live_class_participants: a non-participant member sees no rows');               -- 44

-- A paid-up member of a DIFFERENT coach is refused: this is tenancy, not money.
select set_config('request.jwt.claim.sub', '7a100000-0000-4000-8000-000000000005', true);
select throws_ok(
  $$insert into public.live_class_participants (live_class_id, member_id)
    values ('7a100000-0000-4000-8000-0000000000c1',
            '7a100000-0000-4000-8000-000000000005')$$,
  '42501',
  'new row violates row-level security policy for table "live_class_participants"',
  'live_class_participants: another coach paying member cannot join this class');          -- 45

-- The class's coach sees the roster; another coach does not.
select set_config('request.jwt.claim.sub', '7a100000-0000-4000-8000-000000000001', true);
select is((select count(*)::int from public.live_class_participants
            where live_class_id = '7a100000-0000-4000-8000-0000000000c1'), 1,
          'live_class_participants: the class coach sees the participant');                -- 46
select set_config('request.jwt.claim.sub', '7a100000-0000-4000-8000-000000000004', true);
select is((select count(*)::int from public.live_class_participants
            where live_class_id = '7a100000-0000-4000-8000-0000000000c1'), 0,
          'live_class_participants: another coach sees no participants');                  -- 47

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is((select count(*)::int from public.live_class_participants
            where live_class_id = '7a100000-0000-4000-8000-0000000000c1'), 0,
          'live_class_participants: anon sees no participants');                           -- 48
select throws_ok(
  $$insert into public.live_class_participants (live_class_id, member_id)
    values ('7a100000-0000-4000-8000-0000000000c1',
            '7a100000-0000-4000-8000-000000000002')$$,
  '42501',
  'new row violates row-level security policy for table "live_class_participants"',
  'live_class_participants: anon cannot join');                                            -- 49

set local role authenticated;
select set_config('request.jwt.claim.sub', '7a100000-0000-4000-8000-000000000002', true);
with d as (delete from public.live_class_participants
            where live_class_id = '7a100000-0000-4000-8000-0000000000c1'
              and member_id = auth.uid() returning 1)
select is((select count(*)::int from d), 1,
          'live_class_participants: a member may leave their own class');                  -- 50

select * from finish();

rollback;
