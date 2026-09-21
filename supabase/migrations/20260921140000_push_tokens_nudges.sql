-- Push foundations, part 1 of 3: Expo push-token lifecycle + the coach "nudge" ledger.
--
-- Part 2 (20260921141000_notification_outbox.sql) adds public.notification_outbox and
-- public.send_nudge(), which enqueues into it. send_nudge lives there, not here, because its
-- body references the outbox table; the nudges TABLE is here so the two files read as
-- "identity/lifecycle" then "delivery".
--
-- What this fixes in 20260919130100_push_tokens_and_reminders.sql:
--   * Direct inserts by clients are the only way to register a token, and the table's UNIQUE is
--     (user_id, expo_push_token). A shared/handed-down device therefore keeps the PREVIOUS
--     owner's row: after B signs in on A's phone, A's row still points at that device and A keeps
--     receiving pushes meant for a phone they no longer hold. register_push_token() REASSIGNS a
--     token to the caller instead (the token identifies the device, not the person).
--   * Nothing validated the token string, so a typo or a raw FCM id could sit in the table for
--     ever and be shipped to Expo on every run.
--   * Nothing could delete a token that Expo reported as DeviceNotRegistered; the drain needs a
--     service-only pruning entry point.
--
-- BACKWARD COMPATIBLE: the table, its RLS policies and its unique constraint are untouched, so an
-- old client that inserts/upserts directly keeps working exactly as before. The new RPCs are
-- additive.
--
-- SECURITY DEFINER pattern used throughout (see supabase/migrations/20260919120000 and
-- 20260919140000): `revoke all ... from public` ONLY — never `revoke execute from anon`, which
-- SIGSEGVs this Postgres 17.6 when a role calls a definer function it cannot execute — plus
-- `set search_path` and a gate INSIDE the body.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- Token format
-- ---------------------------------------------------------------------------

-- Expo delivers only to `ExponentPushToken[...]` / `ExpoPushToken[...]`. Anything else is a
-- client bug (a raw APNs/FCM id, an empty string, a JSON fragment) and would be rejected by the
-- push API on every single run, so it is refused at the door. IMMUTABLE + no table access, so it
-- is safe to use in a CHECK-style position later if we ever want one.
--
-- The bound is 200, not a larger round number: Postgres's regex engine rejects a repetition
-- count above 255 outright ("invalid repetition count(s)"), and a real Expo token's inner part is
-- ~22 characters, so 200 is generous while staying well inside the engine's limit.
create or replace function public.is_expo_push_token(p_token text)
returns boolean
language sql
immutable
as $$
  select p_token is not null
     and p_token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_+./%=-]{1,200}\]$';
$$;

comment on function public.is_expo_push_token(text) is
  'True when the string has the Expo push-token shape ExponentPushToken[...] / ExpoPushToken[...]. Used by register_push_token(); deliberately NOT a CHECK constraint on push_tokens so pre-existing rows and old direct-insert clients are not broken.';

revoke all on function public.is_expo_push_token(text) from public;

-- ---------------------------------------------------------------------------
-- register / unregister (end users)
-- ---------------------------------------------------------------------------

