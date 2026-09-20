-- diet_plans: a coach-authored nutrition plan, reusable across members via assignments.
create table public.diet_plans (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  description text,
  created_at timestamptz not null default now()
);

alter table public.diet_plans enable row level security;

create policy "diet_plans_write_coach"
  on public.diet_plans for all
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

-- diet_items: checkable items within a diet plan (e.g. "3 eggs + oats").
create table public.diet_items (
  id uuid primary key default gen_random_uuid(),
  diet_plan_id uuid not null references public.diet_plans (id) on delete cascade,
  name text not null,
  description text,
  order_index int not null,
  created_at timestamptz not null default now()
);

alter table public.diet_items enable row level security;

create policy "diet_items_write_coach"
  on public.diet_items for all
  using (
    exists (
      select 1 from public.diet_plans dp
      where dp.id = diet_items.diet_plan_id and dp.coach_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.diet_plans dp
      where dp.id = diet_items.diet_plan_id and dp.coach_id = auth.uid()
    )
  );

-- diet_plan_assignments: which members a diet plan is currently assigned to.
create table public.diet_plan_assignments (
  id uuid primary key default gen_random_uuid(),
  diet_plan_id uuid not null references public.diet_plans (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unique (diet_plan_id, member_id)
);

alter table public.diet_plan_assignments enable row level security;

create policy "diet_plan_assignments_select_owner"
  on public.diet_plan_assignments for select
  using (
    member_id = auth.uid()
    or exists (
      select 1 from public.diet_plans dp
      where dp.id = diet_plan_assignments.diet_plan_id and dp.coach_id = auth.uid()
    )
  );

create policy "diet_plan_assignments_write_coach"
  on public.diet_plan_assignments for all
  using (
    exists (
      select 1 from public.diet_plans dp
      where dp.id = diet_plan_assignments.diet_plan_id and dp.coach_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.diet_plans dp
      where dp.id = diet_plan_assignments.diet_plan_id and dp.coach_id = auth.uid()
    )
  );

-- Now that diet_plan_assignments exists, add the member-visibility policies
-- for diet_plans and diet_items that depend on it.
create policy "diet_plans_select_owner_or_assigned"
  on public.diet_plans for select
  using (
    coach_id = auth.uid()
    or exists (
      select 1 from public.diet_plan_assignments dpa
      where dpa.diet_plan_id = diet_plans.id and dpa.member_id = auth.uid()
    )
  );

create policy "diet_items_select_owner_or_assigned"
  on public.diet_items for select
  using (
    exists (
      select 1 from public.diet_plans dp
      where dp.id = diet_items.diet_plan_id
        and (
          dp.coach_id = auth.uid()
          or exists (
            select 1 from public.diet_plan_assignments dpa
            where dpa.diet_plan_id = dp.id and dpa.member_id = auth.uid()
          )
        )
    )
  );

-- diet_checkins: a member marking a diet item done on a given date.
create table public.diet_checkins (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles (id) on delete cascade,
  diet_item_id uuid not null references public.diet_items (id) on delete cascade,
  checkin_date date not null default current_date,
  checked_at timestamptz not null default now(),
  unique (member_id, diet_item_id, checkin_date)
);

alter table public.diet_checkins enable row level security;

create policy "diet_checkins_select_owner_or_coach"
  on public.diet_checkins for select
  using (
    member_id = auth.uid()
    or exists (
      select 1 from public.diet_items di
      join public.diet_plans dp on dp.id = di.diet_plan_id
      where di.id = diet_checkins.diet_item_id and dp.coach_id = auth.uid()
    )
  );

create policy "diet_checkins_write_member"
  on public.diet_checkins for all
  using (member_id = auth.uid())
  with check (member_id = auth.uid());
