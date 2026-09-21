-- Push foundations, part 2 of 3: the notification OUTBOX — a durable, deduplicated, leased queue
-- that every push in this app goes through.
--
-- Why an outbox at all. Until now live-class-reminder sent to the Expo API inline and then
-- stamped live_classes.reminder_sent_at. Three defects follow from that shape and all three are
-- fixed here:
--   1. Two overlapping invocations (the run takes longer than the tick) both see
--      reminder_sent_at IS NULL and both fan out the same push. The single stamp is a lock that
--      is taken AFTER the side effect.
--   2. reminder_sent_at is ONE timestamp per CLASS, so a member who registers a token mid-window
--      either gets nothing or, if the class is left unstamped, everyone else gets a second copy.
--      Deduplication has to be per (event, USER), which is what dedupe_key is.
--   3. A failure anywhere in the fan-out loses the reminder with no retry and no record.
--   Enqueueing is a transactional INSERT with a UNIQUE dedupe_key, so "decide who gets what" is
--   atomic and idempotent, and "actually deliver it" is a separate, retryable, leased job.
--
-- Delivery states:  queued -> sending -> sent
--                             |  \-> failed (retryable; next_attempt_at backs off)
--                             \---> dead   (5 attempts, or a permanent error)
-- `failed` rows are re-claimed once next_attempt_at passes; `dead` rows are never retried and are
-- kept for forensics.
--
-- Crash recovery: claim_notifications() takes a LEASE (locked_until) rather than a lock held for
-- the length of the HTTP call. A drain that dies mid-flight leaves rows in `sending` with an
-- expired lease, and the next tick re-claims them. Duplicate delivery is possible in exactly one
-- window (Expo accepted the batch, the drain died before recording it); at-least-once was chosen
-- over at-most-once because a missed "your class starts in 10 minutes" is worse than a repeat.
--
-- Same SECURITY DEFINER rules as part 1: `revoke all ... from public` only (never revoke EXECUTE
-- from anon — it SIGSEGVs this Postgres), `set search_path`, gate in the body.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  dedupe_key text not null unique,
  title text not null,
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'failed', 'dead')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text
);

comment on table public.notification_outbox is
  'Durable push queue. One row per (recipient, event). UNIQUE dedupe_key is the deduplication AND the idempotency of every enqueue path; claim_notifications() leases rows so a crashed drain recovers. At-least-once delivery by design.';
comment on column public.notification_outbox.dedupe_key is
  'Globally unique delivery identity, per USER not per event: `live_class:<class_id>:<user_id>`, `nudge:<nudge_id>:<user_id>`. Re-enqueueing the same key is a no-op (ON CONFLICT DO NOTHING), which is what makes overlapping scheduler runs safe.';
comment on column public.notification_outbox.locked_until is
  'Lease expiry while status = sending. A drain that crashes leaves an expired lease and the row is re-claimed on the next tick.';
comment on column public.notification_outbox.payload is
  'Data attached to the push. `route` (when present) must be one of the app routes allowlisted in src/features/notifications/routes.ts — the client re-validates on tap; never trust a stored route.';

-- The claim query: status/next_attempt_at/locked_until, ordered by next_attempt_at.
create index if not exists notification_outbox_claimable_idx
  on public.notification_outbox (next_attempt_at)
  where status in ('queued', 'failed', 'sending');

-- A member's own inbox, newest first.
create index if not exists notification_outbox_user_created_idx
  on public.notification_outbox (user_id, created_at desc);

alter table public.notification_outbox enable row level security;

-- Members may read their own rows (a future in-app inbox). Nobody writes from a client: there is
-- no INSERT/UPDATE/DELETE policy, so RLS denies by default and the definer functions below are
-- the only writers. last_error can contain an Expo response, so it is admin-visible only in the
-- sense that admins have no special policy here either — they read it as postgres/service_role.
drop policy if exists "notification_outbox_select_self" on public.notification_outbox;
create policy "notification_outbox_select_self"
  on public.notification_outbox for select
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Enqueue (internal; called by send_nudge and the reminder enqueuer)
-- ---------------------------------------------------------------------------