-- Upsert BY TOKEN, not by (user, token): a device token belongs to whoever is signed in on that
-- device right now. Reassigning is the whole point — see the header.
create or replace function public.register_push_token(p_token text, p_platform text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_token text := btrim(coalesce(p_token, ''));
  v_platform text := nullif(btrim(coalesce(p_platform, '')), '');
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not public.is_expo_push_token(v_token) then
    raise exception 'invalid Expo push token' using errcode = '22023';
  end if;

  if v_platform is not null and v_platform not in ('ios', 'android', 'web') then
    raise exception 'invalid platform' using errcode = '22023';
  end if;

  -- Take the token over from any other user first. A partial update (rather than delete+insert)
  -- keeps the row id stable, so nothing that references it is orphaned.
  update public.push_tokens
     set user_id = v_uid,
         platform = coalesce(v_platform, platform),
         updated_at = now()
   where expo_push_token = v_token;

  if not found then
    insert into public.push_tokens (user_id, expo_push_token, platform)
    values (v_uid, v_token, v_platform)
    on conflict (user_id, expo_push_token)
      do update set platform = coalesce(excluded.platform, public.push_tokens.platform),
                    updated_at = now();
  end if;
end;
$$;

comment on function public.register_push_token(text, text) is
  'Registers the caller''s Expo push token, REASSIGNING it from any previous owner (a device token identifies the handset, not the person). Raises 42501 when unauthenticated and 22023 for a malformed token/platform.';

revoke all on function public.register_push_token(text, text) from public;

create or replace function public.unregister_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_token text := btrim(coalesce(p_token, ''));
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- Scoped to the caller's own row on purpose: signing out must never be able to silence someone
  -- else's device, even if the caller can guess their token.
  delete from public.push_tokens
   where user_id = v_uid
     and expo_push_token = v_token;
end;
$$;

comment on function public.unregister_push_token(text) is
  'Deletes the CALLER''S row for this token (sign-out). Never touches another user''s row, even for the same token string. Raises 42501 when unauthenticated; deleting a token that is not there is a no-op.';

revoke all on function public.unregister_push_token(text) from public;

-- ---------------------------------------------------------------------------
-- prune (service role only)
-- ---------------------------------------------------------------------------

-- Called by the notification-drain function when Expo answers DeviceNotRegistered for a token.
-- Gated in the BODY on the role rather than by revoking EXECUTE (see the header): an end user who
-- calls it gets 42501, never a crash. It deletes across users by design, which is exactly why it
-- must never be reachable from a client session.
create or replace function public.prune_push_tokens(p_tokens text[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  if not public.is_privileged_writer() then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if p_tokens is null or cardinality(p_tokens) = 0 then
    return 0;
  end if;

  delete from public.push_tokens
   where expo_push_token = any (p_tokens);

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

comment on function public.prune_push_tokens(text[]) is
  'Deletes the given Expo tokens across ALL users (Expo reported DeviceNotRegistered). Service-role/postgres only, gated in the body with is_privileged_writer(); any other caller gets 42501. Returns the number of rows removed.';

revoke all on function public.prune_push_tokens(text[]) from public;

-- Index for the two new by-token lookups (register reassignment, prune). The existing unique is
-- (user_id, expo_push_token), whose leading column is the wrong one for these.
create index if not exists push_tokens_expo_push_token_idx
  on public.push_tokens (expo_push_token);

-- ---------------------------------------------------------------------------
-- Nudges
-- ---------------------------------------------------------------------------

-- A coach may send a member ONE nudge per day, and only from a fixed set of server-side texts.
-- The template is an enum-like text column, never free text: a coach must not be able to push
-- arbitrary strings to a member's lock screen, and the copy has to stay reviewable/translatable
-- in one place. The unique (coach_id, member_id, sent_on) IS the spam limit — it is enforced by
-- the database, not by the RPC, so a racing double-tap cannot slip a second nudge through.
create table if not exists public.nudges (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  template text not null check (template in ('check_in', 'missed_workout', 'great_work')),
  sent_on date not null default (now() at time zone 'utc')::date,
  created_at timestamptz not null default now(),
  unique (coach_id, member_id, sent_on)
);

comment on table public.nudges is
  'One row per nudge a coach sent a member. UNIQUE (coach_id, member_id, sent_on) is the once-per-day spam limit, enforced in the schema so concurrent calls cannot both win. Written only through public.send_nudge(); the text is chosen server-side from the template allowlist.';
comment on column public.nudges.template is
  'Allowlisted template key. The user-visible copy lives in public.nudge_copy() (20260921141000) so a coach can never push free text to a lock screen.';
comment on column public.nudges.sent_on is
  'UTC date of the nudge. UTC rather than the member''s timezone on purpose: the limit protects the MEMBER from a coach, and a coach must not be able to widen it by changing anyone''s timezone.';

create index if not exists nudges_member_id_created_at_idx
  on public.nudges (member_id, created_at desc);

alter table public.nudges enable row level security;

-- Coaches see what they sent; members see what they received; nobody writes directly (send_nudge
-- is SECURITY DEFINER and bypasses these). Admins see everything for the moderation/audit view.
drop policy if exists "nudges_select_coach" on public.nudges;
create policy "nudges_select_coach"
  on public.nudges for select
  using (coach_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "nudges_select_member" on public.nudges;
create policy "nudges_select_member"
  on public.nudges for select
  using (member_id = (select auth.uid()));

-- No INSERT/UPDATE/DELETE policy at all: RLS denies by default, so the only writer is
-- public.send_nudge(). Stated explicitly because "no policy" is easy to misread as an oversight.
