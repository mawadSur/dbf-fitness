-- ===========================================================================
-- 20260921100000_plan_integrity.sql — D1a "plan integrity core"
--
-- Three CRITICAL problems two independent reviews found in the workout schema:
--
--   (1) A member could end up with more than one workout_plans row, which broke
--       every `.maybeSingle()` read in the app, and there was no plan revision
--       to hang edits off.
--   (2) Editing or deleting a plan destroyed the MEMBER's history: workout_days
--       / exercises cascade-deleted workout_completions and exercise_completions,
--       so a coach tidying up (or deleting their own account) erased other
--       people's training record.
--   (3) Authorization followed the plan's AUTHOR (`workout_plans.coach_id`), not
--       the member's CURRENT coach, so a coach a member had left kept full
--       read/write access to the plan and the history while the member's new
--       coach had none.
--
-- Everything here is additive and BACKWARD COMPATIBLE: the direct-insert path
-- the shipped client uses (src/features/workouts/queries.ts finishWorkout)
-- still succeeds unchanged.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. workout_plans: one plan per member, authorship index, revision counter
-- ---------------------------------------------------------------------------

-- Abort loudly rather than silently dropping a member's second plan. The
-- migration is designed to be applied to a live database; a duplicate is a data
-- decision a human has to make.
do $$
declare
  v_dupes int;
  v_members text;
begin
  select count(*), coalesce(string_agg(member_id::text, ', '), '')
    into v_dupes, v_members
  from (
    select member_id from public.workout_plans group by member_id having count(*) > 1
  ) d;

  if v_dupes > 0 then
    raise exception
      'workout_plans holds more than one plan for % member(s) (%). 20260921100000 enforces one plan per member; merge or delete the extra rows first.',
      v_dupes, v_members
      using errcode = '23505';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workout_plans_member_id_key'
      and conrelid = 'public.workout_plans'::regclass
  ) then
    alter table public.workout_plans add constraint workout_plans_member_id_key unique (member_id);
  end if;
end $$;

comment on constraint workout_plans_member_id_key on public.workout_plans is
  'One plan per member (20260921100000). The app reads the plan with .maybeSingle(); a second row used to make that read fail for the member.';

-- coach_id is authorship only from this migration on (see section 5), but the
-- coach dashboard still lists "plans I wrote", so it needs an index of its own
-- now that it is no longer part of any policy predicate.
create index if not exists workout_plans_coach_id_idx on public.workout_plans (coach_id);

alter table public.workout_plans add column if not exists rev int not null default 1;

alter table public.workout_plans drop constraint if exists workout_plans_rev_positive;
alter table public.workout_plans add constraint workout_plans_rev_positive check (rev >= 1);

comment on column public.workout_plans.rev is
  'Plan revision, bumped by the publish flow (20260921110000). Snapshotted into workout_completions.plan_rev so a completion records which version of the plan the member actually did.';

-- ---------------------------------------------------------------------------
-- 2. Soft delete on workout_days / exercises
--
-- A coach removing a day from a plan must not remove the member's completions
-- on it. Rows are archived instead of deleted; members stop seeing them, the
-- current coach and admins still do.
-- ---------------------------------------------------------------------------

alter table public.workout_days add column if not exists archived_at timestamptz;
alter table public.exercises add column if not exists archived_at timestamptz;

comment on column public.workout_days.archived_at is
  'Soft delete (20260921100000). Non-null hides the day from the member; the current coach and admins still see it, and completions that reference it keep working.';
comment on column public.exercises.archived_at is
  'Soft delete (20260921100000). Non-null hides the exercise from the member and makes finish_workout ignore it; the row stays so exercise_completions keep their target.';

create index if not exists workout_days_plan_active_idx
  on public.workout_days (workout_plan_id, day_number) where archived_at is null;
create index if not exists exercises_day_active_idx
  on public.exercises (workout_day_id, order_index) where archived_at is null;

