-- ===========================================================================
-- Ticket S1, round 2 — corrections to 20260919152000_role_and_ownership_integrity.sql
--
-- Three read-only auditors re-attacked the round-1 hardening and found that some of
-- it over-reached (breaking legitimate flows) and some of it left oracles open.
-- This migration is ADDITIVE and applies after 152000 / 152100; nothing earlier is
-- edited. Every change below either restores a legitimate flow that round 1 broke or
-- narrows a surface round 1 left open. NO policy is weakened: each replacement keeps
-- the original intent and is annotated with what changed and why.
--
-- NOTE on the standing REVOKE EXECUTE hazard (common.md): this Postgres 17.6 SIGSEGVs
-- when a role calls a SECURITY DEFINER function it lacks EXECUTE on. So nothing here
-- revokes EXECUTE from anon/authenticated. Every new/replaced function keeps
-- `revoke all ... from public` only and gates INSIDE its body.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- R2-1 (high) — repeating a workout must stay possible.
--
-- Round 1 added `unique (member_id, workout_day_id)` to stop a member inserting the
-- same day 150 times in one statement. The key chosen was a LIFETIME cap: a member
-- could never do day 1 twice, so lifetime completions were capped at the number of
-- days in their plan (3 in the seed) and the seven_day_streak / thirty_day_streak
-- milestone tiers became unreachable. docs/product-plan.md calls the core loop
-- "repeat daily".
--
-- The anti-flood intent is kept by scoping uniqueness to ONE CALENDAR DAY (UTC): the
-- 150-rows-in-one-statement flood still fails, and doing day 1 again next week works.
-- The expression is server-owned: workout_completions_guard_client_writes already
-- forces completed_at := now() for non-privileged writers, so a client cannot pick
-- the date the key is computed from.
--
-- `timezone('utc', timestamptz) -> timestamp` is IMMUTABLE (unlike a bare
-- timestamptz::date, which depends on the TimeZone GUC), so it is indexable.
alter table public.workout_completions
  drop constraint if exists workout_completions_member_day_key;

drop index if exists public.workout_completions_member_day_date_key;
create unique index workout_completions_member_day_date_key
  on public.workout_completions (
    member_id,
    workout_day_id,
    ((completed_at at time zone 'utc')::date)
  );

comment on index public.workout_completions_member_day_date_key is
  'One completion per member per workout day per UTC calendar date. Replaces the round-1 lifetime unique (member_id, workout_day_id), which made repeating a workout - and therefore the 7/30-day streak milestones - impossible. completed_at is trigger-owned for non-privileged writers, so the date cannot be forged.';

