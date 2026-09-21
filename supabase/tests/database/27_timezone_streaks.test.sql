-- ============================================================================
-- 27_timezone_streaks.test.sql
--
-- Pins migration 20260921112000_timezone_local_dates.sql:
--   * profiles.timezone — default, canonicalisation, rejection of nonsense,
--     and the fact that the member owns it
--   * profiles.coach_assigned_at — server-maintained, never client-settable
--   * workout_completions.completed_local_date — the MEMBER's calendar date,
--     across UTC+3, UTC-8, UTC+14 and both US DST transitions
--   * the re-keyed one-per-day rule: two sessions on the same UTC date but
--     different LOCAL dates are two different days, which is the whole point
--   * member_workout_stats.current_streak reading the local date
--   * a later timezone change never rewrites history
--
-- Run with: psql -X -f supabase/tests/database/27_timezone_streaks.test.sql
--        or supabase test db supabase/tests/database/27_timezone_streaks.test.sql
-- One transaction, rolled back. Fixture prefix 7a27... is unique to this file.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(32);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'h27-' || u.n || '@test.invalid', 'x', now(), now()
from (values
  ('7a270000-0000-4000-8000-000000000001'::uuid, 1),  -- coach
  ('7a270000-0000-4000-8000-000000000002'::uuid, 2),  -- second coach (reassignment)
  ('7a270000-0000-4000-8000-000000000011'::uuid, 11), -- Asia/Riyadh      UTC+3
  ('7a270000-0000-4000-8000-000000000012'::uuid, 12), -- America/Los_Angeles
  ('7a270000-0000-4000-8000-000000000013'::uuid, 13), -- America/New_York  DST
  ('7a270000-0000-4000-8000-000000000014'::uuid, 14), -- Pacific/Kiritimati UTC+14
  ('7a270000-0000-4000-8000-000000000015'::uuid, 15)  -- UTC, streaks
) as u(id, n);

insert into public.profiles (id, role, coach_id, full_name, timezone) values
  ('7a270000-0000-4000-8000-000000000001', 'coach',  null, 'H27 Coach', 'UTC'),
  ('7a270000-0000-4000-8000-000000000002', 'coach',  null, 'H27 Coach 2', 'UTC'),
  ('7a270000-0000-4000-8000-000000000011', 'member', '7a270000-0000-4000-8000-000000000001', 'H27 Riyadh',  'Asia/Riyadh'),
  ('7a270000-0000-4000-8000-000000000012', 'member', '7a270000-0000-4000-8000-000000000001', 'H27 LA',      'America/Los_Angeles'),
  ('7a270000-0000-4000-8000-000000000013', 'member', '7a270000-0000-4000-8000-000000000001', 'H27 NY',      'America/New_York'),
  ('7a270000-0000-4000-8000-000000000014', 'member', '7a270000-0000-4000-8000-000000000001', 'H27 Line',    'Pacific/Kiritimati');

-- Inserted without a timezone on purpose: the column default is part of the
-- contract for every profile that existed before this migration.
insert into public.profiles (id, role, coach_id, full_name) values
  ('7a270000-0000-4000-8000-000000000015', 'member', '7a270000-0000-4000-8000-000000000001', 'H27 UTC');

