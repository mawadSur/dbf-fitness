-- Push foundations, part 3 of 3: SCHEDULING — the minute tick that runs the queue.
--
-- Parts 1 and 2 built an outbox that is safe to fill and safe to drain. Nothing ran it: both
-- live-class-reminder and the drain needed an external scheduler, and the repo had none (see the
-- "not configured" row in docs/release-checklist.md). This file schedules them in the database.
--
-- WHAT WAS VERIFIED ON THIS LOCAL POSTGRES 17.6 before writing it (the ticket asked for a
-- throwaway probe first, because a bad extension load takes the server down):
--   * pg_cron 1.6.4 and pg_net 0.20.0 are both in pg_available_extensions; pg_net is already
--     installed. pg_cron is listed in shared_preload_libraries, so it can actually run jobs.
--   * `begin; create extension pg_cron; rollback;` succeeded and `docker logs supabase_db_dbf`
--     showed no "server process ... was terminated" afterwards.
--   * The extension installs into pg_catalog in this image (not a `cron` schema), so the objects
--     are cron.job / cron.schedule() with the functions reachable unqualified.
-- The DO guard below still checks pg_available_extensions, because a hosted project or a leaner
-- image may not have pg_cron at all and this migration must not fail there.
--
-- NO SECRET IS STORED IN THIS FILE. The drain tick reads the function URL and the service-role
-- key from Vault at call time and does NOTHING (with a notice) when they are absent, which is
-- exactly the state of a fresh local database — so replaying these migrations never fires an
-- HTTP request at an unconfigured environment. Configuring it is one statement per secret, and
-- is documented in docs/release-checklist.md.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  else
    raise notice 'pg_net is not available; notification scheduling will not make HTTP calls';
  end if;

  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    -- schema pg_catalog: what this Supabase image ships and where the probe above landed it.
    create extension if not exists pg_cron with schema pg_catalog;
  else
    raise notice 'pg_cron is not available; jobs must be scheduled outside the database';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Configuration lookup (Vault, never a literal)
-- ---------------------------------------------------------------------------

