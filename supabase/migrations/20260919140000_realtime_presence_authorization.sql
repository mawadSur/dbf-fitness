-- Realtime Authorization for the two Presence channels this app uses.
--
-- Problem this closes:
--   Realtime Authorization was never switched on, so `realtime.messages` had RLS enabled with
--   zero policies. Any client could therefore join any PUBLIC channel topic and read/write its
--   Presence state. Two topics leak:
--     * `group:<uuid>` — LOW: tracks only `{ user_id }`, and the roster merge already allowlists
--       to real roster members, so a stranger can neither learn names nor inject a visible row.
--     * `live:<uuid>`  — MEDIUM: tracks `{ user_id, full_name }` and has NO allowlist.
--       `live_classes` is selectable by every authenticated user (see
--       live_classes_select_authenticated), so class ids are enumerable; any signed-up user could
--       join another coach's class topic, read the NAMES of everyone present — data the database
--       deliberately withholds, since `profiles` is self-or-coach and `live_class_participants`
--       is self-or-class-coach — and inject arbitrary `{user_id, full_name}` entries into real
--       members' "In this class" list.
--
-- Fix: RLS policies on `realtime.messages` that let an authenticated user receive (SELECT) and
-- track (INSERT) Presence only on a topic they are entitled to, plus deny-by-default for every
-- other topic shape. The clients now subscribe with `{ config: { private: true } }`, which is what
-- makes Realtime consult these policies at all.
--
-- Entitlement:
--   group:<uuid> — caller is a member of that group.
--   live:<uuid>  — caller is the class's coach, or a member whose profiles.coach_id is the
--                  class's coach_id (the same audience the class is visible to in the app).
--   anything else — denied.
--
-- RESIDUAL RISK (accepted, not engineered around): an AUTHORIZED member of a class can still put
-- someone else's name in their own presence payload. Presence metadata is client-supplied; these
-- policies gate WHO may be on a topic, not what they claim about themselves.
--
-- LOCAL-DEV CAVEAT — read before `supabase db reset`:
--   `realtime.messages` is not created by Postgres migrations at all. It is created by the
--   Realtime container's own Ecto migrations when that container (re)starts. `supabase db reset`
--   drops and recreates the `postgres` database from `template1` (which has no `realtime.messages`),
--   applies the CLI's init schema (which creates only `CREATE SCHEMA IF NOT EXISTS realtime`), runs
--   these migrations, seeds, and only THEN restarts the Realtime container. So on a from-scratch
--   reset this file can run while `realtime.messages` does not yet exist.
--   It therefore installs `public.apply_realtime_presence_policies()` and calls it: when the table
--   is missing the call warns instead of failing (the migration still applies cleanly), and the
--   policies are applied by re-running the same function once Realtime is up:
--       psql "$DB_URL" -c "select public.apply_realtime_presence_policies();"
--   Missing policies fail CLOSED (RLS on, no policy = no private presence at all), so the window
--   is a broken roster, never an open one.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- Topic parsing
-- ---------------------------------------------------------------------------

-- Returns the uuid tail of a `<prefix><uuid>` Realtime topic, or NULL when the topic does not
-- have that prefix or the tail is not a well-formed uuid. Deliberately returns NULL rather than
-- casting: a hostile client picks the topic string, and `'live:oops'::uuid` would raise 22P02
-- inside an RLS predicate instead of simply denying access.
create or replace function public.presence_topic_uuid(topic text, prefix text)
returns uuid
language sql
immutable
as $$
  select case
           when topic is null or prefix is null then null
           when substr(topic, 1, length(prefix)) is distinct from prefix then null
           when substr(topic, length(prefix) + 1)
                  ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             then substr(topic, length(prefix) + 1)::uuid
           else null
         end;
$$;

