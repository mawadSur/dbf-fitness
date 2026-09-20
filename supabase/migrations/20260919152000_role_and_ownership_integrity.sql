-- Role & ownership integrity.
--
-- Everything in the pre-existing schema that granted privilege from a CLIENT-WRITABLE column
-- (`profiles.role`, `profiles.coach_id`, `live_classes.coach_id`, `groups.created_by`,
-- `recordings.uploaded_by`, `workout_completions.scored_by`, `recordings.storage_path`, ...)
-- was forgeable, because nothing stopped a member from writing that column in the first place.
--
-- Reproduced before this migration (each inside begin ... rollback, and T1/T2/T3/T4/T5 also over
-- real PostgREST with a throwaway GoTrue account):
--   T1 `update profiles set role='admin' where id=<self>`                            -> UPDATE 1
--   T2 `update profiles set coach_id=<any>`                                          -> UPDATE 1
--   T3 EXPIRED member inserts live_classes(coach_id=self) -> can_join_live_class = t -> gate bypassed
--   T4 `POST /rest/v1/profiles {"role":"admin","coach_id":"<Dana>"}` as a brand-new user -> 201
--   T5 non-coach inserts workout_plans / diet_plans+assignments / groups for other people's members
--   T6 an `admin` profile is 'staff' for get_subscription_state() but can_join_live_class = f
--   plus the auditor findings closed below (storage_path forgery, recording re-pointing, open
--   group self-join, global moderation, forged effort scores / streaks / milestones, stray diet
--   check-ins, cross-tenant enumeration of groups and live classes, unbounded text).
--
-- Shape of the fix:
--   1. ROLE is server-owned. `profiles.role` and `profiles.coach_id` can only be written by
--      postgres / supabase_admin / service_role, enforced by a BEFORE UPDATE trigger (RLS cannot
--      compare OLD and NEW) plus an INSERT policy that pins a self-registration to
--      role='member', coach_id=null.
--   2. Every "this is a coach action" policy now also asks `public.is_coach_or_admin()`, i.e. it
--      reads the (now unforgeable) server-side role, instead of trusting an ownership column the
--      client itself filled in.
--   3. Every "this row is about member X" write also checks the caller's real relationship to X
--      (`is_coach_of_member`, plan assignment, group tenancy) instead of only `= auth.uid()`.
--   4. Reads that had no tenant predicate at all (`groups`, `live_classes`) are scoped to the
--      caller's own tenant.
--
-- No policy is weakened. Where a policy is replaced, its original intent is restated inline and
-- the replacement is strictly narrower, except for two deliberate, documented WIDENINGS for
-- `admin` (profiles/subscriptions SELECT and can_join_live_class) which the rest of the codebase
-- already assumes exists — see T6 and the subscription_state_row admin arm in 20260919150000.
--
-- FUNCTION PRIVILEGES: every function below does `revoke all ... from public` ONLY. EXECUTE
-- deliberately stays with anon/authenticated (Supabase default privileges grant it at CREATE
-- time). Revoking EXECUTE from anon on this Postgres 17.6 build segfaults the backend instead of
-- denying cleanly — see the long notes in 20260919120000 and 20260919140000. The security
-- boundary is the gate INSIDE each body: auth.uid() is NULL for anon, so anon gets false/NULL.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- 1. Identity helpers
-- ---------------------------------------------------------------------------

-- True when the statement is running as a privileged server role rather than as an end user.
-- Inside a trigger `current_user` is the table owner, so the CALLER is identified via the `role`
-- GUC that PostgREST / storage-api / `set local role` set ('none' when unset), falling back to
-- session_user for a plain psql or migration session. Same technique as
-- apply_realtime_presence_policies() (20260919140000) and is_pipeline_role() (20260919151000);
-- this one exists separately so the privileged-writer rule has a name of its own and pins
-- search_path to pg_catalog, so no shadowing function in `public` can be reached from it.
--
-- End users always arrive through PostgREST / storage-api as `authenticated` or `anon`, and
-- neither service lets a client choose its own role GUC, so a client cannot spoof this.
create or replace function public.is_privileged_writer()
returns boolean
language sql
stable
set search_path = pg_catalog
as $$
  select coalesce(nullif(current_setting('role', true), 'none'), session_user)
         in ('postgres', 'supabase_admin', 'service_role');
$$;

comment on function public.is_privileged_writer() is
  'True when the caller is postgres / supabase_admin / service_role (migration, SQL session or server-side job) rather than an end user arriving through PostgREST.';

revoke all on function public.is_privileged_writer() from public;

