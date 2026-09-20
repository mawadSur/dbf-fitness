-- Community: member-to-member blocks and a narrow roster window.
--
-- user_blocks: a member hides another member from their own community views.
-- Only the blocker can see or manage their rows, so the blocked party never
-- learns they were blocked. Rows are never updated — block or unblock only.
create table public.user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- The unique constraint already indexes blocker_id lookups; this covers the
-- reverse direction ("who blocked me") that get_group_roster evaluates.
create index user_blocks_blocked_id_idx on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

create policy "user_blocks_select_blocker"
  on public.user_blocks for select
  using (blocker_id = auth.uid());

create policy "user_blocks_insert_blocker"
  on public.user_blocks for insert
  with check (blocker_id = auth.uid());

create policy "user_blocks_delete_blocker"
  on public.user_blocks for delete
  using (blocker_id = auth.uid());

-- get_group_roster: fellow members of a group, for the "people you train with"
-- list. profiles RLS is self-or-coach, so members cannot read each other's
-- profiles directly; this function is the deliberate narrow window and exposes
-- ONLY id + full_name.
--
-- Returns zero rows (never an error) when:
--   * auth.uid() is null (anon),
--   * the caller is not a member of p_group_id (strangers learn nothing about
--     the group, including whether it exists).
-- Excludes the caller, anyone the caller blocked, and anyone who blocked the
-- caller. The blocking is symmetric on purpose: the blocked party must not
-- learn they were blocked, they just stop seeing the blocker.
--
-- EXECUTE is granted to anon as well as authenticated and the body is a no-op
-- for anon — revoking it from anon crashes Postgres 17.6 (SIGSEGV) instead of
-- raising permission-denied; see 20260919120000_fix_rls_infinite_recursion.sql.
create or replace function public.get_group_roster(p_group_id uuid)
returns table (member_id uuid, full_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name
  from public.group_members gm
  join public.profiles p on p.id = gm.member_id
  where auth.uid() is not null
    and gm.group_id = p_group_id
    and public.is_fellow_group_member(p_group_id)
    and gm.member_id <> auth.uid()
    and not exists (
      select 1
      from public.user_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = gm.member_id)
         or (b.blocker_id = gm.member_id and b.blocked_id = auth.uid())
    )
  order by p.full_name;
$$;

revoke all on function public.get_group_roster(uuid) from public;
grant execute on function public.get_group_roster(uuid) to anon, authenticated;