-- EXECUTE is granted to anon as well as authenticated for every function reachable from an RLS
-- USING/WITH CHECK expression. See 20260919120000_fix_rls_infinite_recursion.sql: revoking it from
-- anon while an RLS policy can still reach the function crashes the backend (SIGSEGV) instead of
-- denying cleanly. The security boundary is auth.uid(), which is NULL for anon.
revoke all on function public.presence_topic_uuid(text, text) from public;
grant execute on function public.presence_topic_uuid(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Entitlement checks
-- ---------------------------------------------------------------------------

-- `group:<uuid>` — the caller must be a member of that group. Reuses is_fellow_group_member,
-- whose SECURITY DEFINER body bypasses RLS on group_members. A NULL group id (malformed topic)
-- matches no row, so it returns false.
create or replace function public.can_use_group_presence_topic(topic text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and public.is_fellow_group_member(public.presence_topic_uuid(topic, 'group:'));
$$;

revoke all on function public.can_use_group_presence_topic(text) from public;
grant execute on function public.can_use_group_presence_topic(text) to anon, authenticated;

-- `live:<uuid>` — the caller must be the class's coach, or a member coached by that coach.
-- SECURITY DEFINER because the check reads profiles rows (the caller's own coach_id) and
-- live_classes; doing it in the policy directly would be subject to those tables' own RLS.
create or replace function public.can_use_live_class_presence_topic(topic text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.live_classes lc
    where lc.id = public.presence_topic_uuid(topic, 'live:')
      and auth.uid() is not null
      and (
        lc.coach_id = auth.uid()
        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.coach_id = lc.coach_id
        )
      )
  );
$$;

revoke all on function public.can_use_live_class_presence_topic(text) from public;
grant execute on function public.can_use_live_class_presence_topic(text) to anon, authenticated;

-- Single entry point for the policies: routes a topic to its entitlement check, and denies every
-- topic shape the app does not use.
create or replace function public.can_use_presence_topic(topic text)
returns boolean
language sql
stable
as $$
  select case
           when topic like 'group:%' then public.can_use_group_presence_topic(topic)
           when topic like 'live:%'  then public.can_use_live_class_presence_topic(topic)
           else false
         end;
$$;

revoke all on function public.can_use_presence_topic(text) from public;
grant execute on function public.can_use_presence_topic(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Policies on realtime.messages
-- ---------------------------------------------------------------------------

-- Idempotent installer, separated from the migration body so it can be re-run after the Realtime
-- container creates `realtime.messages` (see the LOCAL-DEV CAVEAT at the top).
--
-- SECURITY DEFINER so it runs as the migration role (postgres), which inherits
-- supabase_realtime_admin and therefore passes the ownership check CREATE POLICY requires on
-- realtime.messages. It issues DDL, so callers are gated INSIDE the body (see the guard below) and
-- not by REVOKE — see the note at the bottom of this file for why REVOKE is unsafe on this build.
create or replace function public.apply_realtime_presence_policies()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  -- Caller gate. Inside SECURITY DEFINER, current_user is always the owner, so identify the
  -- CALLER via the `role` GUC (set by PostgREST's `set local role` / SET ROLE; 'none' when unset)
  -- and fall back to session_user for a plain psql/migration session. Only the privileged roles may
  -- proceed; anon/authenticated (reachable via the public anon key over PostgREST) get a clean
  -- permission error and never reach the DDL below.
  if coalesce(nullif(current_setting('role', true), 'none'), session_user)
       not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception 'apply_realtime_presence_policies: permission denied' using errcode = '42501';
  end if;

  if to_regclass('realtime.messages') is null then
    raise warning
      'realtime.messages does not exist yet; presence authorization NOT applied. Re-run select public.apply_realtime_presence_policies(); once the Realtime container has started.';
    return;
  end if;

  execute 'alter table realtime.messages enable row level security';

  -- Both extensions are listed on purpose, and it is NOT a widening of the audience: the
  -- entitlement check is identical, so only the same people already allowed on the topic are
  -- covered. Realtime decides a private join by opening ONE transaction that probes every
  -- extension (it inserts a trial row per extension and checks whether it reads back, then rolls
  -- back). A policy that allows 'presence' but denies 'broadcast' makes the broadcast probe raise
  -- 42501, which aborts that shared transaction, so Realtime sees the whole authorization check
  -- fail and refuses the join with "You do not have permissions to read from this Channel topic"
  -- — even for a user whose presence predicate returned true. Verified against Realtime v2.86.3:
  -- with 'presence' alone every legitimate member was refused; adding 'broadcast' let exactly the
  -- entitled members in and still refused everyone else.
  execute 'drop policy if exists "presence_read_entitled_topics" on realtime.messages';
  execute $ddl$
    create policy "presence_read_entitled_topics"
      on realtime.messages
      for select
      to authenticated
      using (
        realtime.messages.extension in ('broadcast', 'presence')
        and public.can_use_presence_topic((select realtime.topic()))
      )
  $ddl$;

  execute 'drop policy if exists "presence_write_entitled_topics" on realtime.messages';
  execute $ddl$
    create policy "presence_write_entitled_topics"
      on realtime.messages
      for insert
      to authenticated
      with check (
        realtime.messages.extension in ('broadcast', 'presence')
        and public.can_use_presence_topic((select realtime.topic()))
      )
  $ddl$;
end;
$fn$;

-- EXECUTE deliberately STAYS granted to anon/authenticated (Supabase's default privileges grant it
-- at CREATE time; only `public` is revoked). Do NOT `revoke ... from anon, authenticated` here:
-- reproduced on this Postgres 17.6 build — with EXECUTE revoked from anon, a direct SQL session
-- doing `set local role anon; select public.apply_realtime_presence_policies();` segfaulted the
-- backend (signal 11, server enters crash recovery). Same family as the Phase 1 finding, and it
-- occurred even though this function is not reachable from an RLS expression. The crash looks
-- specific to that SET ROLE path: the same denied call as `authenticator` (no `role` GUC, no grant)
-- returned a clean permission error, and over PostgREST it returns a clean 401. Path-specific or
-- not, a reachable crash oracle is not worth leaving. The function is PostgREST-exposed, so instead the body itself
-- refuses unprivileged callers (see the guard at the top): anon/authenticated get a clean 42501 and
-- never reach the DDL, so they cannot churn ACCESS EXCLUSIVE locks on realtime.messages.
revoke all on function public.apply_realtime_presence_policies() from public;

select public.apply_realtime_presence_policies();