-- Returns the row id when it enqueued, NULL when the dedupe_key was already present.
--
-- SECURITY INVOKER on purpose, and it is the one function here that is NOT a definer. The boundary
-- is the table's RLS: notification_outbox has no INSERT policy, so an end user who calls this
-- directly gets 42501 "new row violates row-level security policy" and injects nothing. Its real
-- callers — send_nudge() and enqueue_live_class_reminders(), both SECURITY DEFINER owned by
-- postgres — run as the table owner and so bypass RLS.
--
-- It must NOT gate on is_privileged_writer(): that reads the `role` GUC / session_user, which a
-- SECURITY DEFINER function does not change, so send_nudge() called by a coach would fail its own
-- gate. (prune/claim/complete/fail below DO use it, because their only caller is the drain
-- arriving over PostgREST as service_role, and there the GUC is exactly the right signal.)
create or replace function public.enqueue_notification(
  p_user uuid,
  p_kind text,
  p_dedupe_key text,
  p_title text,
  p_body text,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_user is null or coalesce(btrim(p_dedupe_key), '') = '' then
    raise exception 'user and dedupe_key are required' using errcode = '22023';
  end if;

  insert into public.notification_outbox (user_id, kind, dedupe_key, title, body, payload)
  values (p_user, p_kind, btrim(p_dedupe_key), p_title, p_body, coalesce(p_payload, '{}'::jsonb))
  on conflict (dedupe_key) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.enqueue_notification(uuid, text, text, text, text, jsonb) is
  'Enqueues one push, idempotently: a dedupe_key that already exists returns NULL and changes nothing. SECURITY INVOKER — the boundary is notification_outbox RLS (no INSERT policy), so a direct client call raises 42501 while SECURITY DEFINER callers owned by postgres bypass RLS.';

revoke all on function public.enqueue_notification(uuid, text, text, text, text, jsonb) from public;

-- ---------------------------------------------------------------------------
-- Drain protocol: claim / complete / fail (service role only)
-- ---------------------------------------------------------------------------

-- Backoff schedule for a retryable failure, by attempt number: 1m, 2m, 4m, 8m, then dead.
-- Capped and IMMUTABLE so the policy is one readable line rather than arithmetic scattered
-- through fail_notification().
create or replace function public.notification_retry_delay(p_attempts integer)
returns interval
language sql
immutable
as $$
  select interval '1 minute'
         * power(2, least(greatest(coalesce(p_attempts, 1), 1), 6) - 1)::integer;
$$;

comment on function public.notification_retry_delay(integer) is
  'Exponential backoff for notification_outbox retries, by attempt count: 1 -> 1m, 2 -> 2m, 3 -> 4m, 4 -> 8m (capped at 32m). Kept separate so the schedule is one auditable expression.';

revoke all on function public.notification_retry_delay(integer) from public;

-- Maximum attempts before a row is dead-lettered.
create or replace function public.notification_max_attempts()
returns integer
language sql
immutable
as $$ select 5; $$;

comment on function public.notification_max_attempts() is 'Attempts after which a notification_outbox row is dead-lettered (5).';

revoke all on function public.notification_max_attempts() from public;

-- Claim up to p_limit due rows and lease them for p_lease_seconds.
--
-- FOR UPDATE SKIP LOCKED is what makes two concurrent drains safe: each skips the rows the other
-- has locked instead of blocking on them, so the same push is never handed to both. The lease is
-- what makes a CRASHED drain safe: `sending` rows whose locked_until has passed are due again.
create or replace function public.claim_notifications(
  p_limit integer default 50,
  p_lease_seconds integer default 120
)
returns setof public.notification_outbox
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 500);
  v_lease integer := least(greatest(coalesce(p_lease_seconds, 120), 10), 900);
begin
  if not public.is_privileged_writer() then
    raise exception 'service role required' using errcode = '42501';
  end if;

  return query
  with due as (
    select o.id
      from public.notification_outbox o
     where o.next_attempt_at <= now()
       and (
         o.status in ('queued', 'failed')
         -- Lease recovery: a row left `sending` by a drain that died is due again.
         or (o.status = 'sending' and (o.locked_until is null or o.locked_until <= now()))
       )
     order by o.next_attempt_at, o.created_at
     limit v_limit
     for update skip locked
  )
  update public.notification_outbox o
     set status = 'sending',
         attempts = o.attempts + 1,
         locked_until = now() + make_interval(secs => v_lease)
    from due
   where o.id = due.id
  returning o.*;
end;
$$;

comment on function public.claim_notifications(integer, integer) is
  'Leases up to p_limit due outbox rows to the calling drain (status -> sending, attempts + 1, locked_until = now() + lease) and returns them. FOR UPDATE SKIP LOCKED makes concurrent drains disjoint; an expired lease on a `sending` row makes a crashed drain recoverable. Service role only (42501 otherwise).';

revoke all on function public.claim_notifications(integer, integer) from public;

