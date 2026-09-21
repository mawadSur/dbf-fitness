-- ============================================================================
-- 20260921130000_admin_payments.sql
--
-- Payments happen OUTSIDE the app (no IAP, no provider webhook yet): an ADMIN
-- marks a member paid. `public.subscriptions` stays service-write-only -- this
-- migration does NOT add client write policies to it. Instead it adds:
--
--   * public.subscription_events  -- append-only billing ledger (who/what/when)
--   * public.admin_mark_paid(...)        -- absolute period end, idempotent
--   * public.admin_cancel_subscription() -- access continues to period end
--   * public.admin_list_subscriptions()  -- keyset list for the owner screen
--
-- Every RPC is SECURITY DEFINER and gates INSIDE THE BODY (see the project
-- rule: never REVOKE EXECUTE from anon/authenticated on this Postgres -- a role
-- calling a SECURITY DEFINER function it lacks EXECUTE on segfaults the
-- backend). So: `revoke all ... from public` + explicit grants, and the body
-- raises 42501 for everyone who is not an admin.
--
-- MFA (interim rule, deliberate): the admin RPCs require aal2 ONLY when the
-- calling admin actually has a VERIFIED TOTP factor. Admins provisioned by SQL
-- (the only way an admin exists today) have no factor and would otherwise be
-- permanently locked out of their own product. When no factor is enrolled the
-- call proceeds and emits a NOTICE. Once enrolment ships, flip
-- public.admin_mfa_required() to return true to make aal2 mandatory.
--
-- Backward compatibility: nothing existing is dropped or narrowed. Old clients
-- never touched subscriptions or these functions.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. subscription_events -- append-only billing ledger
-- ---------------------------------------------------------------------------

create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('mark_paid', 'cancel', 'webhook', 'system')),
  previous_status text,
  new_status text,
  previous_period_end timestamptz,
  new_period_end timestamptz,
  amount_cents integer,
  currency text,
  note text,
  created_at timestamptz not null default now()
);

-- Bounds live in named constraints so a later migration can retune them.
alter table public.subscription_events
  drop constraint if exists subscription_events_amount_bounds;
alter table public.subscription_events
  add constraint subscription_events_amount_bounds check (
    amount_cents is null or (amount_cents >= 0 and amount_cents <= 100000000)
  );

alter table public.subscription_events
  drop constraint if exists subscription_events_currency_format;
alter table public.subscription_events
  add constraint subscription_events_currency_format check (
    currency is null or currency ~ '^[A-Z]{3}$'
  );

alter table public.subscription_events
  drop constraint if exists subscription_events_text_bounds;
alter table public.subscription_events
  add constraint subscription_events_text_bounds check (
    (note is null or length(note) <= 2000)
    and (previous_status is null or length(previous_status) <= 40)
    and (new_status is null or length(new_status) <= 40)
  );

comment on table public.subscription_events is
  'Append-only ledger of every billing state change (admin mark-paid, cancel, future webhook). Immutable: a trigger rejects UPDATE and DELETE for every role, including postgres.';
comment on column public.subscription_events.actor_id is
  'The admin who performed the action; null for system/webhook events or after the admin profile is deleted.';

create index if not exists subscription_events_member_created_idx
  on public.subscription_events (member_id, created_at desc);
create index if not exists subscription_events_kind_created_idx
  on public.subscription_events (kind, created_at desc);
-- Supports the "already applied?" probe in admin_mark_paid without a seq scan.
create index if not exists subscription_events_member_kind_newend_idx
  on public.subscription_events (member_id, kind, new_period_end);

alter table public.subscription_events enable row level security;

-- Admins read everything; a member reads their own billing history. There is
-- deliberately NO insert/update/delete policy: only SECURITY DEFINER RPCs and
-- service_role (which bypasses RLS) ever write here.
drop policy if exists "subscription_events_select_self_or_admin" on public.subscription_events;
create policy "subscription_events_select_self_or_admin"
  on public.subscription_events for select
  to authenticated
  using (
    member_id = (select auth.uid())
    or (select public.is_admin())
  );

