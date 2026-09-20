-- workout_plans: one coach-authored plan per member.
create table public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles (id) on delete cascade,
  coach_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  description text,
  created_at timestamptz not null default now()
);

alter table public.workout_plans enable row level security;

create policy "workout_plans_select_owner"
  on public.workout_plans for select
  using (member_id = auth.uid() or coach_id = auth.uid());

create policy "workout_plans_insert_coach"
  on public.workout_plans for insert
  with check (coach_id = auth.uid());

create policy "workout_plans_update_coach"
  on public.workout_plans for update
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

create policy "workout_plans_delete_coach"
  on public.workout_plans for delete
  using (coach_id = auth.uid());

-- workout_days: ordered days within a plan (e.g. "Day 6 Workout").
create table public.workout_days (
  id uuid primary key default gen_random_uuid(),
  workout_plan_id uuid not null references public.workout_plans (id) on delete cascade,
  day_number int not null,
  block_name text not null,
  duration_minutes int,
  created_at timestamptz not null default now(),
  unique (workout_plan_id, day_number)
);

alter table public.workout_days enable row level security;

create policy "workout_days_select_owner"
  on public.workout_days for select
  using (
    exists (
      select 1 from public.workout_plans wp
      where wp.id = workout_days.workout_plan_id
        and (wp.member_id = auth.uid() or wp.coach_id = auth.uid())
    )
  );

create policy "workout_days_write_coach"
  on public.workout_days for all
  using (
    exists (
      select 1 from public.workout_plans wp
      where wp.id = workout_days.workout_plan_id and wp.coach_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workout_plans wp
      where wp.id = workout_days.workout_plan_id and wp.coach_id = auth.uid()
    )
  );

-- exercises: checklist items within a workout day.
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  workout_day_id uuid not null references public.workout_days (id) on delete cascade,
  name text not null,
  reps_or_duration text not null,
  order_index int not null,
  detail text,
  created_at timestamptz not null default now()
);

alter table public.exercises enable row level security;

create policy "exercises_select_owner"
  on public.exercises for select
  using (
    exists (
      select 1 from public.workout_days wd
      join public.workout_plans wp on wp.id = wd.workout_plan_id
      where wd.id = exercises.workout_day_id
        and (wp.member_id = auth.uid() or wp.coach_id = auth.uid())
    )
  );

create policy "exercises_write_coach"
  on public.exercises for all
  using (
    exists (
      select 1 from public.workout_days wd
      join public.workout_plans wp on wp.id = wd.workout_plan_id
      where wd.id = exercises.workout_day_id and wp.coach_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workout_days wd
      join public.workout_plans wp on wp.id = wd.workout_plan_id
      where wd.id = exercises.workout_day_id and wp.coach_id = auth.uid()
    )
  );

-- workout_completions: a member's record of doing (or missing) a workout day.
-- effort_score is the coach-assigned RPE (1-10), set after review, not wearable-derived.
create table public.workout_completions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles (id) on delete cascade,
  workout_day_id uuid not null references public.workout_days (id) on delete cascade,
  status text not null default 'completed' check (status in ('completed', 'missed')),
  effort_score int check (effort_score between 1 and 10),
  scored_by uuid references public.profiles (id) on delete set null,
  completed_at timestamptz not null default now()
);

comment on column public.workout_completions.effort_score is 'Coach-assigned RPE (1-10), not wearable-derived.';

alter table public.workout_completions enable row level security;

create policy "workout_completions_select_owner"
  on public.workout_completions for select
  using (
    member_id = auth.uid()
    or exists (
      select 1 from public.workout_days wd
      join public.workout_plans wp on wp.id = wd.workout_plan_id
      where wd.id = workout_completions.workout_day_id and wp.coach_id = auth.uid()
    )
  );

create policy "workout_completions_insert_member"
  on public.workout_completions for insert
  with check (member_id = auth.uid());

create policy "workout_completions_update_member_or_coach"
  on public.workout_completions for update
  using (
    member_id = auth.uid()
    or exists (
      select 1 from public.workout_days wd
      join public.workout_plans wp on wp.id = wd.workout_plan_id
      where wd.id = workout_completions.workout_day_id and wp.coach_id = auth.uid()
    )
  )
  with check (
    member_id = auth.uid()
    or exists (
      select 1 from public.workout_days wd
      join public.workout_plans wp on wp.id = wd.workout_plan_id
      where wd.id = workout_completions.workout_day_id and wp.coach_id = auth.uid()
    )
  );

-- exercise_completions: per-exercise checkmarks within a workout_completion.
create table public.exercise_completions (
  id uuid primary key default gen_random_uuid(),
  workout_completion_id uuid not null references public.workout_completions (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique (workout_completion_id, exercise_id)
);

alter table public.exercise_completions enable row level security;

create policy "exercise_completions_owner"
  on public.exercise_completions for all
  using (
    exists (
      select 1 from public.workout_completions wc
      where wc.id = exercise_completions.workout_completion_id and wc.member_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workout_completions wc
      where wc.id = exercise_completions.workout_completion_id and wc.member_id = auth.uid()
    )
  );

-- milestones: tiered reward moments (first day, 7-day streak, 30-day streak, ...).
create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles (id) on delete cascade,
  tier text not null check (tier in ('first_day', 'seven_day_streak', 'thirty_day_streak')),
  achieved_at timestamptz not null default now(),
  unique (member_id, tier)
);

alter table public.milestones enable row level security;

create policy "milestones_select_owner_or_coach"
  on public.milestones for select
  using (
    member_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = milestones.member_id and p.coach_id = auth.uid()
    )
  );

create policy "milestones_insert_member"
  on public.milestones for insert
  with check (member_id = auth.uid());

-- member_workout_stats: streak/score computed live from workout_completions,
-- never persisted as a maintained counter column. security_invoker so the
-- view is subject to the querying user's RLS on profiles/workout_completions
-- instead of the view owner's.
create view public.member_workout_stats
  with (security_invoker = true) as
with completion_dates as (
  select member_id, (completed_at at time zone 'utc')::date as completion_date
  from public.workout_completions
  where status = 'completed'
  group by member_id, (completed_at at time zone 'utc')::date
),
islands as (
  select
    member_id,
    completion_date,
    completion_date - (row_number() over (partition by member_id order by completion_date))::int as island
  from completion_dates
),
streaks as (
  select member_id, max(completion_date) as streak_end, count(*) as streak_length
  from islands
  group by member_id, island
),
latest_streak as (
  select distinct on (member_id) member_id, streak_end, streak_length
  from streaks
  order by member_id, streak_end desc
),
totals as (
  select
    member_id,
    count(*) filter (where status = 'completed') as completed_count,
    count(*) filter (where status = 'missed') as missed_count,
    coalesce(sum(effort_score) filter (where status = 'completed'), 0) as total_effort_score,
    round(avg(effort_score) filter (where status = 'completed'), 2) as avg_effort_score
  from public.workout_completions
  group by member_id
)
select
  p.id as member_id,
  coalesce(t.completed_count, 0) as completed_count,
  coalesce(t.missed_count, 0) as missed_count,
  coalesce(t.total_effort_score, 0) as total_effort_score,
  t.avg_effort_score,
  case
    when ls.streak_end is not null and ls.streak_end >= (current_date - interval '1 day')
      then ls.streak_length
    else 0
  end as current_streak
from public.profiles p
left join totals t on t.member_id = p.id
left join latest_streak ls on ls.member_id = p.id
where p.role = 'member';