create or replace function public.complete_notification(p_id uuid, p_ticket jsonb default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_privileged_writer() then
    raise exception 'service role required' using errcode = '42501';
  end if;

  update public.notification_outbox
     set status = 'sent',
         sent_at = now(),
         locked_until = null,
         last_error = null,
         -- The Expo ticket id is kept so a later receipt lookup can find the row again.
         payload = payload || jsonb_build_object('ticket', coalesce(p_ticket, 'null'::jsonb))
   where id = p_id
     and status <> 'sent';
end;
$$;

comment on function public.complete_notification(uuid, jsonb) is
  'Marks an outbox row delivered and records the Expo ticket under payload.ticket (for the later receipt check). Idempotent: a row already `sent` is left alone. Service role only (42501 otherwise).';

revoke all on function public.complete_notification(uuid, jsonb) from public;

create or replace function public.fail_notification(
  p_id uuid,
  p_error text,
  p_retry boolean default true
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempts integer;
  v_status text;
begin
  if not public.is_privileged_writer() then
    raise exception 'service role required' using errcode = '42501';
  end if;

  select attempts into v_attempts
    from public.notification_outbox
   where id = p_id
   for update;

  if v_attempts is null then
    return null;
  end if;

  -- p_retry = false is for PERMANENT errors (DeviceNotRegistered, a message Expo rejected as
  -- malformed): retrying them just burns quota, so they go straight to the dead letter.
  v_status := case
                when not coalesce(p_retry, true) then 'dead'
                when v_attempts >= public.notification_max_attempts() then 'dead'
                else 'failed'
              end;

  update public.notification_outbox
     set status = v_status,
         locked_until = null,
         -- Truncated: last_error is an upstream response and must not become a blob store.
         last_error = left(coalesce(p_error, 'unknown error'), 500),
         next_attempt_at = case
                             when v_status = 'failed'
                               then now() + public.notification_retry_delay(v_attempts)
                             else next_attempt_at
                           end
   where id = p_id;

  return v_status;
end;
$$;

comment on function public.fail_notification(uuid, text, boolean) is
  'Records a delivery failure and returns the new status. p_retry = false (permanent error) or the 5th attempt dead-letters the row; otherwise it goes back to `failed` with an exponential next_attempt_at. Service role only (42501 otherwise).';

revoke all on function public.fail_notification(uuid, text, boolean) from public;

-- ---------------------------------------------------------------------------
-- Nudges: server-side copy + send_nudge (table is in 20260921140000)
-- ---------------------------------------------------------------------------

-- The ONLY place a nudge's words are decided. A coach chooses a template key, never a string:
-- the push text is app-owned copy, so it can be reviewed, kept consistent and later translated,
-- and a coach cannot use a member's lock screen as a free-text channel.
create or replace function public.nudge_copy(p_template text)
returns table (title text, body text)
language sql
immutable
as $$
  -- Projecting the two copy columns explicitly (not `select *`): the VALUES list carries the
  -- template key as well, and a three-column body would not match the declared return type.
  select copy.title, copy.body
    from (values
      ('check_in',       'A note from your coach', 'Your coach is checking in. Open DBF when you get a moment.'),
      ('missed_workout', 'Ready when you are',     'Your coach noticed you missed a session. Pick it back up today.'),
      ('great_work',     'Nice work',              'Your coach saw your last session. Keep it going.')
    ) as copy(template, title, body)
   where copy.template = p_template;
$$;

comment on function public.nudge_copy(text) is
  'Maps a nudges.template key to its app-owned push title/body. Returns no row for an unknown key, which is how send_nudge() rejects one. The single source of nudge copy.';

revoke all on function public.nudge_copy(text) from public;

-- A coach nudges one of their CURRENT members, at most once a day, and the call only ENQUEUES:
-- it never talks to Expo. That keeps the coach's request fast and, more importantly, keeps the
-- authorization decision and the delivery record in ONE transaction — if the nudge row commits,
-- the outbox row committed with it.
create or replace function public.send_nudge(p_member uuid, p_template text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_nudge_id uuid;
  v_title text;
  v_body text;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- CURRENT coach, not the author of anything: is_coach_of_member reads profiles.coach_id, so a
  -- former coach loses the ability to nudge the moment the member switches.
  if not (public.is_coach_of_member(p_member) or public.is_admin()) then
    raise exception 'not your member' using errcode = '42501';
  end if;

  -- Don't nudge someone who is locked out: "come back and train" landing on a paywall is worse
  -- than silence. Reuses the canonical access rule (active | grace | staff) rather than
  -- re-implementing the 10-day grace boundary here.
  if not public.has_live_access(p_member) then
    raise exception 'member is not active' using errcode = '42501';
  end if;

  select c.title, c.body into v_title, v_body from public.nudge_copy(p_template) c;
  if v_title is null then
    raise exception 'unknown nudge template' using errcode = '22023';
  end if;

  -- The UNIQUE (coach_id, member_id, sent_on) does the rate limiting. Caught and re-raised with
  -- a stable message so the client can show "already nudged today" rather than a raw constraint.
  begin
    insert into public.nudges (coach_id, member_id, template)
    values (v_uid, p_member, p_template)
    returning id into v_nudge_id;
  exception when unique_violation then
    raise exception 'already_nudged_today' using errcode = '23505';
  end;

  -- Per-recipient dedupe key: the nudge id already encodes (coach, member, day).
  perform public.enqueue_notification(
    p_member,
    'nudge',
    'nudge:' || v_nudge_id::text || ':' || p_member::text,
    v_title,
    v_body,
    jsonb_build_object('route', '/(tabs)', 'nudgeId', v_nudge_id, 'template', p_template)
  );

  return v_nudge_id;
end;
$$;

comment on function public.send_nudge(uuid, text) is
  'Coach (or admin) nudges one of their CURRENT members once per UTC day. Enqueues into notification_outbox; never pushes inline. Errors: 42501 (unauthenticated / not your member / member has no live access), 22023 (unknown template), 23505 ''already_nudged_today''.';

revoke all on function public.send_nudge(uuid, text) from public;

-- ---------------------------------------------------------------------------
-- Live-class "starting soon": enqueue, set-based
-- ---------------------------------------------------------------------------

create or replace function public.live_class_reminder_window_minutes()
returns integer
language sql
immutable
as $$ select 15; $$;

comment on function public.live_class_reminder_window_minutes() is
  'How far ahead a live class is reminded (15 minutes). Mirrors REMINDER_WINDOW_MINUTES in supabase/functions/live-class-reminder/logic.ts.';

revoke all on function public.live_class_reminder_window_minutes() from public;

-- One set-based statement replaces the Edge Function's per-class, per-member fan-out loop.
--
-- Entitlement is unchanged from the function it replaces: the class's coach plus the members
-- whose profiles.coach_id is that coach AND who currently have live access (active | grace |
-- staff, via has_live_access). Reminding a lapsed member would be an invitation to a door
-- agora-rtc-token answers 403 at.
--
-- reminder_sent_at is NOT consulted and NOT stamped any more. The per-(class, user) dedupe_key is
-- the idempotency, which is strictly better: a member who registers a device mid-window still
-- gets their reminder, and no one gets a second copy. The column stays for backward compatibility
-- with the old Edge Function path.
create or replace function public.enqueue_live_class_reminders()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_enqueued integer;
begin
  if not public.is_privileged_writer() then
    raise exception 'service role required' using errcode = '42501';
  end if;

  with due_classes as (
    select c.id, c.coach_id, c.title, c.starts_at
      from public.live_classes c
     where c.status = 'scheduled'
       and c.starts_at >= now()
       and c.starts_at <= now()
             + make_interval(mins => public.live_class_reminder_window_minutes())
  ),
  -- Recipients: the coach themselves, plus their entitled members. UNION (not UNION ALL) so a
  -- coach who is somehow also in their own roster is not doubled.
  recipients as (
    select dc.id as class_id, dc.title, dc.coach_id as user_id from due_classes dc
    union
    select dc.id, dc.title, p.id
      from due_classes dc
      join public.profiles p on p.coach_id = dc.coach_id
     where public.has_live_access(p.id)
  ),
  -- Only people with a device to push to; otherwise the queue fills with rows the drain can
  -- never deliver.
  with_tokens as (
    select distinct r.class_id, r.title, r.user_id
      from recipients r
     where exists (select 1 from public.push_tokens t where t.user_id = r.user_id)
  ),
  inserted as (
    insert into public.notification_outbox (user_id, kind, dedupe_key, title, body, payload)
    select w.user_id,
           'live_class',
           'live_class:' || w.class_id::text || ':' || w.user_id::text,
           'Starting soon',
           w.title || ' is about to start. Tap to join.',
           jsonb_build_object(
             'route', '/community/live/' || w.class_id::text,
             'liveClassId', w.class_id
           )
      from with_tokens w
    on conflict (dedupe_key) do nothing
    returning 1
  )
  select count(*)::integer into v_enqueued from inserted;

  return v_enqueued;
end;
$$;

comment on function public.enqueue_live_class_reminders() is
  'Enqueues one "starting soon" outbox row per (class, entitled recipient with a device) for classes starting within live_class_reminder_window_minutes(). Idempotent through the dedupe_key, so it is safe to run every minute and safe to overlap with itself. Service role / cron only (42501 otherwise). Returns the number of rows newly enqueued.';

revoke all on function public.enqueue_live_class_reminders() from public;