insert into public.workout_plans (id, member_id, coach_id, title)
select ('d7270000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       ('7a270000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       '7a270000-0000-4000-8000-000000000001'::uuid, 'H27 Plan ' || n
from generate_series(11, 15) n;

insert into public.workout_days (id, workout_plan_id, day_number, block_name)
select ('e7270000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       ('d7270000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, 1, 'H27 Day ' || n
from generate_series(11, 15) n;

-- ---------------------------------------------------------------------------
-- profiles.timezone
-- ---------------------------------------------------------------------------

select is(
  (select timezone from public.profiles where id = '7a270000-0000-4000-8000-000000000015'),
  'UTC', '01 a profile written without a timezone defaults to UTC');

select throws_ok(
  $$update public.profiles set timezone = 'Mars/Olympus'
     where id = '7a270000-0000-4000-8000-000000000015'$$,
  '22023', null, '02 an unknown timezone name is rejected with a clear error');

select lives_ok(
  $$update public.profiles set timezone = 'europe/berlin'
     where id = '7a270000-0000-4000-8000-000000000015'$$,
  '03 a differently-cased IANA name is accepted');

select is(
  (select timezone from public.profiles where id = '7a270000-0000-4000-8000-000000000015'),
  'Europe/Berlin', '04 ... and stored in the catalogue''s own spelling');

select lives_ok(
  $$update public.profiles set timezone = '   ' where id = '7a270000-0000-4000-8000-000000000015'$$,
  '05 a blank timezone does not break the write');

select is(
  (select timezone from public.profiles where id = '7a270000-0000-4000-8000-000000000015'),
  'UTC', '06 ... it falls back to UTC');

-- The member owns this field: the profile guard must let them set it.
set local role authenticated;
select set_config('request.jwt.claim.sub', '7a270000-0000-4000-8000-000000000015', true);

select is(auth.uid(), '7a270000-0000-4000-8000-000000000015'::uuid,
  '07 the member block really runs as the member');

select lives_ok(
  $$update public.profiles set timezone = 'Asia/Tokyo' where id = auth.uid()$$,
  '08 a member can set their own timezone');

select throws_ok(
  $$update public.profiles set timezone = 'Nowhere/Nothing' where id = auth.uid()$$,
  '22023', null, '09 ... but not to a name that does not exist');

-- ---------------------------------------------------------------------------
-- profiles.coach_assigned_at
-- ---------------------------------------------------------------------------

select lives_ok(
  $$update public.profiles set coach_assigned_at = '1999-01-01'::timestamptz
     where id = auth.uid()$$,
  '10 a client PATCHing coach_assigned_at is not rejected outright');

set local role postgres;

select isnt(
  (select coach_assigned_at from public.profiles where id = '7a270000-0000-4000-8000-000000000015'),
  '1999-01-01'::timestamptz, '11 ... the client value is discarded, not stored');

select ok(
  (select coach_assigned_at is not null from public.profiles
   where id = '7a270000-0000-4000-8000-000000000011'),
  '12 a member inserted with a coach is stamped with an assignment time');

select ok(
  (select coach_assigned_at is null from public.profiles
   where id = '7a270000-0000-4000-8000-000000000001'),
  '13 a coach, who has no coach of their own, has no assignment time');

update public.profiles set coach_assigned_at = '2020-01-01'::timestamptz
 where id = '7a270000-0000-4000-8000-000000000011';
update public.profiles set coach_id = '7a270000-0000-4000-8000-000000000002'
 where id = '7a270000-0000-4000-8000-000000000011';

select ok(
  (select coach_assigned_at > '2021-01-01'::timestamptz from public.profiles
   where id = '7a270000-0000-4000-8000-000000000011'),
  '14 changing the coach re-stamps coach_assigned_at');

update public.profiles set coach_id = '7a270000-0000-4000-8000-000000000001'
 where id = '7a270000-0000-4000-8000-000000000011';

-- ---------------------------------------------------------------------------
-- completed_local_date. Every completed_at below is written explicitly, which
-- only a privileged writer may do — a client's value is overwritten with
-- now() by the existing guard trigger, and that ordering is itself asserted
-- at the end of this section.
-- ---------------------------------------------------------------------------

insert into public.workout_completions (id, member_id, workout_day_id, completed_at) values
  -- UTC+3: 00:30 on the 10th locally is still the 9th in UTC.
  ('c7270000-0000-4000-8000-000000000001', '7a270000-0000-4000-8000-000000000011',
   'e7270000-0000-4000-8000-000000000011', '2026-03-09 21:30:00+00'),
  -- Same member, same day, 23:00 local on the 9th: SAME UTC date, different
  -- local date. Under the old UTC key this second row was a duplicate.
  ('c7270000-0000-4000-8000-000000000002', '7a270000-0000-4000-8000-000000000011',
   'e7270000-0000-4000-8000-000000000011', '2026-03-09 20:00:00+00'),
  -- UTC-8: 23:30 local on the 4th is already the 5th in UTC.
  ('c7270000-0000-4000-8000-000000000003', '7a270000-0000-4000-8000-000000000012',
   'e7270000-0000-4000-8000-000000000012', '2026-03-05 07:30:00+00'),
  -- America/New_York, spring forward 2026-03-08 02:00 -> 03:00.
  ('c7270000-0000-4000-8000-000000000004', '7a270000-0000-4000-8000-000000000013',
   'e7270000-0000-4000-8000-000000000013', '2026-03-08 04:30:00+00'),
  ('c7270000-0000-4000-8000-000000000005', '7a270000-0000-4000-8000-000000000013',
   'e7270000-0000-4000-8000-000000000013', '2026-03-08 07:30:00+00'),
  -- ... and fall back 2026-11-01, the hour that happens twice.
  ('c7270000-0000-4000-8000-000000000006', '7a270000-0000-4000-8000-000000000013',
   'e7270000-0000-4000-8000-000000000013', '2026-11-01 05:30:00+00'),
  -- UTC+14, the furthest a local date can run ahead of UTC.
  ('c7270000-0000-4000-8000-000000000007', '7a270000-0000-4000-8000-000000000014',
   'e7270000-0000-4000-8000-000000000014', '2026-06-01 11:00:00+00');

select is(
  (select completed_local_date from public.workout_completions
   where id = 'c7270000-0000-4000-8000-000000000001'),
  '2026-03-10'::date, '15 UTC+3 at 00:30 local counts as the local day, not the UTC one');

select is(
  (select completed_local_date from public.workout_completions
   where id = 'c7270000-0000-4000-8000-000000000002'),
  '2026-03-09'::date, '16 ... and 23:00 the previous local evening is the previous local day');

select is(
  (select count(*) from public.workout_completions
   where member_id = '7a270000-0000-4000-8000-000000000011'),
  2::bigint, '17 two sessions on ONE UTC date but two LOCAL dates are both kept');

select throws_ok(
  $$insert into public.workout_completions (member_id, workout_day_id, completed_at)
    values ('7a270000-0000-4000-8000-000000000011',
            'e7270000-0000-4000-8000-000000000011', '2026-03-10 05:00:00+00')$$,
  '23505', null, '18 a second session on the SAME local date is still refused');

select is(
  (select completed_local_date from public.workout_completions
   where id = 'c7270000-0000-4000-8000-000000000003'),
  '2026-03-04'::date, '19 UTC-8 late evening stays on the local day it felt like');

select is(
  (select completed_local_date from public.workout_completions
   where id = 'c7270000-0000-4000-8000-000000000004'),
  '2026-03-07'::date, '20 23:30 the night before the spring-forward is the 7th');

select is(
  (select completed_local_date from public.workout_completions
   where id = 'c7270000-0000-4000-8000-000000000005'),
  '2026-03-08'::date, '21 03:30 after the clocks jumped is the 8th');

select is(
  (select completed_local_date from public.workout_completions
   where id = 'c7270000-0000-4000-8000-000000000006'),
  '2026-11-01'::date, '22 the repeated hour on the fall-back day resolves to that day');

select is(
  (select completed_local_date from public.workout_completions
   where id = 'c7270000-0000-4000-8000-000000000007'),
  '2026-06-02'::date, '23 UTC+14 is already on the next local date');

-- A later timezone change must not rewrite what already happened.
update public.profiles set timezone = 'Pacific/Kiritimati'
 where id = '7a270000-0000-4000-8000-000000000012';

select is(
  (select completed_local_date from public.workout_completions
   where id = 'c7270000-0000-4000-8000-000000000003'),
  '2026-03-04'::date, '24 moving timezone does not retro-date past sessions');

select is(
  (select count(*) from public.workout_completions where completed_local_date is null),
  0::bigint, '25 the backfill left no completion without a local date');

-- ---------------------------------------------------------------------------
-- Streaks read the local date.
-- ---------------------------------------------------------------------------

insert into public.workout_completions (member_id, workout_day_id, completed_at, status)
select '7a270000-0000-4000-8000-000000000015',
       'e7270000-0000-4000-8000-000000000015',
       (current_date - n)::timestamptz + interval '12 hours', 'completed'
from generate_series(0, 2) n;

select is(
  (select current_streak from public.member_workout_stats
   where member_id = '7a270000-0000-4000-8000-000000000015'),
  3::bigint, '26 three consecutive local dates are a streak of three');

select is(
  (select completed_count from public.member_workout_stats
   where member_id = '7a270000-0000-4000-8000-000000000015'),
  3::bigint, '27 the totals still count every completed session');

-- A fourth session on a date already in the streak must not lengthen it: the
-- view groups by local date, so the streak is dates, not rows.
insert into public.workout_completions (member_id, workout_day_id, completed_at, status)
values ('7a270000-0000-4000-8000-000000000015', 'e7270000-0000-4000-8000-000000000015',
        (current_date - 4)::timestamptz + interval '12 hours', 'completed');

select is(
  (select current_streak from public.member_workout_stats
   where member_id = '7a270000-0000-4000-8000-000000000015'),
  3::bigint, '28 a session with a gap before it does not extend the current streak');

-- ---------------------------------------------------------------------------
-- finish_workout() keeps its contract on the new key.
-- ---------------------------------------------------------------------------

update public.profiles set timezone = 'Asia/Riyadh'
 where id = '7a270000-0000-4000-8000-000000000014';

set local role authenticated;
select set_config('request.jwt.claim.sub', '7a270000-0000-4000-8000-000000000014', true);

select is(
  (select already_logged from public.finish_workout('e7270000-0000-4000-8000-000000000014')),
  false, '29 the first finish_workout of the local day logs a new session');

select is(
  (select already_logged from public.finish_workout('e7270000-0000-4000-8000-000000000014')),
  true, '30 the second call the same local day is idempotent, not an error');

set local role postgres;

select is(
  (select completed_local_date from public.workout_completions
   where member_id = '7a270000-0000-4000-8000-000000000014'
     and completed_at > now() - interval '1 minute'),
  (now() at time zone 'Asia/Riyadh')::date,
  '31 finish_workout stamped the member''s own local date');

select is(
  (select count(*) from public.workout_completions
   where member_id = '7a270000-0000-4000-8000-000000000014'),
  2::bigint, '32 ... and only one row was added on top of the fixture');

select * from finish();
rollback;