-- Append-only for EVERY role, RLS-bypassing ones included (postgres and
-- service_role too). A ledger the service key can rewrite is not a ledger.
--
-- The ONLY writes allowed through are the referential-integrity cleanups that
-- account deletion depends on (`delete from auth.users` -> profiles -> here):
--   * DELETE  when the member profile is already gone (member_id cascade);
--   * UPDATE  that only nulls actor_id when the actor profile is already gone
--             (actor_id set null).
-- Both are recognised by the parent row having disappeared, which an ordinary
-- caller cannot fake: the FK would reject any other value anyway.
create or replace function public.subscription_events_append_only()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.profiles p where p.id = old.member_id) then
      return old;
    end if;
  elsif tg_op = 'UPDATE' then
    if old.actor_id is not null
       and new.actor_id is null
       and not exists (select 1 from public.profiles p where p.id = old.actor_id)
       and new.id = old.id
       and new.member_id = old.member_id
       and new.kind = old.kind
       and new.created_at = old.created_at
       and new.previous_status is not distinct from old.previous_status
       and new.new_status is not distinct from old.new_status
       and new.previous_period_end is not distinct from old.previous_period_end
       and new.new_period_end is not distinct from old.new_period_end
       and new.amount_cents is not distinct from old.amount_cents
       and new.currency is not distinct from old.currency
       and new.note is not distinct from old.note
    then
      return new;
    end if;
  end if;

  raise exception using
    errcode = '42501',
    message = 'subscription_events_append_only',
    detail  = format('%s on public.subscription_events is not permitted; the ledger is append-only.', tg_op);
end;
$$;

comment on function public.subscription_events_append_only() is
  'Trigger guard making public.subscription_events append-only for all roles (42501 subscription_events_append_only). Only FK cleanup from profile deletion (member cascade / actor set null) is let through.';

revoke all on function public.subscription_events_append_only() from public;

drop trigger if exists subscription_events_append_only on public.subscription_events;
create trigger subscription_events_append_only
  before update or delete on public.subscription_events
  for each row execute function public.subscription_events_append_only();

-- ---------------------------------------------------------------------------
-- 2. The admin gate (shared by every admin RPC in this wave)
-- ---------------------------------------------------------------------------

-- Single switch for the interim MFA rule. Returns false today: aal2 is demanded
-- only from admins who actually enrolled TOTP. Flip to `select true` once admin
-- enrolment ships to make step-up mandatory for all admins.
create or replace function public.admin_mfa_required()
returns boolean
language sql
immutable
as $$ select false $$;

comment on function public.admin_mfa_required() is
  'Interim MFA policy switch for the admin RPCs. false => aal2 is required only from admins with a verified TOTP factor (SQL-provisioned admins cannot lock themselves out). Change to true when admin TOTP enrolment ships.';

revoke all on function public.admin_mfa_required() from public;
grant execute on function public.admin_mfa_required() to anon, authenticated;

-- Returns the admin's uuid (null for a trusted backend role). Raises 42501
-- otherwise, so every caller of an admin RPC is gated INSIDE the body -- never
-- by an EXECUTE revoke (see the header).
create or replace function public.assert_admin_caller()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  -- Inside SECURITY DEFINER current_user is the owner, so identify the CALLER
  -- the way 20260919140000 / 20260919150000 do.
  v_privileged boolean := coalesce(nullif(current_setting('role', true), 'none'), session_user)
                            in ('postgres', 'supabase_admin', 'service_role');
  v_claims jsonb;
  v_aal text;
  v_has_totp boolean;
begin
  -- Trusted backend caller with no end user attached (migrations, the future
  -- payment webhook running as service_role).
  if v_privileged and v_caller is null then
    return null;
  end if;

  if v_caller is null or not public.is_admin(v_caller) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;

  select exists (
    select 1 from auth.mfa_factors f
    where f.user_id = v_caller
      and f.factor_type = 'totp'
      and f.status = 'verified'
  ) into v_has_totp;

  if v_has_totp or public.admin_mfa_required() then
    begin
      v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    exception when others then
      v_claims := null;
    end;
    v_aal := coalesce(v_claims ->> 'aal', nullif(current_setting('request.jwt.claim.aal', true), ''));
    if v_aal is distinct from 'aal2' then
      raise exception using errcode = '42501', message = 'mfa_required';
    end if;
  else
    raise notice 'admin % has no verified TOTP factor; proceeding at aal1 (interim rule, see admin_mfa_required()).', v_caller;
  end if;

  return v_caller;
end;
$$;

comment on function public.assert_admin_caller() is
  'In-body gate for the admin RPCs. Returns the admin uuid, or null for postgres/supabase_admin/service_role with no end user. 42501 admin_required for everyone else; 42501 mfa_required when the admin has a verified TOTP factor (or admin_mfa_required() is true) but the JWT is not aal2.';

revoke all on function public.assert_admin_caller() from public;
grant execute on function public.assert_admin_caller() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. admin_mark_paid -- the whole payments story for v1
-- ---------------------------------------------------------------------------