-- The server-side role check. THE predicate every coach-only policy now uses: it reads
-- profiles.role, which after this migration only a privileged writer can set.
create or replace function public.is_coach_or_admin(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_uid is not null
     and exists (
       select 1 from public.profiles p
       where p.id = p_uid and p.role in ('coach', 'admin')
     );
$$;

comment on function public.is_coach_or_admin(uuid) is
  'True when the given user (default auth.uid()) has the server-side role coach or admin. NULL uid -> false.';

revoke all on function public.is_coach_or_admin(uuid) from public;

-- Admin-only counterpart. `admin` is already treated as staff by subscription_state_row, but no
-- policy ever gave admins a read path (a fresh admin profile could see exactly one profiles row:
-- its own). These two helpers make the concept consistent.
create or replace function public.is_admin(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_uid is not null
     and exists (
       select 1 from public.profiles p
       where p.id = p_uid and p.role = 'admin'
     );
$$;

comment on function public.is_admin(uuid) is
  'True when the given user (default auth.uid()) has the server-side role admin. NULL uid -> false.';

revoke all on function public.is_admin(uuid) from public;

-- ---------------------------------------------------------------------------
-- 2. profiles — role and coach_id become server-owned (T1, T2, T4)
-- ---------------------------------------------------------------------------

-- REPLACES profiles_insert_self (`id = auth.uid()`), keeping its intent -- a user creates their
-- own profile row at sign-up -- and adding the two things self-registration may never choose:
-- its privilege level, and which coach it is attached to. app/(auth)/sign-up.tsx already sends
-- exactly {id, role:'member', full_name}, so the legitimate flow is unaffected; the
-- `POST /rest/v1/profiles {"role":"admin"}` path (T4) now fails the WITH CHECK.
--
-- Coach/admin accounts and coach assignment are made with the service role (or SQL) until the
-- invite-code flow lands.
drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self_member_only"
  on public.profiles for insert
  to authenticated
  with check (
    id = auth.uid()
    and role = 'member'
    and coach_id is null
  );

-- RLS cannot see OLD, so profiles_update_self can only say "this is your row" -- it can never say
-- "and you did not change your own role". That is T1/T2. The trigger below is the actual guard.
--
-- SECURITY INVOKER on purpose (it reads nothing), and search_path pinned to pg_catalog so the
-- privileged-writer probe cannot be redirected. A privileged writer (migrations, the seed, the
-- future billing/admin service) passes straight through, which is what keeps supabase/seed.sql
-- working on a from-scratch reset: seeding runs as `postgres`.
create or replace function public.profiles_guard_privileged_columns()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if public.is_privileged_writer() then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'profiles.role is assigned server-side; it cannot be changed by the account itself'
      using errcode = '42501';
  end if;

  if new.coach_id is distinct from old.coach_id then
    raise exception 'profiles.coach_id is assigned server-side; it cannot be changed by the account itself'
      using errcode = '42501';
  end if;

  if new.id is distinct from old.id then
    raise exception 'profiles.id cannot be changed' using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.profiles_guard_privileged_columns() is
  'BEFORE UPDATE guard: only postgres / supabase_admin / service_role may change profiles.role, profiles.coach_id or profiles.id. Members may still edit benign columns (full_name, avatar_url).';

revoke all on function public.profiles_guard_privileged_columns() from public;

drop trigger if exists profiles_guard_privileged_columns on public.profiles;
create trigger profiles_guard_privileged_columns
  before update on public.profiles
  for each row execute function public.profiles_guard_privileged_columns();

-- WIDENING (deliberate): admins get the read path the rest of the code already assumes they have.
-- subscription_state_row() has had an explicit `role = 'admin'` arm since 20260919150000, yet
-- profiles/subscriptions SELECT had none, so an admin account saw an empty app. Nobody else's
-- visibility changes.
drop policy if exists "profiles_select_self_or_coach" on public.profiles;
create policy "profiles_select_self_or_coach_or_admin"
  on public.profiles for select
  using (
    id = auth.uid()
    or coach_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists "subscriptions_select_self_or_coach" on public.subscriptions;
create policy "subscriptions_select_self_coach_or_admin"
  on public.subscriptions for select
  using (
    member_id = auth.uid()
    or public.is_coach_of_member(subscriptions.member_id)
    or public.is_admin()
  );

-- ---------------------------------------------------------------------------
-- 3. live_classes — only real coaches may own a class (T3), and the schedule
--    is no longer a global directory
-- ---------------------------------------------------------------------------

-- True when the caller may SEE this class: its coach, one of that coach's members, or an admin.
-- SECURITY DEFINER so live_classes' own SELECT policy can call it without re-entering that policy.
create or replace function public.can_see_live_class(p_class uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and exists (
       select 1
       from public.live_classes lc
       where lc.id = p_class
         and (
           lc.coach_id = auth.uid()
           or exists (
             select 1 from public.profiles p
             where p.id = auth.uid() and p.coach_id = lc.coach_id
           )
           or public.is_admin()
         )
     );
$$;

comment on function public.can_see_live_class(uuid) is
  'True when auth.uid() is the class coach, a member coached by that coach, or an admin. The read counterpart of can_join_live_class (no subscription arm).';

revoke all on function public.can_see_live_class(uuid) from public;

-- REPLACES live_classes_select_authenticated (`auth.uid() is not null`), which made every coach's
-- whole schedule -- titles, start times and agora_channel_name -- readable by any signed-up
-- account, including expired members and members of other coaches. Same intent (a class is
-- visible to its audience), tenant-scoped.
--
-- DEVIATION from the ticket, which said "SELECT unchanged": three auditors independently rated
-- this cross-tenant enumeration high/medium, and agora_channel_name is part of what leaked.
-- src/features/liveClasses/api.ts (fetchUpcomingLiveClasses) has no coach filter of its own and
-- relies on RLS for scoping, so this only removes rows the app never meant to show.
drop policy if exists "live_classes_select_authenticated" on public.live_classes;
create policy "live_classes_select_entitled_tenant"
  on public.live_classes for select
  to authenticated
  using (public.can_see_live_class(live_classes.id));

-- REPLACES the single FOR ALL live_classes_write_coach (`coach_id = auth.uid()`), which let ANY
-- authenticated user -- including an expired member -- conjure a class with themselves as coach
-- and then satisfy can_join_live_class's coach arm (T3). Split per command, same intent
-- ("a coach manages their own classes"), with the role now read server-side.
drop policy if exists "live_classes_write_coach" on public.live_classes;

create policy "live_classes_insert_coach"
  on public.live_classes for insert
  to authenticated
  with check (coach_id = auth.uid() and public.is_coach_or_admin());

create policy "live_classes_update_coach"
  on public.live_classes for update
  to authenticated
  using (coach_id = auth.uid() and public.is_coach_or_admin())
  with check (coach_id = auth.uid() and public.is_coach_or_admin());

create policy "live_classes_delete_coach"
  on public.live_classes for delete
  to authenticated
  using (coach_id = auth.uid() and public.is_coach_or_admin());

-- can_join_live_class: the coach arm now requires the server-side role too (so T3's fabricated
-- class no longer entitles its fabricator), and an admin may join any class (T6 -- admins are
-- 'staff' everywhere else). The member arm is untouched: coached by the class's coach AND
-- has_live_access(). Class status is still deliberately out of scope (the token function 409s).
--
-- Same name and signature, so can_use_live_class_presence_topic, the live_class_participants
-- policies and the agora-rtc-token Edge Function all pick this up unchanged.
create or replace function public.can_join_live_class(p_class uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.live_classes lc
    where lc.id = p_class
      and auth.uid() is not null
      and (
        (lc.coach_id = auth.uid() and public.is_coach_or_admin())
        or public.is_admin()
        or (
          exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and p.coach_id = lc.coach_id
          )
          and public.has_live_access(auth.uid())
        )
      )
  );
$$;

comment on function public.can_join_live_class(uuid) is
  'True when auth.uid() is the class coach (with the coach/admin role), any admin, or a member of that coach who currently has live access. Ignores class status by design.';

revoke all on function public.can_join_live_class(uuid) from public;

-- ---------------------------------------------------------------------------
-- 4. groups — creating a group is a coach action; joining one is tenant-scoped
-- ---------------------------------------------------------------------------

-- True when the caller may join / see this group: they created it, an admin, or their own coach
-- created it. SECURITY DEFINER so group_members' policies can call it without dragging groups'
-- (and therefore group_members') RLS back in -- that pair already caused an infinite-recursion
-- incident, see 20260919120000.
create or replace function public.can_join_group(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and exists (
       select 1
       from public.groups g
       where g.id = p_group
         and (
           g.created_by = auth.uid()
           or public.is_admin()
           or exists (
             select 1 from public.profiles p
             where p.id = auth.uid() and p.coach_id is not null and p.coach_id = g.created_by
           )
         )
     );
$$;

comment on function public.can_join_group(uuid) is
  'True when auth.uid() owns the group, is an admin, or is coached by the group''s creator. Gates both seeing and joining a group.';

revoke all on function public.can_join_group(uuid) from public;

-- REPLACES groups_select_authenticated (`auth.uid() is not null`). Every group id was enumerable
-- by every signed-in account, which is the first half of the "self-join any group and read its
-- roster" chain. Intent kept (members browse the groups they may join), tenant-scoped; a group
-- the caller already belongs to stays visible even if their coach changed.
drop policy if exists "groups_select_authenticated" on public.groups;
create policy "groups_select_own_tenant"
  on public.groups for select
  to authenticated
  using (
    public.can_join_group(groups.id)
    or public.is_fellow_group_member(groups.id)
  );

-- REPLACES groups_insert_authenticated (`created_by = auth.uid()`): any member could create
-- groups. Creating a community group is a coach action.
drop policy if exists "groups_insert_authenticated" on public.groups;
create policy "groups_insert_coach"
  on public.groups for insert
  to authenticated
  with check (created_by = auth.uid() and public.is_coach_or_admin());

-- REPLACES group_members_insert_self (`member_id = auth.uid()`), which let a stranger join ANY
-- group id -- unlocking get_group_roster (real names of another coach's members) and the private
-- `group:<uuid>` Realtime presence topic, both of which the schema documents as closed to
-- strangers. Intent kept (you join yourself, never someone else) plus the tenancy predicate.
drop policy if exists "group_members_insert_self" on public.group_members;
create policy "group_members_insert_self_own_tenant"
  on public.group_members for insert
  to authenticated
  with check (member_id = auth.uid() and public.can_join_group(group_members.group_id));

-- ---------------------------------------------------------------------------
-- 5. workout_* — coach writes need the coach role AND a real coach->member link
-- ---------------------------------------------------------------------------

-- True when the caller coaches the plan that owns this day.
create or replace function public.is_coach_of_workout_day(p_day uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and exists (
       select 1
       from public.workout_days wd
       join public.workout_plans wp on wp.id = wd.workout_plan_id
       where wd.id = p_day and wp.coach_id = auth.uid()
     );
$$;

revoke all on function public.is_coach_of_workout_day(uuid) from public;

-- True when this day belongs to a plan assigned to the caller.
create or replace function public.owns_workout_day(p_day uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and exists (
       select 1
       from public.workout_days wd
       join public.workout_plans wp on wp.id = wd.workout_plan_id
       where wd.id = p_day and wp.member_id = auth.uid()
     );
$$;

revoke all on function public.owns_workout_day(uuid) from public;

-- REPLACE the three workout_plans write policies. Old: `coach_id = auth.uid()` alone, so any
-- member could author a plan (with themselves as "coach") for ANY other coach's member and have
-- it show up in that member's app. Intent kept -- a coach manages their own plans -- with the
-- role read server-side and member_id restricted to the caller's own members.
drop policy if exists "workout_plans_insert_coach" on public.workout_plans;
create policy "workout_plans_insert_coach"
  on public.workout_plans for insert
  to authenticated
  with check (
    coach_id = auth.uid()
    and public.is_coach_or_admin()
    and public.is_coach_of_member(workout_plans.member_id)
  );

drop policy if exists "workout_plans_update_coach" on public.workout_plans;
create policy "workout_plans_update_coach"
  on public.workout_plans for update
  to authenticated
  using (coach_id = auth.uid() and public.is_coach_or_admin())
  with check (
    coach_id = auth.uid()
    and public.is_coach_or_admin()
    and public.is_coach_of_member(workout_plans.member_id)
  );

drop policy if exists "workout_plans_delete_coach" on public.workout_plans;
create policy "workout_plans_delete_coach"
  on public.workout_plans for delete
  to authenticated
  using (coach_id = auth.uid() and public.is_coach_or_admin());

-- workout_days / exercises: same intent, plus the server-side role. The plan-ownership arm is
-- unchanged, so a coach's own days and exercises keep working exactly as before.
drop policy if exists "workout_days_write_coach" on public.workout_days;
create policy "workout_days_write_coach"
  on public.workout_days for all
  to authenticated
  using (public.is_coach_or_admin() and public.is_coach_of_workout_day(workout_days.id))
  with check (
    public.is_coach_or_admin()
    and exists (
      select 1 from public.workout_plans wp
      where wp.id = workout_days.workout_plan_id and wp.coach_id = auth.uid()
    )
  );

drop policy if exists "exercises_write_coach" on public.exercises;
create policy "exercises_write_coach"
  on public.exercises for all
  to authenticated
  using (public.is_coach_or_admin() and public.is_coach_of_workout_day(exercises.workout_day_id))
  with check (public.is_coach_or_admin() and public.is_coach_of_workout_day(exercises.workout_day_id));

-- ---------------------------------------------------------------------------
-- 6. workout_completions — the member owns "I did it", the coach owns the score
-- ---------------------------------------------------------------------------

-- One completion per member per day. Without it a member could insert the same day 150 times in
-- one statement (reproduced by the auditor) and inflate every count the coach sees. Verified
-- empty of duplicates before the constraint is added.
alter table public.workout_completions
  drop constraint if exists workout_completions_member_day_key;
alter table public.workout_completions
  add constraint workout_completions_member_day_key unique (member_id, workout_day_id);

-- RLS cannot compare OLD and NEW, so effort_score / scored_by / completed_at ownership is a
-- trigger. Without it a member could set their own coach-assigned RPE and stamp any uuid as the
-- scorer, and could backdate completed_at to fabricate a 41-day streak (both reproduced).
create or replace function public.workout_completions_guard_client_writes()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_is_coach boolean;
begin
  if public.is_privileged_writer() then
    return new;
  end if;

  v_is_coach := public.is_coach_or_admin() and public.is_coach_of_workout_day(new.workout_day_id);

  -- completed_at is a server clock, always. A client value is simply ignored on insert, and the
  -- column is frozen afterwards.
  if tg_op = 'INSERT' then
    new.completed_at := now();
  elsif new.completed_at is distinct from old.completed_at then
    raise exception 'workout_completions.completed_at is set by the server'
      using errcode = '42501';
  end if;

  if not v_is_coach then
    if tg_op = 'INSERT' then
      if new.effort_score is not null or new.scored_by is not null then
        raise exception 'workout_completions.effort_score / scored_by are set by the member''s coach'
          using errcode = '42501';
      end if;
    else
      if new.effort_score is distinct from old.effort_score
         or new.scored_by is distinct from old.scored_by then
        raise exception 'workout_completions.effort_score / scored_by are set by the member''s coach'
          using errcode = '42501';
      end if;
      if new.member_id is distinct from old.member_id
         or new.workout_day_id is distinct from old.workout_day_id then
        raise exception 'workout_completions rows cannot be moved to another member or day'
          using errcode = '42501';
      end if;
    end if;
  elsif new.scored_by is not null and new.scored_by <> auth.uid() then
    -- A coach scores as themselves; they may not attribute the score to another coach.
    raise exception 'workout_completions.scored_by must be the scoring coach'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.workout_completions_guard_client_writes() is
  'Keeps completed_at server-side and confines effort_score / scored_by to the coach of the day''s plan (who must score as themselves).';

revoke all on function public.workout_completions_guard_client_writes() from public;

drop trigger if exists workout_completions_guard_client_writes on public.workout_completions;
create trigger workout_completions_guard_client_writes
  before insert or update on public.workout_completions
  for each row execute function public.workout_completions_guard_client_writes();

-- REPLACES workout_completions_insert_member (`member_id = auth.uid()`), which let a member log
-- completions against workout days belonging to a total stranger's plan -- rows that then showed
-- up in that coach's review queue. Intent kept, plus "the day has to be yours".
drop policy if exists "workout_completions_insert_member" on public.workout_completions;
create policy "workout_completions_insert_own_day"
  on public.workout_completions for insert
  to authenticated
  with check (
    member_id = auth.uid()
    and public.owns_workout_day(workout_completions.workout_day_id)
  );

-- REPLACES workout_completions_update_member_or_coach. The USING/WITH CHECK pair was satisfied by
-- `member_id = auth.uid()` alone, so a member could re-point their row at another coach's day.
-- Intent kept (a member updates their own row, the plan's coach updates their members' rows);
-- which COLUMNS each side may touch is now the trigger's job.
drop policy if exists "workout_completions_update_member_or_coach" on public.workout_completions;
create policy "workout_completions_update_member_or_coach"
  on public.workout_completions for update
  to authenticated
  using (
    member_id = auth.uid()
    or (public.is_coach_or_admin() and public.is_coach_of_workout_day(workout_completions.workout_day_id))
  )
  with check (
    (member_id = auth.uid() and public.owns_workout_day(workout_completions.workout_day_id))
    or (public.is_coach_or_admin() and public.is_coach_of_workout_day(workout_completions.workout_day_id))
  );

-- ---------------------------------------------------------------------------
-- 7. milestones — a tier has to have actually been earned
-- ---------------------------------------------------------------------------

-- Recomputes the member's stats the same way public.member_workout_stats does (consecutive-date
-- islands over completed rows) and answers whether the tier is genuinely reached. SECURITY
-- DEFINER so it sees all of the member's completions regardless of the caller's RLS.
-- Thresholds mirror src/features/milestones/useMilestoneCheck.ts (1 / 7 / 30).
create or replace function public.has_earned_milestone(p_member uuid, p_tier text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with completion_dates as (
    select distinct (completed_at at time zone 'utc')::date as d
    from public.workout_completions
    where member_id = p_member and status = 'completed'
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
        where member_id = p_member and status = 'completed') as completed_count,
      coalesce(
        (select streak_length from latest where streak_end >= current_date - interval '1 day'),
        0
      ) as current_streak
  )
  select case p_tier
           when 'first_day'          then (select completed_count from agg) >= 1
           when 'seven_day_streak'   then (select current_streak  from agg) >= 7
           when 'thirty_day_streak'  then (select current_streak  from agg) >= 30
           else false
         end;
$$;

comment on function public.has_earned_milestone(uuid, text) is
  'True when the member has genuinely reached the tier, recomputed from workout_completions with the same streak rule as member_workout_stats.';

revoke all on function public.has_earned_milestone(uuid, text) from public;

-- REPLACES milestones_insert_member (`member_id = auth.uid()`), which let anyone award themselves
-- thirty_day_streak on day one. Intent kept -- the client still records the milestone it just
-- detected, so src/features/milestones/useMilestoneCheck.ts is unchanged -- but the server now
-- recomputes the claim, and completions themselves are no longer forgeable (section 6).
drop policy if exists "milestones_insert_member" on public.milestones;
create policy "milestones_insert_member_earned"
  on public.milestones for insert
  to authenticated
  with check (
    member_id = auth.uid()
    and public.has_earned_milestone(milestones.member_id, milestones.tier)
  );

-- ---------------------------------------------------------------------------
-- 8. diet_* — coach writes need the role; check-ins need a real assignment
-- ---------------------------------------------------------------------------

create or replace function public.is_assigned_diet_item(p_item uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and exists (
       select 1
       from public.diet_items di
       join public.diet_plan_assignments dpa on dpa.diet_plan_id = di.diet_plan_id
       where di.id = p_item and dpa.member_id = auth.uid()
     );
$$;

revoke all on function public.is_assigned_diet_item(uuid) from public;

-- diet_plans / diet_items / diet_plan_assignments: same ownership intent, plus the server-side
-- role, plus (for assignments) "the member has to be one of yours" -- a plan could previously be
-- pushed into any stranger's account.
drop policy if exists "diet_plans_write_coach" on public.diet_plans;
create policy "diet_plans_write_coach"
  on public.diet_plans for all
  to authenticated
  using (coach_id = auth.uid() and public.is_coach_or_admin())
  with check (coach_id = auth.uid() and public.is_coach_or_admin());

drop policy if exists "diet_items_write_coach" on public.diet_items;
create policy "diet_items_write_coach"
  on public.diet_items for all
  to authenticated
  using (public.is_coach_or_admin() and public.is_coach_of_diet_plan(diet_items.diet_plan_id))
  with check (public.is_coach_or_admin() and public.is_coach_of_diet_plan(diet_items.diet_plan_id));

drop policy if exists "diet_plan_assignments_write_coach" on public.diet_plan_assignments;
create policy "diet_plan_assignments_write_coach"
  on public.diet_plan_assignments for all
  to authenticated
  using (
    public.is_coach_or_admin()
    and public.is_coach_of_diet_plan(diet_plan_assignments.diet_plan_id)
  )
  with check (
    public.is_coach_or_admin()
    and public.is_coach_of_diet_plan(diet_plan_assignments.diet_plan_id)
    and public.is_coach_of_member(diet_plan_assignments.member_id)
  );

-- REPLACES the blanket diet_checkins_write_member (FOR ALL, `member_id = auth.uid()`), which let
-- a member tick items on plans they were never assigned -- polluting an unrelated coach's
-- adherence reporting -- and backdate checkin_date arbitrarily. Intent kept (a member manages
-- their own check-ins), narrowed to assigned items and a small date window around today.
drop policy if exists "diet_checkins_write_member" on public.diet_checkins;
drop policy if exists "diet_checkins_insert_member" on public.diet_checkins;
drop policy if exists "diet_checkins_update_member" on public.diet_checkins;
drop policy if exists "diet_checkins_delete_member" on public.diet_checkins;

create policy "diet_checkins_insert_member"
  on public.diet_checkins for insert
  to authenticated
  with check (
    member_id = auth.uid()
    and public.is_assigned_diet_item(diet_checkins.diet_item_id)
    and checkin_date between (current_date - 7) and (current_date + 1)
  );

create policy "diet_checkins_update_member"
  on public.diet_checkins for update
  to authenticated
  using (member_id = auth.uid())
  with check (
    member_id = auth.uid()
    and public.is_assigned_diet_item(diet_checkins.diet_item_id)
    and checkin_date between (current_date - 7) and (current_date + 1)
  );

create policy "diet_checkins_delete_member"
  on public.diet_checkins for delete
  to authenticated
  using (member_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 9. recordings — storage_path and live_class_id stop being forgeable
-- ---------------------------------------------------------------------------

-- storage_path is client-supplied, and transcribe-recording signs it with the SERVICE ROLE. With
-- no constraint, a coach could point their own recording at ANOTHER coach's private object key
-- (which Storage RLS refuses to let them read directly), have the real ASR provider transcribe
-- it, and read the victim's session back as a transcript on their own row. Proven end-to-end by
-- the auditor against the local stack.
--
-- A CHECK, not a policy: it binds every writer including the service role, so a bug in the Edge
-- Function cannot reintroduce the hole either. The rule mirrors public.owns_recording_object()
-- (the Storage object-name gate), so a path that passes here is a path the uploader could have
-- written to anyway.
alter table public.recordings
  drop constraint if exists recordings_storage_path_owned;
alter table public.recordings
  add constraint recordings_storage_path_owned check (
    storage_path is null
    or (
      length(storage_path) <= 512
      and position('..' in storage_path) = 0
      and storage_path like (uploaded_by::text || '/%')
    )
  );

-- Extend the existing status/lease guard (20260919151000) with the two columns it did not cover.
-- live_class_id was re-pointable after insert, which let an attacker move their recording onto
-- another coach's class -- injecting published notes into that coach's members' feed and handing
-- the victim coach manage rights on a row whose object they cannot see (reproduced twice).
create or replace function public.recordings_guard_client_writes()
returns trigger
language plpgsql
as $$
begin
  -- The pipeline (service role / migrations) owns the state machine outright.
  if public.is_pipeline_role() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'uploading' then
      raise exception 'recordings.status must be ''uploading'' on insert; the transcription pipeline sets every later status'
        using errcode = '42501';
    end if;
    if new.error_message is not null then
      raise exception 'recordings.error_message is set by the transcription pipeline'
        using errcode = '42501';
    end if;
    if new.claimed_at is not null then
      raise exception 'recordings.claimed_at is set by the transcription pipeline'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE. The coach may publish or unpublish a finished recording; every other status move
  -- belongs to the pipeline.
  if new.status is distinct from old.status
     and (old.status, new.status) not in (('draft', 'published'), ('published', 'draft')) then
    raise exception 'recordings.status transition % -> % is made by the transcription pipeline',
      old.status, new.status
      using errcode = '42501';
  end if;

  if new.error_message is distinct from old.error_message then
    raise exception 'recordings.error_message is set by the transcription pipeline'
      using errcode = '42501';
  end if;

  -- The lease belongs to the pipeline: a client that could back-date claimed_at could make a live
  -- run look abandoned and have a second run started on top of it.
  if new.claimed_at is distinct from old.claimed_at then
    raise exception 'recordings.claimed_at is set by the transcription pipeline'
      using errcode = '42501';
  end if;

  -- storage_path is the uploader's to set, but only while the object is still being uploaded;
  -- afterwards it would re-point a transcript/draft at a different file.
  if new.storage_path is distinct from old.storage_path and old.status <> 'uploading' then
    raise exception 'recordings.storage_path can only change while the recording is ''uploading'''
      using errcode = '42501';
  end if;

  -- NEW: a recording belongs to the class it was created for, for good. Moving it is how an
  -- attacker publishes notes into another coach's tenant.
  if new.live_class_id is distinct from old.live_class_id then
    raise exception 'recordings.live_class_id cannot be changed after insert'
      using errcode = '42501';
  end if;

  -- NEW: and it belongs to the account that uploaded it.
  if new.uploaded_by is distinct from old.uploaded_by then
    raise exception 'recordings.uploaded_by cannot be changed' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.recordings_guard_client_writes() from public;

-- REPLACES recordings_update_owner_or_coach, whose WITH CHECK was satisfied by
-- `uploaded_by = auth.uid()` alone. Intent kept (the uploader or the class's coach may edit the
-- row) with the coach role required and the destination class re-validated, so the trigger above
-- is not the only thing standing between an attacker and another coach's tenant.
drop policy if exists "recordings_update_owner_or_coach" on public.recordings;
create policy "recordings_update_recording_coach"
  on public.recordings for update
  to authenticated
  using (public.is_coach_or_admin() and public.can_manage_recording(recordings.id))
  with check (
    public.is_coach_or_admin()
    and public.can_manage_recording(recordings.id)
    and (
      recordings.live_class_id is null
      or exists (
        select 1 from public.live_classes lc
        where lc.id = recordings.live_class_id and lc.coach_id = auth.uid()
      )
    )
  );

-- Uploading a recording is a coach action. Intent of recordings_insert_own_class_uploading
-- (20260919151000) is kept verbatim; only the server-side role check is added.
drop policy if exists "recordings_insert_own_class_uploading" on public.recordings;
create policy "recordings_insert_own_class_uploading"
  on public.recordings for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and public.is_coach_or_admin()
    and status = 'uploading'
    and error_message is null
    and exists (
      select 1
      from public.live_classes lc
      where lc.id = recordings.live_class_id
        and lc.coach_id = auth.uid()
    )
  );

drop policy if exists "recordings_delete_owner" on public.recordings;
create policy "recordings_delete_owner"
  on public.recordings for delete
  to authenticated
  using (uploaded_by = auth.uid() and public.is_coach_or_admin());

-- The 20260919151000 migration states that storage_path "is not selected by member queries", but
-- nothing enforced it: a published recording is readable by all of the coach's members and every
-- column privilege was intact, so any member could read the private object key (and hand it to
-- the signed-URL hole above). This is a COLUMN privilege revoke, not a function EXECUTE revoke —
-- the SIGSEGV hazard documented elsewhere in this schema does not apply. The client reads
-- `has_file` instead (src/features/notes/api.ts), and still WRITES storage_path during upload,
-- so only SELECT is withdrawn.
--
-- A bare `revoke select (storage_path)` is a no-op while the role still holds table-level SELECT
-- (verified: the column was still readable), so the table grant is replaced by a column list.
-- INSERT/UPDATE/DELETE stay table-level, which is what keeps upload.ts's
-- `update({ storage_path })` working. RLS policy expressions are not subject to the caller's
-- column privileges, so every USING/WITH CHECK that mentions storage_path still evaluates.
revoke select on public.recordings from anon, authenticated;
grant select (
  id, live_class_id, uploaded_by, status, created_at, error_message, claimed_at, has_file
) on public.recordings to anon, authenticated;

-- Storage object writes are a coach action too: without this any authenticated account could park
-- 500 MB under their own uid prefix in the private recordings bucket.
drop policy if exists "recordings_objects_insert_own" on storage.objects;
create policy "recordings_objects_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'recordings'
    and public.owns_recording_object(name)
    and public.is_coach_or_admin()
  );

drop policy if exists "recordings_objects_update_own" on storage.objects;
create policy "recordings_objects_update_own"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'recordings' and public.owns_recording_object(name) and public.is_coach_or_admin())
  with check (bucket_id = 'recordings' and public.owns_recording_object(name) and public.is_coach_or_admin());

-- recording_coach_id() was a SECURITY DEFINER oracle: any authenticated user could map an
-- arbitrary recording uuid to the coach who owns it. Same signature and same answer for every
-- legitimate caller (can_manage_recording asks when the caller IS the coach;
-- can_read_published_notes asks when the caller is one of that coach's members) -- NULL for
-- everyone else, so it can no longer be used to enumerate the customer base.
create or replace function public.recording_coach_id(p_recording uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.coach_id
  from (
    select coalesce(lc.coach_id, r.uploaded_by) as coach_id
    from public.recordings r
    left join public.live_classes lc on lc.id = r.live_class_id
    where r.id = p_recording
      and auth.uid() is not null
  ) c
  where c.coach_id = auth.uid()
     or exists (
       select 1 from public.profiles p
       where p.id = auth.uid() and p.coach_id = c.coach_id
     );
$$;

comment on function public.recording_coach_id(uuid) is
  'The coach who owns a recording (class coach, else uploader), but only when the caller is that coach or one of that coach''s members; NULL otherwise.';

revoke all on function public.recording_coach_id(uuid) from public;

-- workout_notes.created_by had no constraint at all, so anyone who could manage a recording could
-- stamp any uuid as the author of a member-facing published note. Intent unchanged; the audit
-- trail now has to be honest. (The Edge Function writes as the service role and bypasses RLS.)
drop policy if exists "workout_notes_write_recording_coach" on public.workout_notes;
create policy "workout_notes_write_recording_coach"
  on public.workout_notes for all
  to authenticated
  using (public.can_manage_recording(workout_notes.recording_id))
  with check (
    public.can_manage_recording(workout_notes.recording_id)
    and (created_by is null or created_by = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 10. moderation_reports — moderation is scoped to your own tenant
-- ---------------------------------------------------------------------------

-- Both policies reduced to "the caller's role is coach or admin", with nothing tying the report
-- to the caller: every coach on the platform read every other gym's abuse reports (free-text PII
-- written by members) and could silently dismiss them -- including reports filed against
-- themselves. Intent kept (reporters see their own reports; moderators moderate), scoped.
drop policy if exists "moderation_reports_select_reporter_or_moderator" on public.moderation_reports;
create policy "moderation_reports_select_reporter_or_moderator"
  on public.moderation_reports for select
  to authenticated
  using (
    reporter_id = auth.uid()
    or public.is_admin()
    or (
      public.is_coach_or_admin()
      and (
        public.is_coach_of_member(moderation_reports.reporter_id)
        or public.is_coach_of_member(moderation_reports.reported_user_id)
      )
    )
  );

drop policy if exists "moderation_reports_update_moderator" on public.moderation_reports;
create policy "moderation_reports_update_moderator"
  on public.moderation_reports for update
  to authenticated
  using (
    reported_user_id <> auth.uid()
    and (
      public.is_admin()
      or (
        public.is_coach_or_admin()
        and (
          public.is_coach_of_member(moderation_reports.reporter_id)
          or public.is_coach_of_member(moderation_reports.reported_user_id)
        )
      )
    )
  )
  with check (
    reported_user_id <> auth.uid()
    and (
      public.is_admin()
      or (
        public.is_coach_or_admin()
        and (
          public.is_coach_of_member(moderation_reports.reporter_id)
          or public.is_coach_of_member(moderation_reports.reported_user_id)
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 11. Hardening odds and ends
-- ---------------------------------------------------------------------------

-- can_use_presence_topic is the predicate of the two realtime.messages policies but, unlike every
-- sibling helper in 20260919140000, it was SECURITY INVOKER with no pinned search_path. Not
-- currently exploitable (neither anon nor authenticated holds CREATE on schema public, verified),
-- but a one-grant-away hole in an authorization predicate. Same signature, same answers.
create or replace function public.can_use_presence_topic(topic text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
           when topic like 'group:%' then public.can_use_group_presence_topic(topic)
           when topic like 'live:%'  then public.can_use_live_class_presence_topic(topic)
           else false
         end;
$$;

revoke all on function public.can_use_presence_topic(text) from public;

-- Two trigger functions kept PUBLIC EXECUTE, unlike the rest of the schema. Revoking from
-- `public` only is the safe half of the convention (anon/authenticated keep their default grant,
-- so the SIGSEGV hazard does not apply).
revoke all on function public.push_tokens_touch_updated_at() from public;
revoke all on function public.subscriptions_touch_updated_at() from public;

-- No text column anywhere was bounded: one member wrote 48 MB into push_tokens in a single
-- request. Bounds are generous (nothing the app writes comes close) and are checked against the
-- current data before being added.
alter table public.profiles drop constraint if exists profiles_text_bounds;
alter table public.profiles add constraint profiles_text_bounds check (
  length(full_name) between 1 and 120
  and (avatar_url is null or length(avatar_url) <= 2048)
);

alter table public.groups drop constraint if exists groups_text_bounds;
alter table public.groups add constraint groups_text_bounds check (
  length(name) between 1 and 120
  and (description is null or length(description) <= 2000)
);

alter table public.moderation_reports drop constraint if exists moderation_reports_text_bounds;
alter table public.moderation_reports add constraint moderation_reports_text_bounds check (
  length(reason) between 1 and 2000
);

alter table public.push_tokens drop constraint if exists push_tokens_text_bounds;
alter table public.push_tokens add constraint push_tokens_text_bounds check (
  length(expo_push_token) between 1 and 512
  and (platform is null or length(platform) <= 32)
);

alter table public.live_classes drop constraint if exists live_classes_text_bounds;
alter table public.live_classes add constraint live_classes_text_bounds check (
  length(title) between 1 and 200
  and length(agora_channel_name) between 1 and 64
);

alter table public.workout_note_progress drop constraint if exists workout_note_progress_text_bounds;
alter table public.workout_note_progress add constraint workout_note_progress_text_bounds check (
  length(item_key) between 1 and 200
);

alter table public.workout_plans drop constraint if exists workout_plans_text_bounds;
alter table public.workout_plans add constraint workout_plans_text_bounds check (
  length(title) between 1 and 200 and (description is null or length(description) <= 4000)
);

alter table public.diet_plans drop constraint if exists diet_plans_text_bounds;
alter table public.diet_plans add constraint diet_plans_text_bounds check (
  length(title) between 1 and 200 and (description is null or length(description) <= 4000)
);

-- Row cap to go with the length cap: a device has one token, not five hundred.
create or replace function public.push_tokens_enforce_row_cap()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_count integer;
begin
  if public.is_privileged_writer() then
    return new;
  end if;
  select count(*) into v_count from public.push_tokens where user_id = new.user_id;
  if v_count >= 20 then
    raise exception 'too many registered push tokens for this user' using errcode = '54000';
  end if;
  return new;
end;
$$;

revoke all on function public.push_tokens_enforce_row_cap() from public;

drop trigger if exists push_tokens_enforce_row_cap on public.push_tokens;
create trigger push_tokens_enforce_row_cap
  before insert on public.push_tokens
  for each row execute function public.push_tokens_enforce_row_cap();