-- Reads one secret from Vault. Returns null when Vault or the secret is missing, so every caller
-- can treat "not configured" as an ordinary, non-fatal state instead of an exception.
--
-- SECURITY DEFINER because vault.decrypted_secrets is readable only by privileged roles, and
-- gated in the body on is_privileged_writer(): a member who calls it gets 42501, never a secret.
-- (Body gate rather than `revoke execute` — this Postgres SIGSEGVs when a role calls a definer
-- function it lacks EXECUTE on; see the part-1 header.)
create or replace function public.notification_setting(p_name text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_value text;
begin
  if not public.is_privileged_writer() then
    raise exception 'service role required' using errcode = '42501';
  end if;

  begin
    select s.decrypted_secret into v_value
      from vault.decrypted_secrets s
     where s.name = p_name
     limit 1;
  exception when undefined_table or insufficient_privilege then
    -- No Vault in this environment: not configured, not an error.
    return null;
  end;

  return nullif(btrim(coalesce(v_value, '')), '');
end;
$$;

comment on function public.notification_setting(text) is
  'Reads a Vault secret by name for the scheduled notification jobs (notification_drain_url, notification_service_role_key). Returns NULL when Vault or the secret is absent, so "unconfigured" is a no-op rather than a failure. Service role only (42501 otherwise); never returns a value to a client session.';

revoke all on function public.notification_setting(text) from public;

-- ---------------------------------------------------------------------------
-- The two ticks
-- ---------------------------------------------------------------------------

-- Cron calls this every minute. It POSTs to the notification-drain Edge Function via pg_net,
-- which is fire-and-forget: the request id is returned immediately and the response lands in
-- net._http_response. That is deliberate — a cron job must not hold a worker for the length of a
-- push fan-out, and the drain is already idempotent (leases + dedupe), so a lost response costs
-- nothing but one lease period.
create or replace function public.drain_notifications_tick()
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_url text;
  v_key text;
  v_request_id bigint;
begin
  if not public.is_privileged_writer() then
    raise exception 'service role required' using errcode = '42501';
  end if;

  v_url := public.notification_setting('notification_drain_url');
  v_key := public.notification_setting('notification_service_role_key');

  if v_url is null or v_key is null then
    -- The normal state of a fresh/local database. Say so once per tick and stop; do NOT raise,
    -- or cron would log a failure every minute for an environment that simply is not wired up.
    raise notice 'notification drain is not configured (notification_drain_url / notification_service_role_key)';
    return null;
  end if;

  select net.http_post(
           url := v_url,
           body := '{}'::jsonb,
           params := '{}'::jsonb,
           -- The key is read from Vault at call time and never logged: pg_net stores headers in
           -- net._http_request_queue, which is not readable by any client role.
           headers := jsonb_build_object(
             'Content-Type', 'application/json',
             'Authorization', 'Bearer ' || v_key
           ),
           timeout_milliseconds := 20000
         )
    into v_request_id;

  return v_request_id;
end;
$$;

comment on function public.drain_notifications_tick() is
  'Cron entry point: POSTs the notification-drain Edge Function with the service-role bearer, both read from Vault at call time (never stored here). Returns the pg_net request id, or NULL with a NOTICE when the environment is not configured. Service role / cron only (42501 otherwise).';

revoke all on function public.drain_notifications_tick() from public;

-- The reminder tick needs no HTTP at all: enqueue_live_class_reminders() (part 2) is set-based
-- SQL, so cron calls it directly. This wrapper exists only so the two cron jobs read the same
-- way and so the job command stays stable if the enqueuer ever grows arguments.
create or replace function public.enqueue_live_class_reminders_tick()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_privileged_writer() then
    raise exception 'service role required' using errcode = '42501';
  end if;

  return public.enqueue_live_class_reminders();
end;
$$;

comment on function public.enqueue_live_class_reminders_tick() is
  'Cron entry point for the "starting soon" enqueuer. Pure SQL, no HTTP; idempotent through the outbox dedupe_key, so overlapping ticks are harmless. Service role / cron only (42501 otherwise).';

revoke all on function public.enqueue_live_class_reminders_tick() from public;

-- ---------------------------------------------------------------------------
-- Scheduling (idempotent)
-- ---------------------------------------------------------------------------

-- Schedules both minute jobs, unscheduling by name first so re-running this migration (or the
-- gate replaying every migration from scratch) never accumulates duplicate jobs. Separated from
-- the DO block below so an operator can re-apply the schedule by hand after changing Vault.
create or replace function public.schedule_notification_jobs()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job text;
begin
  if not public.is_privileged_writer() then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron is not installed; schedule the two ticks with an external scheduler';
    return;
  end if;

  foreach v_job in array array['dbf-notification-drain', 'dbf-live-class-reminders'] loop
    -- cron.unschedule(name) raises when the job does not exist, which is the normal first run.
    begin
      perform cron.unschedule(v_job);
    exception when others then
      null;
    end;
  end loop;

  perform cron.schedule(
    'dbf-notification-drain',
    '* * * * *',
    $job$select public.drain_notifications_tick();$job$
  );
  perform cron.schedule(
    'dbf-live-class-reminders',
    '* * * * *',
    $job$select public.enqueue_live_class_reminders_tick();$job$
  );
end;
$$;

comment on function public.schedule_notification_jobs() is
  'Idempotently (re)creates the two every-minute cron jobs dbf-notification-drain and dbf-live-class-reminders, unscheduling by name first. No-op with a NOTICE when pg_cron is absent. Service role only (42501 otherwise). Re-run by hand after changing the Vault secrets.';

revoke all on function public.schedule_notification_jobs() from public;

do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    perform public.schedule_notification_jobs();
  end if;
end;
$$;
