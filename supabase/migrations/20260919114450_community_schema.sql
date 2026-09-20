-- groups: minimal community grouping ("people you train with"), not a general social feed.
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.groups enable row level security;

create policy "groups_select_authenticated"
  on public.groups for select
  using (auth.uid() is not null);

create policy "groups_insert_authenticated"
  on public.groups for insert
  with check (created_by = auth.uid());

create policy "groups_update_owner"
  on public.groups for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy "groups_delete_owner"
  on public.groups for delete
  using (created_by = auth.uid());

-- group_members: roster of a group; visible to fellow members only.
create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (group_id, member_id)
);

alter table public.group_members enable row level security;

create policy "group_members_select_fellow_member"
  on public.group_members for select
  using (
    member_id = auth.uid()
    or exists (
      select 1 from public.group_members gm
      where gm.group_id = group_members.group_id and gm.member_id = auth.uid()
    )
  );

create policy "group_members_insert_self"
  on public.group_members for insert
  with check (member_id = auth.uid());

create policy "group_members_delete_self"
  on public.group_members for delete
  using (member_id = auth.uid());

-- moderation_reports: minimal report/block safety mechanism for community features.
create table public.moderation_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reported_user_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed', 'actioned')),
  created_at timestamptz not null default now()
);

alter table public.moderation_reports enable row level security;

create policy "moderation_reports_select_reporter_or_moderator"
  on public.moderation_reports for select
  using (
    reporter_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('coach', 'admin')
    )
  );

create policy "moderation_reports_insert_reporter"
  on public.moderation_reports for insert
  with check (reporter_id = auth.uid());

create policy "moderation_reports_update_moderator"
  on public.moderation_reports for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('coach', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('coach', 'admin')
    )
  );