-- ABSOLUTE period end, never "+1 month": the admin types the date the member is
-- paid until, so a double submit cannot silently buy two months.
--
-- Errors (all raised, so PostgREST surfaces code + message to the client):
--   42501 admin_required / mfa_required
--   P0002 member_not_found
--   40001 stale_subscription     (p_expected_previous_end did not match)
--   22023 period_backwards       (new end < current end, without p_allow_backwards)
--   22023 period_out_of_bounds    (<= 2020-01-01 or > now() + 400 days)
--
-- Idempotency is checked BEFORE the expected-previous-end check on purpose: a
-- client retrying after a lost response still sends the OLD expected end, and
-- must get applied=false rather than a spurious 40001.
create or replace function public.admin_mark_paid(
  p_member uuid,
  p_new_period_end timestamptz,
  p_note text default null,
  p_amount_cents integer default null,
  p_currency text default null,
  p_expected_previous_end timestamptz default null,
  p_allow_backwards boolean default false
)
returns table (subscription_id uuid, event_id uuid, applied boolean)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.assert_admin_caller();
  v_prev_status text;
  v_prev_end timestamptz;
  v_sub_id uuid;
  v_event_id uuid;
begin
  if p_member is null or p_new_period_end is null then
    raise exception using errcode = '22023', message = 'member_and_period_end_required';
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_member) then
    raise exception using errcode = 'P0002', message = 'member_not_found';
  end if;

  if p_new_period_end <= timestamptz '2020-01-01 00:00:00+00'
     or p_new_period_end > now() + interval '400 days' then
    raise exception using errcode = '22023', message = 'period_out_of_bounds';
  end if;

  if p_currency is not null and p_currency !~ '^[A-Z]{3}$' then
    raise exception using errcode = '22023', message = 'invalid_currency';
  end if;

  if p_amount_cents is not null and (p_amount_cents < 0 or p_amount_cents > 100000000) then
    raise exception using errcode = '22023', message = 'invalid_amount';
  end if;

  -- Serialise concurrent admins on the same member so the read-then-write below
  -- cannot interleave into two ledger rows for one payment.
  perform pg_advisory_xact_lock(hashtext('public.admin_mark_paid'), hashtext(p_member::text));

  select s.id, s.status, s.current_period_end
    into v_sub_id, v_prev_status, v_prev_end
    from public.subscriptions s
   where s.member_id = p_member
   for update;

  -- Already applied: same absolute end, already active, and a matching ledger
  -- row exists. Return the original event so the caller can link to it.
  if v_sub_id is not null
     and v_prev_end = p_new_period_end
     and v_prev_status = 'active' then
    select e.id into v_event_id
      from public.subscription_events e
     where e.member_id = p_member
       and e.kind = 'mark_paid'
       and e.new_period_end = p_new_period_end
     order by e.created_at desc
     limit 1;

    if v_event_id is not null then
      subscription_id := v_sub_id;
      event_id := v_event_id;
      applied := false;
      return next;
      return;
    end if;
  end if;

  if p_expected_previous_end is not null
     and v_prev_end is distinct from p_expected_previous_end then
    raise exception using errcode = '40001', message = 'stale_subscription';
  end if;

  if v_prev_end is not null and p_new_period_end < v_prev_end and not p_allow_backwards then
    raise exception using errcode = '22023', message = 'period_backwards';
  end if;

  insert into public.subscriptions as s
    (member_id, status, current_period_end, cancel_at_period_end, provider)
  values
    (p_member, 'active', p_new_period_end, false, 'manual')
  on conflict (member_id) do update
    set status               = 'active',
        current_period_end   = excluded.current_period_end,
        cancel_at_period_end = false,
        provider             = 'manual'
  returning s.id into v_sub_id;

  insert into public.subscription_events
    (member_id, actor_id, kind, previous_status, new_status,
     previous_period_end, new_period_end, amount_cents, currency, note)
  values
    (p_member, v_actor, 'mark_paid', v_prev_status, 'active',
     v_prev_end, p_new_period_end, p_amount_cents, p_currency, left(p_note, 2000))
  returning id into v_event_id;

  subscription_id := v_sub_id;
  event_id := v_event_id;
  applied := true;
  return next;
end;
$$;

comment on function public.admin_mark_paid(uuid, timestamptz, text, integer, text, timestamptz, boolean) is
  'Admin-only: record an out-of-app payment by setting subscriptions.current_period_end to an ABSOLUTE date and appending a mark_paid ledger row. Idempotent on (member, new end) -> applied=false. Errors: 42501 admin_required/mfa_required, P0002 member_not_found, 40001 stale_subscription, 22023 period_backwards / period_out_of_bounds / invalid_currency / invalid_amount.';

