-- D1b.3 — member timezone, local completion dates, coach assignment stamp.
--
-- The bug this closes: "did I work out today?" was answered in UTC. A member
-- in Asia/Riyadh (UTC+3) finishing at 00:30 local had already been counted on
-- YESTERDAY's date, so their streak broke while they were training daily, and
-- the one-completion-per-day rule let them log the same day twice. A member in
-- America/Los_Angeles (UTC-8) training at 17:00 was counted TOMORROW.
--
-- The fix stores the member's own IANA timezone on their profile and stamps
-- every completion with the LOCAL date it happened on. That stamped date — not
-- a UTC expression — is what the one-per-day unique, the streak view and
-- finish_workout() all key on from here.
--
-- Deliberate non-goal: changing your timezone does NOT rewrite history. A
-- completion's local date is a fact about where the member was when they
-- trained, and recomputing old rows could also collide with the one-per-day
-- unique. Only completions logged after the change use the new zone.

begin;

-- ---------------------------------------------------------------------------
-- 1. profiles.timezone and profiles.coach_assigned_at
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists timezone          text not null default 'UTC',
  add column if not exists coach_assigned_at timestamptz;

comment on column public.profiles.timezone is
  'IANA timezone name (validated against pg_timezone_names). Writable by the '
  'profile owner; drives workout_completions.completed_local_date.';
comment on column public.profiles.coach_assigned_at is
  'When coach_id last changed. Server-maintained: clients cannot set it.';

-- Validation lives in a trigger rather than a CHECK because the set of valid
-- names comes from the tz database, which is not immutable — a CHECK against
-- pg_timezone_names would be wrong the moment the image ships a new tzdata.
create or replace function public.profiles_validate_timezone()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_canonical text;
begin
  if new.timezone is null or btrim(new.timezone) = '' then
    new.timezone := 'UTC';
    return new;
  end if;

  -- Case-insensitive lookup, then store the catalog's own spelling, so
  -- 'europe/berlin' and 'Europe/Berlin' cannot become two different profiles.
  select z.name into v_canonical
  from pg_timezone_names z
  where lower(z.name) = lower(btrim(new.timezone))
  limit 1;

  if v_canonical is null then
    raise exception 'invalid_timezone' using errcode = '22023',
      detail = btrim(new.timezone) || ' is not a known IANA timezone name',
      hint   = 'Use a name such as Europe/Berlin, Asia/Riyadh or UTC.';
  end if;

  new.timezone := v_canonical;
  return new;
end;
$$;

drop trigger if exists profiles_validate_timezone on public.profiles;
create trigger profiles_validate_timezone
  before insert or update of timezone on public.profiles
  for each row execute function public.profiles_validate_timezone();

-- coach_assigned_at is derived, never supplied. An unprivileged writer's value
-- is discarded outright (rather than rejected) so that a client PATCHing the
-- whole profile row — which is what PostgREST does — is not broken by a column
-- it has no business setting.
create or replace function public.profiles_sync_coach_assigned_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.coach_id is null then
      new.coach_assigned_at := null;
    else
      new.coach_assigned_at := coalesce(new.coach_assigned_at, now());
    end if;
    return new;
  end if;

  if new.coach_id is distinct from old.coach_id then
    new.coach_assigned_at := case when new.coach_id is null then null else now() end;
  elsif not public.is_privileged_writer() then
    new.coach_assigned_at := old.coach_assigned_at;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_sync_coach_assigned_at on public.profiles;
create trigger profiles_sync_coach_assigned_at
  before insert or update on public.profiles
  for each row execute function public.profiles_sync_coach_assigned_at();

-- Backfill: everyone who already has a coach is stamped as of now. There is no
-- record of when the assignment actually happened, and "now" is the only
-- honest answer that keeps the D1c inactivity window (which uses the LATER of
-- last completion and coach_assigned_at) from flagging existing members.
update public.profiles
   set coach_assigned_at = now()
 where coach_id is not null
   and coach_assigned_at is null;

create index if not exists profiles_coach_assigned_idx
  on public.profiles (coach_id, coach_assigned_at desc)
  where coach_id is not null;

-- ---------------------------------------------------------------------------
-- 2. workout_completions.completed_local_date
--
-- Trigger name matters: it must sort AFTER
-- workout_completions_guard_client_writes, which is what stamps completed_at
-- with now() on INSERT. Postgres fires same-timing row triggers in name order,
-- so 's' after 'g' guarantees we read the final timestamp, not a client's.
-- ---------------------------------------------------------------------------

alter table public.workout_completions
  add column if not exists completed_local_date date;

comment on column public.workout_completions.completed_local_date is
  'The calendar date this session happened on in the MEMBER''s timezone at the '
  'time. Server-maintained; the one-per-day rule and streaks key on it. Not '
  'recomputed when the member later changes their timezone.';

create or replace function public.workout_completions_set_local_date()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_tz text;
begin
  select coalesce(nullif(btrim(p.timezone), ''), 'UTC')
    into v_tz
  from public.profiles p
  where p.id = new.member_id;

  new.completed_local_date :=
    (new.completed_at at time zone coalesce(v_tz, 'UTC'))::date;
  return new;
end;
$$;

drop trigger if exists workout_completions_set_local_date on public.workout_completions;
create trigger workout_completions_set_local_date
  before insert on public.workout_completions
  for each row execute function public.workout_completions_set_local_date();

