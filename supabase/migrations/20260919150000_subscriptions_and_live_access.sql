-- Subscription entitlement for live classes, with a 10-day grace period for late payers.
--
-- Product rule (non-negotiable, from the product owner):
--   Live classes are for SUBSCRIBED members only. A member whose payment is late keeps access for
--   10 more days (and is nagged about it when they join the call). After that, or with no
--   subscription at all, joining is blocked. Coaches and admins ("staff") are exempt.
--
-- Where the rule is enforced (defence in depth; layer 3 is the one that actually gates video):
--   1. live_class_participants INSERT/UPDATE policies  -> can_join_live_class()
--   2. realtime.messages policies via can_use_live_class_presence_topic() -> can_join_live_class()
--   3. the agora-rtc-token Edge Function (no token, no video)
--   4. the live-class-reminder Edge Function (no "starting soon" push for the non-entitled)
--   5. the UI (gating + grace reminders)
--
-- The state machine is computed in SQL only; the client is never trusted with it.
--   none    - no subscriptions row.
--   staff   - the profile's role is 'coach' or 'admin' (exempt, no row needed).
--   active  - now() <= current_period_end, whatever the status. A 'canceled' subscription keeps
--             access until the period it was already paid for runs out.
--   grace   - now() > current_period_end
--             AND now() <= current_period_end + subscription_grace_days()
--             AND status in ('active','past_due')  <- i.e. the payment is LATE, not cancelled.
--             The upper boundary is INCLUSIVE: exactly period_end + 10 days is still grace, one
--             second later is 'expired'. A 'canceled' subscription gets NO grace.
--   expired - has a row but matches none of the above.
--
-- FUNCTION PRIVILEGES — read before changing any `revoke` line in this file:
--   Every function below is reachable from an RLS expression and/or over PostgREST, and each one
--   does `revoke all ... from public` ONLY. EXECUTE deliberately stays with anon/authenticated
--   (Supabase's default privileges grant it at CREATE time). Revoking EXECUTE from anon while an
--   RLS policy can still reach the function does NOT degrade gracefully on this Postgres 17.6
--   build: it segfaults the backend (signal 11) instead of raising permission denied. See the long
--   notes in 20260919120000_fix_rls_infinite_recursion.sql and
--   20260919140000_realtime_presence_authorization.sql. The security boundary is therefore the
--   gate INSIDE each body (auth.uid() is NULL for anon, so anon gets 'none'/false), never the ACL.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------------

-- One row per member. Written ONLY by service_role/postgres (the payment-provider webhook, which
-- lands later): there is deliberately no INSERT/UPDATE/DELETE policy, so a member cannot grant
-- themselves access by writing their own row. service_role bypasses RLS entirely.
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null unique references public.profiles (id) on delete cascade,
  status text not null check (status in ('active', 'past_due', 'canceled')),
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  provider text not null default 'manual',
  provider_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.subscriptions is
  'Billing state per member; drives live-class entitlement. Client-readable (self / own coach), never client-writable.';
comment on column public.subscriptions.status is
  'Provider status. ''canceled'' keeps access until current_period_end but gets no grace period.';
comment on column public.subscriptions.current_period_end is
  'End of the paid period. Access continues for subscription_grace_days() days after this when the payment is merely late.';

alter table public.subscriptions enable row level security;

-- Keep updated_at honest for webhook upserts. Plain trigger function (not SECURITY DEFINER), so
-- there is no EXECUTE-grant hazard; mirrors push_tokens_touch_updated_at in the 130100 migration.
create function public.subscriptions_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger subscriptions_touch_updated_at
  before update on public.subscriptions
  for each row execute function public.subscriptions_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- The grace period, in days. THE single source of truth in SQL — no other statement in this
-- schema may hard-code 10. (The one TS counterpart is GRACE_DAYS in
-- supabase/functions/_shared/subscriptionState.ts, re-exported by src/features/subscriptions.)
create or replace function public.subscription_grace_days()
returns integer
language sql
immutable
as $$
  select 10;
$$;

comment on function public.subscription_grace_days() is
  'Days of continued live-class access after current_period_end when a payment is late. Single source of truth.';

revoke all on function public.subscription_grace_days() from public;
grant execute on function public.subscription_grace_days() to anon, authenticated;

-- True when the caller is the coach p_member is assigned to. SECURITY DEFINER so it can read the
-- member's profiles row without going through profiles' own RLS from inside another policy.
-- Relative to auth.uid(), so it leaks nothing a coach cannot already see.
create or replace function public.is_coach_of_member(p_member uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and exists (
       select 1
       from public.profiles p
       where p.id = p_member
         and p.coach_id = auth.uid()
     );
$$;

revoke all on function public.is_coach_of_member(uuid) from public;
grant execute on function public.is_coach_of_member(uuid) to anon, authenticated;

-- Members read their own subscription; a coach reads their own members'. No write policy at all.
create policy "subscriptions_select_self_or_coach"
  on public.subscriptions for select
  using (
    member_id = auth.uid()
    or public.is_coach_of_member(subscriptions.member_id)
  );

-- ---------------------------------------------------------------------------
-- State machine
-- ---------------------------------------------------------------------------

-- Computes the full subscription state for ONE member. Always returns exactly one row, never an
-- error, so every caller (RLS predicate, RPC, Edge Function) can treat it as a total function.
--
-- Visibility gate (in the body, not the ACL — see the header note): a caller may only learn about
--   * themselves,
--   * a member they coach,
--   * anyone, if the caller's own profile role is 'admin',
--   * anyone, if the caller is a privileged DB role (postgres / supabase_admin / service_role),
--     which is how the migration session and server-side jobs evaluate it.
-- Everyone else — including anon and a fellow group member who learned a uuid from the roster —
-- gets a plain 'none' row. Denial is indistinguishable from "no subscription", so nobody can
-- probe whether another member's payment is late.
--
-- current_period_end is echoed back for the UI ("renew by ..."); days_overdue / grace_days_left
-- are 0 outside the grace window on purpose, so the UI has nothing to render then.
create or replace function public.subscription_state_row(p_member uuid)
returns table (
  state text,
  current_period_end timestamptz,
  days_overdue integer,
  grace_days_left integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  -- Inside SECURITY DEFINER current_user is always the owner, so identify the CALLER the way
  -- 20260919140000 does: the `role` GUC that PostgREST / `set local role` sets, else session_user.
  v_privileged boolean := coalesce(nullif(current_setting('role', true), 'none'), session_user)
                            in ('postgres', 'supabase_admin', 'service_role');
  v_visible boolean;
  v_member_role text;
  v_status text;
  v_period_end timestamptz;
  v_grace interval := make_interval(days => public.subscription_grace_days());
  v_now timestamptz := now();
begin
  state := 'none';
  current_period_end := null;
  days_overdue := 0;
  grace_days_left := 0;

  if p_member is null then
    return next;
    return;
  end if;

  v_visible := v_privileged
    or (
      v_caller is not null
      and (
        v_caller = p_member
        or exists (
          select 1 from public.profiles p where p.id = p_member and p.coach_id = v_caller
        )
        or exists (
          select 1 from public.profiles p where p.id = v_caller and p.role = 'admin'
        )
      )
    );

  if not v_visible then
    return next;
    return;
  end if;

  select p.role into v_member_role from public.profiles p where p.id = p_member;

  select s.status, s.current_period_end
    into v_status, v_period_end
    from public.subscriptions s
   where s.member_id = p_member;

  current_period_end := v_period_end;

  -- Staff never need a subscription. Their period end (if a row happens to exist) is still echoed.
  if v_member_role in ('coach', 'admin') then
    state := 'staff';
    return next;
    return;
  end if;

  if v_period_end is null then
    return next; -- 'none'
    return;
  end if;

  if v_now <= v_period_end then
    state := 'active';
  elsif v_now <= v_period_end + v_grace and v_status in ('active', 'past_due') then
    state := 'grace';
    days_overdue := floor(extract(epoch from (v_now - v_period_end)) / 86400)::integer;
    grace_days_left := ceil(extract(epoch from ((v_period_end + v_grace) - v_now)) / 86400)::integer;
  else
    state := 'expired';
  end if;

  return next;
end;
$$;

comment on function public.subscription_state_row(uuid) is
  'Total function: one row of (state, current_period_end, days_overdue, grace_days_left) for a member, or a plain ''none'' row when the caller may not see it.';

revoke all on function public.subscription_state_row(uuid) from public;
grant execute on function public.subscription_state_row(uuid) to anon, authenticated;

-- The client-facing RPC: the caller's own state, one row, 'none' for anon.
create or replace function public.get_subscription_state()
returns table (
  state text,
  current_period_end timestamptz,
  days_overdue integer,
  grace_days_left integer
)
language sql
stable
security definer
set search_path = public
as $$
  select * from public.subscription_state_row(auth.uid());
$$;

comment on function public.get_subscription_state() is
  'Subscription state of the calling user (auth.uid()); returns a ''none'' row for anon.';

revoke all on function public.get_subscription_state() from public;
grant execute on function public.get_subscription_state() to anon, authenticated;

-- ACCESS = state in (active, grace, staff).
create or replace function public.has_live_access(p_member uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select s.state from public.subscription_state_row(p_member) s) in ('active', 'grace', 'staff'),
    false
  );
$$;

comment on function public.has_live_access(uuid) is
  'True when the member may join live classes (active, within grace, or staff). Subject to the same visibility gate as subscription_state_row.';

revoke all on function public.has_live_access(uuid) from public;
grant execute on function public.has_live_access(uuid) to anon, authenticated;

-- May the CALLER join this class? Coach of the class, or one of that coach's members with live
-- access. Deliberately does NOT look at live_classes.status: an ended/cancelled class is a
-- different failure (409 from the token function) than "you are not allowed here", and the
-- presence/participant policies want the entitlement question on its own.
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
        lc.coach_id = auth.uid()
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
  'True when auth.uid() is the class coach, or a member of that coach who currently has live access. Ignores class status by design.';

revoke all on function public.can_join_live_class(uuid) from public;
grant execute on function public.can_join_live_class(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Enforcement layer 1: live_class_participants
-- ---------------------------------------------------------------------------

-- Was a single FOR ALL policy keyed only on member_id = auth.uid(), which let any signed-in user
-- insert an attendance row for any class. Split so that getting IN requires entitlement while
-- getting OUT never does: a member whose grace ran out mid-session must still be able to remove
-- their row. The SELECT policy (self or the class's coach) is untouched.
--
-- Known, accepted consequence: recordLeave() stamps left_at with an UPDATE, so a member who lapses
-- while in a call cannot stamp their own left_at. Their row simply keeps the stale left_at; the
-- coach's roster view is unaffected, and DELETE remains open to them.
drop policy if exists "live_class_participants_write_self" on public.live_class_participants;

create policy "live_class_participants_insert_entitled"
  on public.live_class_participants for insert
  with check (
    member_id = auth.uid()
    and public.can_join_live_class(live_class_participants.live_class_id)
  );

create policy "live_class_participants_update_entitled"
  on public.live_class_participants for update
  using (
    member_id = auth.uid()
    and public.can_join_live_class(live_class_participants.live_class_id)
  )
  with check (
    member_id = auth.uid()
    and public.can_join_live_class(live_class_participants.live_class_id)
  );

create policy "live_class_participants_delete_self"
  on public.live_class_participants for delete
  using (member_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Enforcement layer 2: the `live:<uuid>` Realtime presence topic
-- ---------------------------------------------------------------------------

-- Same signature, same name, same two realtime.messages policies (20260919140000) — only the
-- entitlement rule tightens: being one of the coach's members is no longer enough, the member must
-- also currently have live access. The group-topic helper and can_use_presence_topic() are
-- untouched, and Realtime still evaluates both the 'broadcast' and 'presence' extensions inside a
-- single authorization transaction, so this must keep returning a clean boolean (never raise) for
-- every topic string a hostile client can pick. presence_topic_uuid() already yields NULL rather
-- than raising 22P02 on a malformed topic, and can_join_live_class(NULL) is false.
create or replace function public.can_use_live_class_presence_topic(topic text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_join_live_class(public.presence_topic_uuid(topic, 'live:'));
$$;

comment on function public.can_use_live_class_presence_topic(text) is
  'Realtime authorization for live:<classId>: delegates to can_join_live_class, so a lapsed member is off the topic too.';

revoke all on function public.can_use_live_class_presence_topic(text) from public;
grant execute on function public.can_use_live_class_presence_topic(text) to anon, authenticated;