revoke all on function public.admin_mark_paid(uuid, timestamptz, text, integer, text, timestamptz, boolean) from public;
grant execute on function public.admin_mark_paid(uuid, timestamptz, text, integer, text, timestamptz, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. admin_cancel_subscription
-- ---------------------------------------------------------------------------

-- Cancelling never revokes access retroactively: current_period_end is left
-- alone, so the member keeps live access until it passes. Per the canonical
-- spec a 'canceled' subscription then gets NO grace period.
create or replace function public.admin_cancel_subscription(
  p_member uuid,
  p_note text default null
)
returns table (subscription_id uuid, event_id uuid, applied boolean)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.assert_admin_caller();
  v_prev_status text;
  v_prev_end timestamptz;
  v_sub_id uuid;
  v_event_id uuid;
begin
  if p_member is null then
    raise exception using errcode = '22023', message = 'member_required';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.admin_mark_paid'), hashtext(p_member::text));

  select s.id, s.status, s.current_period_end
    into v_sub_id, v_prev_status, v_prev_end
    from public.subscriptions s
   where s.member_id = p_member
   for update;

  if v_sub_id is null then
    raise exception using errcode = 'P0002', message = 'subscription_not_found';
  end if;

  if v_prev_status = 'canceled' then
    select e.id into v_event_id
      from public.subscription_events e
     where e.member_id = p_member and e.kind = 'cancel'
     order by e.created_at desc
     limit 1;
    subscription_id := v_sub_id;
    event_id := v_event_id;
    applied := false;
    return next;
    return;
  end if;

  update public.subscriptions s
     set status = 'canceled',
         cancel_at_period_end = true
   where s.id = v_sub_id;

  insert into public.subscription_events
    (member_id, actor_id, kind, previous_status, new_status,
     previous_period_end, new_period_end, note)
  values
    (p_member, v_actor, 'cancel', v_prev_status, 'canceled',
     v_prev_end, v_prev_end, left(p_note, 2000))
  returning id into v_event_id;

  subscription_id := v_sub_id;
  event_id := v_event_id;
  applied := true;
  return next;
end;
$$;

comment on function public.admin_cancel_subscription(uuid, text) is
  'Admin-only: mark a subscription canceled. current_period_end is untouched, so access continues until it passes (and a canceled sub gets no grace). Idempotent -> applied=false. Errors: 42501 admin_required/mfa_required, P0002 subscription_not_found.';

revoke all on function public.admin_cancel_subscription(uuid, text) from public;
grant execute on function public.admin_cancel_subscription(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. admin_list_subscriptions -- keyset list for the future owner screen
-- ---------------------------------------------------------------------------

-- The computed state is NOT re-derived here: it comes from
-- public.subscription_state_row(), the single source of truth for the grace
-- rules (20260919150000). Members with no subscription row are included with
-- state 'none' -- they are exactly who the owner needs to chase.
create or replace function public.admin_list_subscriptions(
  p_state text default null,
  p_after_member uuid default null,
  p_limit integer default 50
)
returns table (
  member_id uuid,
  full_name text,
  coach_id uuid,
  coach_name text,
  status text,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  provider text,
  state text,
  days_overdue integer,
  grace_days_left integer,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  perform public.assert_admin_caller();

  if p_state is not null and p_state not in ('none', 'active', 'grace', 'expired', 'staff') then
    raise exception using errcode = '22023', message = 'invalid_state_filter';
  end if;

  return query
  select m.id,
         m.full_name,
         m.coach_id,
         c.full_name,
         s.status,
         s.current_period_end,
         s.cancel_at_period_end,
         s.provider,
         st.state,
         st.days_overdue,
         st.grace_days_left,
         s.updated_at
    from public.profiles m
    left join public.profiles c on c.id = m.coach_id
    left join public.subscriptions s on s.member_id = m.id
    cross join lateral public.subscription_state_row(m.id) st
   where m.role = 'member'
     and (p_after_member is null or m.id > p_after_member)
     and (p_state is null or st.state = p_state)
   order by m.id
   limit v_limit;
end;
$$;

comment on function public.admin_list_subscriptions(text, uuid, integer) is
  'Admin-only keyset page (cursor = p_after_member, ordered by member id) of every member with their coach and their computed subscription state from subscription_state_row(). p_limit is clamped to 1..200. Errors: 42501 admin_required/mfa_required, 22023 invalid_state_filter.';

revoke all on function public.admin_list_subscriptions(text, uuid, integer) from public;
grant execute on function public.admin_list_subscriptions(text, uuid, integer) to anon, authenticated;