-- ---------------------------------------------------------------------------
-- 3. History survives edits: snapshots + SET NULL instead of CASCADE
--
-- workout_completions.workout_day_id was ON DELETE CASCADE, so deleting a day
-- (or a plan, or the authoring coach's account) deleted the MEMBER's completion
-- and, through it, their exercise ticks. It becomes ON DELETE SET NULL and the
-- completion carries its own copy of what it was: day number, block name and
-- the plan revision. exercise_completions does the same with the exercise name.
-- ---------------------------------------------------------------------------

alter table public.workout_completions add column if not exists day_number int;
alter table public.workout_completions add column if not exists block_name text;
alter table public.workout_completions add column if not exists plan_rev int;
alter table public.exercise_completions add column if not exists exercise_name text;

comment on column public.workout_completions.day_number is
  'Snapshot of workout_days.day_number at completion time (20260921100000). Survives the day being edited, archived or deleted.';
comment on column public.workout_completions.block_name is
  'Snapshot of workout_days.block_name at completion time (20260921100000).';
comment on column public.workout_completions.plan_rev is
  'Snapshot of workout_plans.rev at completion time (20260921100000): which version of the plan the member actually did.';
comment on column public.exercise_completions.exercise_name is
  'Snapshot of exercises.name at tick time (20260921100000). Survives the exercise being renamed, archived or deleted.';

alter table public.workout_completions alter column workout_day_id drop not null;
alter table public.workout_completions drop constraint if exists workout_completions_workout_day_id_fkey;
alter table public.workout_completions
  add constraint workout_completions_workout_day_id_fkey
  foreign key (workout_day_id) references public.workout_days (id) on delete set null;

comment on constraint workout_completions_workout_day_id_fkey on public.workout_completions is
  'ON DELETE SET NULL since 20260921100000 (was CASCADE since 20260919114448). Deleting a day, a plan or the authoring coach no longer erases the MEMBER''s completion; the row keeps day_number / block_name / plan_rev.';

alter table public.exercise_completions alter column exercise_id drop not null;
alter table public.exercise_completions drop constraint if exists exercise_completions_exercise_id_fkey;
alter table public.exercise_completions
  add constraint exercise_completions_exercise_id_fkey
  foreign key (exercise_id) references public.exercises (id) on delete set null;

comment on constraint exercise_completions_exercise_id_fkey on public.exercise_completions is
  'ON DELETE SET NULL since 20260921100000 (was CASCADE). The tick keeps exercise_name.';

-- The catalog comment 20260919154000 attached to workout_plans_coach_id_fkey
-- described the member rows the cascade destroyed. That disclosure is now
-- OBSOLETE for completions: the plan and its days still go with the authoring
-- coach, but the member's workout_completions and exercise_completions stay
-- (orphaned, with their snapshots). Restated here so nothing keeps promising
-- destruction that no longer happens. 20_account_deletion.test.sql is updated
-- in the same change.
comment on constraint workout_plans_coach_id_fkey on public.workout_plans is
  'ON DELETE CASCADE (since 20260919114448). Deleting the AUTHORING coach still deletes the plan, its workout_days and its exercises. Since 20260921100000 it no longer destroys the MEMBER''s own workout_completions / exercise_completions: those FKs are ON DELETE SET NULL and the rows keep their day_number / block_name / plan_rev / exercise_name snapshots. Disclosed to the coach by the delete-account panel.';

-- Snapshot triggers. Server-owned on INSERT for ordinary callers (a client
-- cannot invent a day number for its own completion); a privileged writer may
-- supply explicit values, which is what the backfill below and pgTAP fixtures
-- need.
create or replace function public.workout_completions_fill_snapshot()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.workout_day_id is null then
    return new;
  end if;

  if public.is_privileged_writer()
     and new.day_number is not null
     and new.block_name is not null
     and new.plan_rev is not null then
    return new;
  end if;

  select wd.day_number, wd.block_name, wp.rev
    into new.day_number, new.block_name, new.plan_rev
  from public.workout_days wd
  join public.workout_plans wp on wp.id = wd.workout_plan_id
  where wd.id = new.workout_day_id;

  return new;
end;
$$;

comment on function public.workout_completions_fill_snapshot() is
  'BEFORE INSERT on workout_completions: copies day_number / block_name / plan_rev off the day and its plan so the completion survives the day being edited or deleted. Added by 20260921100000.';

revoke all on function public.workout_completions_fill_snapshot() from public;

-- Fires before workout_completions_guard_client_writes (triggers run in name
-- order and f < g); the guard does not look at these columns.
drop trigger if exists workout_completions_fill_snapshot on public.workout_completions;
create trigger workout_completions_fill_snapshot
  before insert on public.workout_completions
  for each row execute function public.workout_completions_fill_snapshot();

create or replace function public.exercise_completions_fill_snapshot()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.exercise_id is null then
    return new;
  end if;

  if public.is_privileged_writer() and new.exercise_name is not null then
    return new;
  end if;

  select e.name into new.exercise_name
  from public.exercises e
  where e.id = new.exercise_id;

  return new;
end;
$$;

comment on function public.exercise_completions_fill_snapshot() is
  'BEFORE INSERT on exercise_completions: copies the exercise name so the tick survives the exercise being renamed, archived or deleted. Added by 20260921100000.';

revoke all on function public.exercise_completions_fill_snapshot() from public;

drop trigger if exists exercise_completions_fill_snapshot on public.exercise_completions;
create trigger exercise_completions_fill_snapshot
  before insert on public.exercise_completions
  for each row execute function public.exercise_completions_fill_snapshot();

-- Backfill every pre-existing row. Runs as the migration role, which
-- is_privileged_writer() short-circuits in workout_completions_guard_client_writes.
update public.workout_completions wc
set day_number = wd.day_number,
    block_name = wd.block_name,
    plan_rev = wp.rev
from public.workout_days wd
join public.workout_plans wp on wp.id = wd.workout_plan_id
where wd.id = wc.workout_day_id
  and (wc.day_number is null or wc.block_name is null or wc.plan_rev is null);

update public.exercise_completions ec
set exercise_name = e.name
from public.exercises e
where e.id = ec.exercise_id
  and ec.exercise_name is null;

-- ---------------------------------------------------------------------------
-- 4. exercise_completions integrity: the exercise must belong to the day
--
-- Nothing stopped a member ticking off an exercise from a stranger's plan
-- inside their own completion. The shipped client only ever sends ids from the
-- day it is showing, so it never violates this.
-- ---------------------------------------------------------------------------

create or replace function public.exercise_completions_enforce_day()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_completion_day uuid;
  v_exercise_day uuid;
begin
  if new.exercise_id is null then
    return new;  -- orphaned tick (the exercise was deleted); nothing to check
  end if;

  select wc.workout_day_id into v_completion_day
  from public.workout_completions wc
  where wc.id = new.workout_completion_id;

  if v_completion_day is null then
    return new;  -- orphaned completion; the FK on workout_completion_id is the guard
  end if;

  select e.workout_day_id into v_exercise_day
  from public.exercises e
  where e.id = new.exercise_id;

  if v_exercise_day is distinct from v_completion_day then
    raise exception
      'exercise % does not belong to the workout day of completion %',
      new.exercise_id, new.workout_completion_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.exercise_completions_enforce_day() is
  'BEFORE INSERT / UPDATE on exercise_completions: rejects (23514) an exercise that belongs to a different workout day than the completion. Skipped for orphaned ticks and orphaned completions. Added by 20260921100000.';

revoke all on function public.exercise_completions_enforce_day() from public;

drop trigger if exists exercise_completions_enforce_day on public.exercise_completions;
create trigger exercise_completions_enforce_day
  before insert or update of exercise_id, workout_completion_id on public.exercise_completions
  for each row execute function public.exercise_completions_enforce_day();

-- ---------------------------------------------------------------------------
-- 5. Reordering days: the day-number unique becomes DEFERRABLE
--
-- Swapping day 1 and day 2 needs two UPDATEs; an immediate unique rejects the
-- first one. Deferred to COMMIT so any intermediate state is legal.
-- exercises has no (day, position) uniqueness to defer — order_index has never
-- been unique, and adding one now would reject rows old clients already write.
-- ---------------------------------------------------------------------------

alter table public.workout_days drop constraint if exists workout_days_workout_plan_id_day_number_key;
alter table public.workout_days
  add constraint workout_days_workout_plan_id_day_number_key
  unique (workout_plan_id, day_number) deferrable initially deferred;

comment on constraint workout_days_workout_plan_id_day_number_key on public.workout_days is
  'DEFERRABLE INITIALLY DEFERRED since 20260921100000 so a coach can renumber / swap days inside one transaction. Violations surface at COMMIT.';

-- ---------------------------------------------------------------------------
-- 6. Indexes for the reads the coach tools are about to do
-- ---------------------------------------------------------------------------

create index if not exists exercises_workout_day_id_idx on public.exercises (workout_day_id);
create index if not exists workout_completions_member_completed_idx
  on public.workout_completions (member_id, completed_at desc);
create index if not exists workout_completions_workout_day_id_idx
  on public.workout_completions (workout_day_id);
create index if not exists exercise_completions_exercise_id_idx
  on public.exercise_completions (exercise_id);

-- The effort queue: completions the coach has not scored yet (effort_score is
-- the coach-assigned RPE column, 20260919114448).
create index if not exists workout_completions_unscored_idx
  on public.workout_completions (member_id, completed_at desc)
  where effort_score is null and status = 'completed';

-- ---------------------------------------------------------------------------
-- 7. Authorization follows the member's CURRENT coach, not the plan's author
--
-- Every coach arm below used `workout_plans.coach_id = auth.uid()` (directly or
-- through is_coach_of_workout_day). That is authorship: a coach a member had
-- LEFT kept full read/write on the plan, the days, the exercises and the
-- history, and the member's NEW coach had none of it — they could not even see
-- the plan they were supposed to take over.
--
-- The predicate becomes public.is_coach_of_member(<the plan's member_id>).
-- `coach_id` is kept as authorship only (it still drives who may CREATE a plan
-- and it is indexed in section 1).
--
-- The `public.is_coach_or_admin()` half of every write policy is UNCHANGED, so
-- this grants an admin no write it did not already have (21_admin_read_and_
-- hardening.test.sql pins that admins get read-only on this chain).
-- ---------------------------------------------------------------------------

-- REDEFINED (20260919152000 -> here): same name, same signature, same "is this
-- caller the coach for this day" question — answered against the member's
-- current coach instead of the plan's author. Used by the day / exercise write
-- policies below and by workout_completions_guard_client_writes.
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
       where wd.id = p_day
         and public.is_coach_of_member(wp.member_id)
     );
$$;

comment on function public.is_coach_of_workout_day(uuid) is
  'True when the caller is the CURRENT coach of the member whose plan owns this day (20260921100000; it used to compare workout_plans.coach_id, i.e. the plan''s author, which left a former coach in control and locked the new one out). NULL uid / unknown day -> false.';

revoke all on function public.is_coach_of_workout_day(uuid) from public;

-- workout_plans -------------------------------------------------------------
drop policy if exists "workout_plans_select_owner" on public.workout_plans;
create policy "workout_plans_select_owner"
  on public.workout_plans for select
  using (
    member_id = auth.uid()
    or public.is_coach_of_member(workout_plans.member_id)
  );

drop policy if exists "workout_plans_update_coach" on public.workout_plans;
create policy "workout_plans_update_coach"
  on public.workout_plans for update
  to authenticated
  using (public.is_coach_or_admin() and public.is_coach_of_member(workout_plans.member_id))
  with check (public.is_coach_or_admin() and public.is_coach_of_member(workout_plans.member_id));

drop policy if exists "workout_plans_delete_coach" on public.workout_plans;
create policy "workout_plans_delete_coach"
  on public.workout_plans for delete
  to authenticated
  using (public.is_coach_or_admin() and public.is_coach_of_member(workout_plans.member_id));

-- workout_plans_insert_coach is deliberately UNCHANGED: creating a plan still
-- records the creating coach as the author (coach_id = auth.uid()) and still
-- requires them to be that member's current coach.

-- workout_days --------------------------------------------------------------
-- Members additionally stop seeing archived days.
drop policy if exists "workout_days_select_owner" on public.workout_days;
create policy "workout_days_select_owner"
  on public.workout_days for select
  using (
    exists (
      select 1 from public.workout_plans wp
      where wp.id = workout_days.workout_plan_id
        and (
          (wp.member_id = auth.uid() and workout_days.archived_at is null)
          or public.is_coach_of_member(wp.member_id)
        )
    )
  );

drop policy if exists "workout_days_write_coach" on public.workout_days;
create policy "workout_days_write_coach"
  on public.workout_days for all
  to authenticated
  using (public.is_coach_or_admin() and public.is_coach_of_workout_day(workout_days.id))
  with check (
    public.is_coach_or_admin()
    and exists (
      select 1 from public.workout_plans wp
      where wp.id = workout_days.workout_plan_id
        and public.is_coach_of_member(wp.member_id)
    )
  );

-- exercises -----------------------------------------------------------------
drop policy if exists "exercises_select_owner" on public.exercises;
create policy "exercises_select_owner"
  on public.exercises for select
  using (
    exists (
      select 1
      from public.workout_days wd
      join public.workout_plans wp on wp.id = wd.workout_plan_id
      where wd.id = exercises.workout_day_id
        and (
          (
            wp.member_id = auth.uid()
            and exercises.archived_at is null
            and wd.archived_at is null
          )
          or public.is_coach_of_member(wp.member_id)
        )
    )
  );

drop policy if exists "exercises_write_coach" on public.exercises;
create policy "exercises_write_coach"
  on public.exercises for all
  to authenticated
  using (public.is_coach_or_admin() and public.is_coach_of_workout_day(exercises.workout_day_id))
  with check (public.is_coach_or_admin() and public.is_coach_of_workout_day(exercises.workout_day_id));

-- workout_completions -------------------------------------------------------
-- The coach arm moves off the day (is_coach_of_workout_day) onto the MEMBER, so
-- a completion whose day was deleted (workout_day_id now null) is still visible
-- to that member's coach instead of vanishing from the coach's view.
drop policy if exists "workout_completions_select_owner" on public.workout_completions;
create policy "workout_completions_select_owner"
  on public.workout_completions for select
  using (
    member_id = auth.uid()
    or public.is_coach_of_member(workout_completions.member_id)
  );

-- workout_completions_insert_own_day is UNCHANGED (member_id = auth.uid() and
-- owns_workout_day(workout_day_id)): logging a workout is the member's act and
-- was never author-scoped. owns_workout_day(null) is false, so the nullable
-- column cannot be used to insert a day-less completion.

drop policy if exists "workout_completions_update_member_or_coach" on public.workout_completions;
create policy "workout_completions_update_member_or_coach"
  on public.workout_completions for update
  to authenticated
  using (
    (member_id = auth.uid() and public.owns_workout_day(workout_completions.workout_day_id))
    or (public.is_coach_or_admin() and public.is_coach_of_member(workout_completions.member_id))
  )
  with check (
    (member_id = auth.uid() and public.owns_workout_day(workout_completions.workout_day_id))
    or (public.is_coach_or_admin() and public.is_coach_of_member(workout_completions.member_id))
  );

-- exercise_completions ------------------------------------------------------
-- exercise_completions_owner (FOR ALL, the member) is UNCHANGED. There was no
-- coach policy at all, so a coach could see that a session happened but never
-- which exercises were ticked. Added read-only, scoped to the current coach.
drop policy if exists "exercise_completions_select_coach" on public.exercise_completions;
create policy "exercise_completions_select_coach"
  on public.exercise_completions for select
  to authenticated
  using (
    exists (
      select 1 from public.workout_completions wc
      where wc.id = exercise_completions.workout_completion_id
        and public.is_coach_of_member(wc.member_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 8. workout_completions_guard_client_writes — two changes
--
-- REPLACES the 20260919154000 definition (which itself replaced 20260919152300).
-- Anyone changing the guard must change it HERE; this file is the latest.
--
--   (a) v_is_coach now asks whether the caller is the member's CURRENT coach
--       instead of the coach who authored the day's plan. Without this the new
--       coach could pass the UPDATE policy and then be rejected by the trigger
--       when scoring, and a completion whose day was deleted could never be
--       scored at all.
--   (b) An allowance for the ON DELETE SET NULL introduced in section 3. The
--       RI action issues `update workout_completions set workout_day_id = null`,
--       which lands on the "rows cannot be moved to another day" rule and, run
--       as supabase_auth_admin during account deletion, is not privileged
--       (the same trap 20260919154000 documents for scored_by). The allowance
--       requires the old day to be GONE, which no client can arrange while the
--       day still exists.
-- ---------------------------------------------------------------------------
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

  -- 20260919154000: account deletion drops a departing coach's attribution.
  if tg_op = 'UPDATE'
     and new.scored_by is null
     and old.scored_by is not null
     and new.member_id is not distinct from old.member_id
     and new.workout_day_id is not distinct from old.workout_day_id
     and new.completed_at is not distinct from old.completed_at
     and new.effort_score is not distinct from old.effort_score
     and public.is_account_deletion_context(old.scored_by) then
    return new;
  end if;

  -- 20260921100000: the workout_day_id ON DELETE SET NULL. Only ever true once
  -- the day row is already gone, i.e. from the referential-integrity action.
  if tg_op = 'UPDATE'
     and old.workout_day_id is not null
     and new.workout_day_id is null
     and new.member_id is not distinct from old.member_id
     and new.status is not distinct from old.status
     and new.completed_at is not distinct from old.completed_at
     and new.effort_score is not distinct from old.effort_score
     and new.scored_by is not distinct from old.scored_by
     and not exists (select 1 from public.workout_days wd where wd.id = old.workout_day_id) then
    return new;
  end if;

  v_is_coach := public.is_coach_or_admin() and public.is_coach_of_member(new.member_id);

  if tg_op = 'INSERT' then
    new.completed_at := now();
  elsif new.completed_at is distinct from old.completed_at then
    raise exception 'workout_completions.completed_at is set by the server'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and new.member_id is distinct from old.member_id then
    raise exception 'workout_completions rows cannot be moved to another member'
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
      if new.workout_day_id is distinct from old.workout_day_id then
        raise exception 'workout_completions rows cannot be moved to another day'
          using errcode = '42501';
      end if;
    end if;
  elsif new.scored_by is not null and new.scored_by <> auth.uid() then
    raise exception 'workout_completions.scored_by must be the scoring coach'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.workout_completions_guard_client_writes() is
  'Keeps completed_at server-side, freezes member_id for every non-privileged caller, and confines effort_score / scored_by to the member''s CURRENT coach (20260921100000; it used to be the coach who authored the day''s plan). Also lets profiles_release_before_delete() null out a departing account''s scored_by (20260919154000) and lets the workout_day_id ON DELETE SET NULL through once the day row is gone (20260921100000).';

revoke all on function public.workout_completions_guard_client_writes() from public;

-- ---------------------------------------------------------------------------
-- 9. finish_workout: one atomic, idempotent call instead of two client inserts
--
-- The shipped client (src/features/workouts/queries.ts) finishes a workout with
-- TWO separate inserts: the workout_completions row, then the exercise_completions
-- rows. A failure, a lost connection or a backgrounded app between them leaves a
-- session logged with no exercise ticks, and a retry hits the
-- workout_completions_member_day_date_key unique and surfaces a duplicate-key
-- error the client has to pattern-match on (finishWorkoutErrors.ts).
--
-- finish_workout does both in one statement pair inside one transaction and is
-- idempotent: calling it again on the same UTC day returns the row that already
-- exists with already_logged = true instead of raising.
--
-- SECURITY DEFINER, so it runs as the table owner and RLS does not apply; the
-- entitlement check is therefore IN THE BODY (see below). The BEFORE INSERT
-- triggers still fire and still see the caller's auth.uid() and the caller's
-- `role` GUC, so is_privileged_writer() stays false for an ordinary member and
-- workout_completions_guard_client_writes() applies to this path unchanged.
--
-- The OLD direct-insert path keeps working exactly as before: nothing here
-- removes or tightens workout_completions_insert_own_day.
-- ---------------------------------------------------------------------------
create or replace function public.finish_workout(
  p_workout_day_id uuid,
  p_exercise_ids uuid[] default '{}',
  p_client_request_id uuid default null
)
returns table (completion_id uuid, already_logged boolean, completed_at timestamptz)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
-- Every RETURNS TABLE column is also a plpgsql variable, and `completed_at` is
-- a real column of workout_completions used in the ON CONFLICT inference below.
-- Resolve such collisions to the COLUMN; the OUT values travel in v_* locals.
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_member uuid;
  v_id uuid;
  v_completed timestamptz;
  v_already boolean := false;
begin
  -- Gate 1: no session at all. Checked BEFORE the day lookup so an anonymous
  -- caller learns nothing about which workout day ids exist.
  if v_uid is null then
    raise exception 'not_your_plan'
      using errcode = '42501',
            hint = 'Sign in as the member this workout belongs to.';
  end if;

  -- Gate 2: the day must exist and still be live. An archived day is treated as
  -- absent: the member is no longer shown it, so finishing it is not a thing
  -- they can legitimately be doing.
  select wp.member_id
    into v_member
  from public.workout_days wd
  join public.workout_plans wp on wp.id = wd.workout_plan_id
  where wd.id = p_workout_day_id
    and wd.archived_at is null;

  if v_member is null then
    raise exception 'day_not_found'
      using errcode = 'P0002',
            hint = 'This workout day no longer exists. Reload your plan.';
  end if;

  -- Gate 3: finishing a workout is the MEMBER's own act. A coach (current or
  -- former) and an admin are refused here; they score sessions, they do not log
  -- them.
  if v_member <> v_uid then
    raise exception 'not_your_plan'
      using errcode = '42501',
            hint = 'This workout belongs to another member.';
  end if;

  -- The completion. ON CONFLICT DO NOTHING infers
  -- workout_completions_member_day_date_key (member_id, workout_day_id,
  -- ((completed_at at time zone 'utc')::date)), the one-per-member-per-day-per-
  -- UTC-date rule from 20260919152200. completed_at is stamped with now() by
  -- workout_completions_guard_client_writes() in a BEFORE trigger, which runs
  -- before conflict inference, so the expression is resolved and deterministic
  -- within the transaction.
  --
  -- Concurrency: a second session running the same call blocks on DO NOTHING
  -- until the first commits, then inserts nothing and falls into the SELECT
  -- below, which sees the committed row under READ COMMITTED. No advisory lock
  -- is needed and neither caller gets an error.
  insert into public.workout_completions as wc (member_id, workout_day_id, status)
  values (v_uid, p_workout_day_id, 'completed')
  on conflict (member_id, workout_day_id, ((completed_at at time zone 'utc')::date))
    do nothing
  returning wc.id, wc.completed_at into v_id, v_completed;

  if v_id is null then
    v_already := true;
    select wc.id, wc.completed_at
      into v_id, v_completed
    from public.workout_completions wc
    where wc.member_id = v_uid
      and wc.workout_day_id = p_workout_day_id
      and (wc.completed_at at time zone 'utc')::date = (now() at time zone 'utc')::date
    order by wc.completed_at desc
    limit 1;

    -- Defensive: the unique said a row exists, so this cannot normally be null.
    if v_id is null then
      raise exception 'day_not_found'
        using errcode = 'P0002',
              hint = 'The completion could not be read back. Try again.';
    end if;
  end if;

  -- The exercise ticks. Ids that are not on this day, ids that do not exist and
  -- ids of archived exercises are silently IGNORED rather than rejected: the
  -- member finished their session either way, and a stale client holding an id
  -- the coach has since archived must not lose the whole log. The
  -- exercise_completions_enforce_day trigger (section 4) can therefore never
  -- fire on this path.
  insert into public.exercise_completions (workout_completion_id, exercise_id)
  select v_id, e.id
  from public.exercises e
  where e.workout_day_id = p_workout_day_id
    and e.archived_at is null
    and e.id = any (coalesce(p_exercise_ids, '{}'::uuid[]))
  on conflict (workout_completion_id, exercise_id) do nothing;

  return query select v_id, v_already, v_completed;
end;
$$;

comment on function public.finish_workout(uuid, uuid[], uuid) is
  'Atomic, idempotent "I finished this workout" (20260921100000). Inserts the workout_completions row and the exercise_completions ticks in one call. Gate is in the body (SECURITY DEFINER bypasses RLS): 42501 "not_your_plan" when there is no session or the day belongs to another member, P0002 "day_not_found" for an unknown or archived day. A second call on the same UTC day returns the existing row with already_logged = true instead of the duplicate-key error the two-insert client path used to surface. Exercise ids that are not live exercises of this day are ignored. p_client_request_id is accepted for client retry bookkeeping; idempotency is keyed on (member, day, UTC date), so the id is not stored.';

revoke all on function public.finish_workout(uuid, uuid[], uuid) from public;