-- ---------------------------------------------------------------------------
-- R2-2 (medium) — has_earned_milestone was an unauthenticated activity oracle.
--
-- It took an arbitrary p_member, never looked at auth.uid(), and (correctly, per the
-- SIGSEGV rule) kept Supabase's default EXECUTE for anon/authenticated. So
-- `POST /rest/v1/rpc/has_earned_milestone` with only the anon key revealed whether any
-- member had ever trained and whether they held a 7- or 30-day streak - data
-- workout_completions' RLS otherwise protects. Member uuids are obtainable from
-- get_group_roster / live_class_participants / recordings.uploaded_by.
--
-- Fix: a caller gate in the body, mirroring subscription_state_row's visibility rule.
-- The tier computation is unchanged. The only in-tree caller is the milestones INSERT
-- policy, which always asks about milestones.member_id = auth.uid(), so the first arm
-- of the gate always holds there and the policy is not weakened.
create or replace function public.has_earned_milestone(p_member uuid, p_tier text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with visible as (
    -- coalesce(...) is load-bearing: for anon, auth.uid() is NULL, so
    -- `p_member = auth.uid()` is NULL and the whole OR-chain evaluates to NULL
    -- rather than false. SQL three-valued logic would then propagate NULL out of
    -- the function, and PostgREST renders that as `null` - a value distinguishable
    -- from `false`, which is the very oracle this gate exists to close.
    select p_member is not null
       and coalesce(
             p_member = auth.uid()
             or public.is_privileged_writer()
             or public.is_coach_of_member(p_member)
             or public.is_admin(),
             false
           ) as ok
  ),
  completion_dates as (
    select distinct (completed_at at time zone 'utc')::date as d
    from public.workout_completions
    where member_id = p_member and status = 'completed'
      and (select ok from visible)
  ),
  islands as (
    select d, d - (row_number() over (order by d))::int as island from completion_dates
  ),
  streaks as (
    select max(d) as streak_end, count(*) as streak_length from islands group by island
  ),
  latest as (
    select streak_end, streak_length from streaks order by streak_end desc limit 1
  ),
  agg as (
    select
      (select count(*) from public.workout_completions
        where member_id = p_member and status = 'completed'
          and (select ok from visible)) as completed_count,
      coalesce(
        (select streak_length from latest where streak_end >= current_date - interval '1 day'),
        0
      ) as current_streak
  )
  select (select ok from visible)
     and case p_tier
           when 'first_day'          then (select completed_count from agg) >= 1
           when 'seven_day_streak'   then (select current_streak  from agg) >= 7
           when 'thirty_day_streak'  then (select current_streak  from agg) >= 30
           else false
         end;
$$;

comment on function public.has_earned_milestone(uuid, text) is
  'True when the member has genuinely reached the tier, recomputed from workout_completions with the same streak rule as member_workout_stats. Answers only for the caller themselves, their coach, an admin, or a privileged writer; everyone else (including anon) gets false.';

revoke all on function public.has_earned_milestone(uuid, text) from public;

-- ---------------------------------------------------------------------------
-- R2-3 (low) — is_coach_or_admin(p_uid) / is_admin(p_uid) were staff-role oracles.
--
-- Both are SECURITY DEFINER over profiles.role with no relationship check on p_uid, and
-- both are reachable over PostgREST with only the anon key
-- (`POST /rest/v1/rpc/is_coach_or_admin {"p_uid": "..."}` -> 200 true/false), while
-- profiles' SELECT RLS hides every other user's role from a stranger.
--
-- Fix: refuse FOREIGN probes while keeping the zero-arg behaviour byte-for-byte.
-- Every call site in this schema uses the zero-arg form (verified by grep over
-- supabase/migrations and supabase/functions), where p_uid = auth.uid() makes the gate
-- a tautology - so no policy changes meaning.
--
-- The caller-side staff check is INLINED rather than delegated to a helper on purpose:
-- (a) a separate `role_of(uuid)` helper would just be the same oracle under a new name,
-- and (b) `is_admin()` calling `is_admin()` inside its own gate would risk unbounded
-- recursion, since SQL OR is not guaranteed to short-circuit.
create or replace function public.is_coach_or_admin(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- coalesce(...) is load-bearing: for anon, auth.uid() is NULL, so
  -- `p_uid = auth.uid()` is NULL and the OR-chain yields NULL, not false. Without
  -- the coalesce the function returns NULL for a staff p_uid and false for a
  -- non-staff one -- over PostgREST that is `null` vs `false`, i.e. the SAME role
  -- oracle in a three-valued disguise. Verified: anon probing the seed coach
  -- returned `null` and anon probing the seed member returned `false`.
  select p_uid is not null
     and coalesce(
           p_uid = auth.uid()
           or public.is_privileged_writer()
           or exists (
             select 1 from public.profiles c
             where c.id = auth.uid() and c.role in ('coach', 'admin')
           ),
           false
         )
     and exists (
       select 1 from public.profiles p
       where p.id = p_uid and p.role in ('coach', 'admin')
     );
$$;

comment on function public.is_coach_or_admin(uuid) is
  'True when the given user (default auth.uid()) has the server-side role coach or admin. NULL uid -> false. Foreign probes are refused: only the subject themselves, a staff caller or a privileged writer gets a real answer, so this is not an anon role oracle.';

revoke all on function public.is_coach_or_admin(uuid) from public;

create or replace function public.is_admin(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- coalesce(...): same three-valued-logic hazard as is_coach_or_admin above.
  select p_uid is not null
     and coalesce(
           p_uid = auth.uid()
           or public.is_privileged_writer()
           or exists (
             select 1 from public.profiles c
             where c.id = auth.uid() and c.role in ('coach', 'admin')
           ),
           false
         )
     and exists (
       select 1 from public.profiles p
       where p.id = p_uid and p.role = 'admin'
     );
$$;

comment on function public.is_admin(uuid) is
  'True when the given user (default auth.uid()) has the server-side role admin. NULL uid -> false. Foreign probes are refused (see is_coach_or_admin).';

revoke all on function public.is_admin(uuid) from public;

-- ---------------------------------------------------------------------------
-- R2-4 (high) — a coach could no longer schedule a live class.
--
-- `live_classes_select_entitled_tenant` USING can_see_live_class(id), and
-- can_see_live_class is STABLE and re-queries public.live_classes. During
-- `INSERT ... RETURNING` the RETURNING-time SELECT check runs against the statement's
-- own snapshot, in which the not-yet-visible new row cannot be found - so the check
-- failed with 42501 / "new row violates row-level security policy". PostgREST's
-- `Prefer: return=representation` (and supabase-js's default `.insert().select()`,
-- which src/features/liveClasses/api.ts createLiveClass uses) always takes that path,
-- so ScheduleClassForm could never create a class. A bare INSERT succeeded, which is
-- exactly why the round-1 pgTAP control case missed it.
--
-- Fix: give the policy a direct column arm that needs no self-query. This is a
-- WIDENING for one principal only - the class's own coach, whom can_see_live_class
-- already admits on any committed snapshot - so no one gains visibility.
-- (Making can_see_live_class VOLATILE would also work but would defeat per-statement
-- caching of an RLS predicate evaluated once per row.)
drop policy if exists "live_classes_select_entitled_tenant" on public.live_classes;
create policy "live_classes_select_entitled_tenant"
  on public.live_classes for select
  to authenticated
  using (
    live_classes.coach_id = auth.uid()
    or public.can_see_live_class(live_classes.id)
  );

-- ---------------------------------------------------------------------------
-- R2-5 (medium) — the same snapshot defect, latent on groups.
--
-- `groups_select_own_tenant` USING can_join_group(id) OR is_fellow_group_member(id);
-- can_join_group is STABLE and re-queries public.groups, so a coach's
-- `insert into groups ... returning id` is rejected. No client code creates groups
-- today, but `.insert().select()` is the idiom used everywhere else in this repo.
-- Same remedy, same reasoning: a direct arm for the creator, who can_join_group
-- already admits.
drop policy if exists "groups_select_own_tenant" on public.groups;
create policy "groups_select_own_tenant"
  on public.groups for select
  to authenticated
  using (
    groups.created_by = auth.uid()
    or public.can_join_group(groups.id)
    or public.is_fellow_group_member(groups.id)
  );

-- ---------------------------------------------------------------------------
-- R2-6 (low) — groups UPDATE/DELETE still privileged on created_by alone.
--
-- Round 1 tightened groups INSERT to `created_by = auth.uid() and is_coach_or_admin()`
-- but left UPDATE and DELETE at bare `created_by = auth.uid()`. So a user demoted from
-- coach to member kept full edit and delete rights over their groups, and any group
-- created by a member before this wave stayed member-editable. Ticket item 6 asks for
-- is_coach_or_admin() wherever the intent is coach-only.
--
-- This is a TIGHTENING of both policies, matching groups_insert_coach. Members'
-- legitimate group actions are join/leave (group_members), which are untouched.
-- The auditor flagged UPDATE only; DELETE has the identical shape and the identical
-- intent, so both are fixed rather than leaving a known twin open.
drop policy if exists "groups_update_owner" on public.groups;
create policy "groups_update_owner"
  on public.groups for update
  to authenticated
  using (created_by = auth.uid() and public.is_coach_or_admin())
  with check (created_by = auth.uid() and public.is_coach_or_admin());

drop policy if exists "groups_delete_owner" on public.groups;
create policy "groups_delete_owner"
  on public.groups for delete
  to authenticated
  using (created_by = auth.uid() and public.is_coach_or_admin());

-- ---------------------------------------------------------------------------
-- R2-7 (low) — moderation_reports had a text bound but no row cap.
--
-- Round 1 capped `reason` at 2000 chars but left the row count open, so one member
-- could insert 20000 reports (~40 MB) in a single statement - reproduced by the
-- auditor. push_tokens already received exactly this treatment
-- (push_tokens_enforce_row_cap), so this mirrors it.
--
-- Two bounds, both per reporter: a small cap on OPEN reports against the same person
-- (re-reporting the same user 500 times is the abuse shape) and a daily cap overall.
-- Privileged writers (seed, service_role, moderation tooling) are exempt, as in
-- push_tokens_enforce_row_cap.
create or replace function public.moderation_reports_enforce_row_cap()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_open_pair integer;
  v_today     integer;
begin
  if public.is_privileged_writer() then
    return new;
  end if;

  select count(*) into v_open_pair
  from public.moderation_reports
  where reporter_id = new.reporter_id
    and reported_user_id = new.reported_user_id
    and status = 'open';

  if v_open_pair >= 3 then
    raise exception 'you already have an open report about this member'
      using errcode = '54000';
  end if;

  select count(*) into v_today
  from public.moderation_reports
  where reporter_id = new.reporter_id
    and created_at >= now() - interval '24 hours';

  if v_today >= 20 then
    raise exception 'too many reports filed in the last 24 hours'
      using errcode = '54000';
  end if;

  return new;
end;
$$;

comment on function public.moderation_reports_enforce_row_cap() is
  'Row cap for moderation_reports: at most 3 open reports per reporter/reported pair and 20 reports per reporter per 24h. Privileged writers are exempt. Companion to the 2000-char reason bound added in 20260919152000.';

revoke all on function public.moderation_reports_enforce_row_cap() from public;

drop trigger if exists moderation_reports_enforce_row_cap on public.moderation_reports;
create trigger moderation_reports_enforce_row_cap
  before insert on public.moderation_reports
  for each row execute function public.moderation_reports_enforce_row_cap();

-- ---------------------------------------------------------------------------
-- R2-8 (low) — document the recordings column-level SELECT grant.
--
-- 20260919152000 replaced the table-level SELECT grant on public.recordings with a
-- column list that omits storage_path (intentional: the private object key must not be
-- readable by members). The side effect is that PostgREST `select=*` - which
-- supabase-js emits for a bare `.select()` - returns an opaque
-- 403 42501 "permission denied for table recordings" that names no column, even for the
-- owning coach.
--
-- The grant is kept as-is (it is the control that hides storage_path). The constraint is
-- made discoverable here and, on the client side, guarded by a Jest test
-- (src/features/notes/recordingColumns.test.ts) that fails if any call site uses
-- `.from('recordings').select()` with no explicit column list.
comment on table public.recordings is
  'Coach-uploaded class recordings. SELECT is granted COLUMN-WISE (storage_path deliberately excluded), so PostgREST select=* / supabase-js bare .select() returns 403 42501 for every role. Always pass an explicit column list - see RECORDING_COLUMNS in src/features/notes/api.ts.';
