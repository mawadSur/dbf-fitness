-- Fix infinite recursion in RLS policies for diet_plans, diet_plan_assignments,
-- diet_items, diet_checkins, and group_members.
--
-- Root cause:
--   1. diet_plans_select_owner_or_assigned (on diet_plans) subqueried
--      diet_plan_assignments, and diet_plan_assignments_select_owner (on
--      diet_plan_assignments) subqueried diet_plans right back — a direct
--      mutual cycle. Postgres re-evaluates each table's RLS policies on every
--      subquery hit, so this recurses forever and raises "infinite recursion
--      detected in policy for relation ...".
--   2. group_members_select_fellow_member (on group_members) subqueried
--      group_members itself with no escape hatch — every row lookup requires
--      re-evaluating the very policy that's being evaluated.
--   diet_items and diet_checkins were not themselves cyclic; their policies
--   only failed because they query diet_plans (and diet_plans recursed).
--   Fixing the two root policies resolves the cascade without touching them.
--
-- Fix: SECURITY DEFINER helper functions that internally bypass RLS (they run
-- as the function owner, not the querying role) replace the cross-table /
-- self-table subqueries inside the three broken policies. Scoping rules are
-- unchanged — coaches still see only their own plans/assignments, members
-- only what's assigned to them, and group members only fellow members of
-- groups they belong to.

set check_function_bodies = off;

-- Helper: true if the current user is the coach who owns the given diet plan.
-- SECURITY DEFINER bypasses RLS on diet_plans so diet_plan_assignments' policy
-- can call this without re-triggering diet_plans' own policy.
--
-- EXECUTE must be granted to anon as well as authenticated: this function is
-- invoked internally by an RLS USING expression, which every querying role
-- (including anon) must be able to evaluate. auth.uid() is NULL for anon, so
-- the function still correctly returns false for them — the security
-- boundary is auth.uid(), not the ability to call this predicate. Revoking
-- EXECUTE from anon while an anon-visible RLS policy still calls this
-- function does not degrade gracefully: it reproducibly crashes the Postgres
-- backend (SIGSEGV) the moment anon queries diet_plan_assignments, instead of
-- raising a clean permission-denied error. Confirmed via captured server
-- logs ("terminated by signal 11: Segmentation fault") and reproduced twice,
-- including from a freshly `supabase db reset` database, ruling out
-- corruption from a prior crash as the cause.
create or replace function public.is_coach_of_diet_plan(target_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.diet_plans dp
    where dp.id = target_plan_id
      and dp.coach_id = auth.uid()
  );
$$;

revoke all on function public.is_coach_of_diet_plan(uuid) from public;
grant execute on function public.is_coach_of_diet_plan(uuid) to anon, authenticated;

-- Helper: true if the current user is a member the given diet plan is
-- assigned to. SECURITY DEFINER bypasses RLS on diet_plan_assignments so
-- diet_plans' policy can call this without re-triggering diet_plan_assignments'
-- own policy.
--
-- EXECUTE must include anon — see is_coach_of_diet_plan above for why
-- revoking it crashes the backend instead of denying cleanly.
create or replace function public.is_member_of_diet_plan(target_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.diet_plan_assignments dpa
    where dpa.diet_plan_id = target_plan_id
      and dpa.member_id = auth.uid()
  );
$$;

revoke all on function public.is_member_of_diet_plan(uuid) from public;
grant execute on function public.is_member_of_diet_plan(uuid) to anon, authenticated;

-- Helper: true if the current user is a member of the given group.
-- SECURITY DEFINER bypasses RLS on group_members so this can be called from
-- group_members' own policy without self-recursing.
--
-- EXECUTE must include anon — see is_coach_of_diet_plan above for why
-- revoking it crashes the backend instead of denying cleanly.
create or replace function public.is_fellow_group_member(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = target_group_id
      and gm.member_id = auth.uid()
  );
$$;

revoke all on function public.is_fellow_group_member(uuid) from public;
grant execute on function public.is_fellow_group_member(uuid) to anon, authenticated;

-- diet_plans: replace the policy that queried diet_plan_assignments directly.
drop policy if exists "diet_plans_select_owner_or_assigned" on public.diet_plans;
create policy "diet_plans_select_owner_or_assigned"
  on public.diet_plans for select
  using (
    coach_id = auth.uid()
    or public.is_member_of_diet_plan(diet_plans.id)
  );

-- diet_plan_assignments: replace the policy that queried diet_plans directly.
drop policy if exists "diet_plan_assignments_select_owner" on public.diet_plan_assignments;
create policy "diet_plan_assignments_select_owner"
  on public.diet_plan_assignments for select
  using (
    member_id = auth.uid()
    or public.is_coach_of_diet_plan(diet_plan_assignments.diet_plan_id)
  );

-- group_members: replace the self-referencing policy with no escape hatch.
drop policy if exists "group_members_select_fellow_member" on public.group_members;
create policy "group_members_select_fellow_member"
  on public.group_members for select
  using (
    member_id = auth.uid()
    or public.is_fellow_group_member(group_members.group_id)
  );