-- Backfill from UTC. That is exactly what the old unique index and the old
-- streak view meant by "the day", so no historical streak changes value here;
-- the change of meaning starts with the next completion.
update public.workout_completions
   set completed_local_date = (completed_at at time zone 'utc')::date
 where completed_local_date is null;

alter table public.workout_completions
  alter column completed_local_date set not null;

-- ---------------------------------------------------------------------------
-- 3. Re-key the one-completion-per-day rule.
--
-- Old: (member_id, workout_day_id, ((completed_at at time zone 'utc')::date)).
-- The intent is unchanged — one log per member per workout day per calendar
-- day — but "calendar day" is now the member's, which is what it always meant.
-- ---------------------------------------------------------------------------

create unique index if not exists workout_completions_member_day_local_key
  on public.workout_completions (member_id, workout_day_id, completed_local_date);

drop index if exists public.workout_completions_member_day_date_key;

create index if not exists workout_completions_member_local_date_idx
  on public.workout_completions (member_id, completed_local_date desc);

-- ---------------------------------------------------------------------------
-- 4. Streaks read the local date.
--
-- Same view, same columns, same security_invoker: only the date expression
-- changes. `current_date` in the staleness test stays server-side — a member
-- whose streak ended "yesterday" is still on a streak, and the one-day slack
-- absorbs the timezone difference for every zone on earth.
-- ---------------------------------------------------------------------------

create or replace view public.member_workout_stats
with (security_invoker = true) as
with completion_dates as (
  select wc.member_id, wc.completed_local_date as completion_date
  from public.workout_completions wc
  where wc.status = 'completed'
  group by wc.member_id, wc.completed_local_date
), islands as (
  select cd.member_id, cd.completion_date,
         cd.completion_date
           - (row_number() over (partition by cd.member_id order by cd.completion_date))::int as island
  from completion_dates cd
), streaks as (
  select i.member_id, max(i.completion_date) as streak_end, count(*) as streak_length
  from islands i
  group by i.member_id, i.island
), latest_streak as (
  select distinct on (s.member_id) s.member_id, s.streak_end, s.streak_length
  from streaks s
  order by s.member_id, s.streak_end desc
), totals as (
  select wc.member_id,
         count(*) filter (where wc.status = 'completed') as completed_count,
         count(*) filter (where wc.status = 'missed')    as missed_count,
         coalesce(sum(wc.effort_score) filter (where wc.status = 'completed'), 0) as total_effort_score,
         round(avg(wc.effort_score) filter (where wc.status = 'completed'), 2)    as avg_effort_score
  from public.workout_completions wc
  group by wc.member_id
)
select p.id as member_id,
       coalesce(t.completed_count, 0)    as completed_count,
       coalesce(t.missed_count, 0)       as missed_count,
       coalesce(t.total_effort_score, 0) as total_effort_score,
       t.avg_effort_score,
       case
         when ls.streak_end is not null and ls.streak_end >= (current_date - interval '1 day')
           then ls.streak_length
         else 0::bigint
       end as current_streak
from public.profiles p
left join totals t on t.member_id = p.id
left join latest_streak ls on ls.member_id = p.id
where p.role = 'member';

-- ---------------------------------------------------------------------------
-- 5. finish_workout() follows the re-key.
--
-- Same signature, same two error codes, same idempotency contract (D1a): only
-- the conflict target and the read-back predicate move from the UTC
-- expression to the stored local date. The BEFORE triggers fill
-- completed_local_date before conflict inference runs, so the target is
-- resolved and deterministic within the statement.
-- ---------------------------------------------------------------------------

create or replace function public.finish_workout(
  p_workout_day_id  uuid,
  p_exercise_ids    uuid[] default '{}',
  p_client_request_id uuid default null
)
returns table (completion_id uuid, already_logged boolean, completed_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid       uuid := auth.uid();
  v_member    uuid;
  v_local     date;
  v_id        uuid;
  v_completed timestamptz;
  v_already   boolean := false;
begin
  if v_uid is null then
    raise exception 'not_your_plan'
      using errcode = '42501',
            hint = 'Sign in as the member this workout belongs to.';
  end if;

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

  if v_member <> v_uid then
    raise exception 'not_your_plan'
      using errcode = '42501',
            hint = 'This workout belongs to another member.';
  end if;

  -- The member's own "today". Computed here as well as in the trigger so the
  -- already-logged read-back below looks for the same row the unique index
  -- just rejected.
  select (now() at time zone coalesce(nullif(btrim(p.timezone), ''), 'UTC'))::date
    into v_local
  from public.profiles p
  where p.id = v_uid;

  insert into public.workout_completions as wc (member_id, workout_day_id, status)
  values (v_uid, p_workout_day_id, 'completed')
  on conflict (member_id, workout_day_id, completed_local_date) do nothing
  returning wc.id, wc.completed_at into v_id, v_completed;

  if v_id is null then
    v_already := true;
    select wc.id, wc.completed_at
      into v_id, v_completed
    from public.workout_completions wc
    where wc.member_id = v_uid
      and wc.workout_day_id = p_workout_day_id
      and wc.completed_local_date = v_local
    order by wc.completed_at desc
    limit 1;

    if v_id is null then
      raise exception 'day_not_found'
        using errcode = 'P0002',
              hint = 'The completion could not be read back. Try again.';
    end if;
  end if;

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
  'Atomically logs a workout plus its exercise ticks for the calling member. '
  'Idempotent per member per workout day per MEMBER-LOCAL date. Errors: 42501 '
  'not_your_plan, P0002 day_not_found.';

revoke all on function public.finish_workout(uuid, uuid[], uuid) from public;

commit;
