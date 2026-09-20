-- Extensions
create extension if not exists pgcrypto with schema extensions;

-- profiles: one row per auth user, extends auth.users with app-level fields.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'coach', 'admin')),
  coach_id uuid references public.profiles (id) on delete set null,
  full_name text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'App-level profile for each authenticated user; coach_id links a member to their assigned coach.';

alter table public.profiles enable row level security;

create policy "profiles_select_self_or_coach"
  on public.profiles for select
  using (id = auth.uid() or coach_id = auth.uid());

create policy "profiles_insert_self"
  on public.profiles for insert
  with check (id = auth.uid());

create policy "profiles_update_self"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());
