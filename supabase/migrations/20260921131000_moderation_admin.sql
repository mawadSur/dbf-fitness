-- ============================================================================
-- 20260921131000_moderation_admin.sql
--
-- Moderation becomes an ADMIN-ONLY queue. Coaches stop being moderators.
--
-- Why this is safe for existing clients: the app only ever WRITES reports
-- (src/features/community/api.ts reportUser -> insert into moderation_reports).
-- There is no read or update path in any screen, so removing the coach SELECT
-- and UPDATE branches breaks nothing that ships today. The insert policy
-- ("moderation_reports_insert_reporter", reporter_id = auth.uid()) is left
-- exactly as it is, as are the row-cap and text-bound triggers from
-- 20260919152000 / 20260919152200.
--
-- Two rules that outrank "admin sees everything":
--   * the ACCUSED never reads or resolves a report about themselves -- even an
--     admin. Their own reports are excluded from every read path and RPC.
--   * moderation_actions is an append-only audit, like subscription_events.
--
-- Depends on 20260921130000 for public.assert_admin_caller().
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. moderation_reports -- resolution columns
-- ---------------------------------------------------------------------------

alter table public.moderation_reports
  add column if not exists resolved_by uuid references public.profiles (id) on delete set null;
alter table public.moderation_reports
  add column if not exists resolved_at timestamptz;
alter table public.moderation_reports
  add column if not exists resolution_note text;
alter table public.moderation_reports
  add column if not exists content_ref text;

alter table public.moderation_reports
  drop constraint if exists moderation_reports_resolution_bounds;
alter table public.moderation_reports
  add constraint moderation_reports_resolution_bounds check (
    (resolution_note is null or length(resolution_note) <= 2000)
    and (content_ref is null or length(content_ref) <= 500)
  );

comment on column public.moderation_reports.resolved_by is
  'Admin who last set a terminal status via review_report(). Null while the report is open.';
comment on column public.moderation_reports.content_ref is
  'Opaque pointer to what was reported (e.g. "group_message:<uuid>"), free-form and client-supplied; never trusted for authorization.';

create index if not exists moderation_reports_status_created_idx
  on public.moderation_reports (status, created_at desc, id desc);
create index if not exists moderation_reports_reported_user_idx
  on public.moderation_reports (reported_user_id);

-- ---------------------------------------------------------------------------
-- 2. moderation_reports -- admin-only policies
-- ---------------------------------------------------------------------------

-- Replaces "moderation_reports_select_reporter_or_moderator" (20260919152000).
-- Intent kept: a reporter follows their own report; moderators moderate. What
-- changes: the moderator is now the ADMIN only, and the accused is excluded
-- unconditionally (previously only the UPDATE policy had that guard).
drop policy if exists "moderation_reports_select_reporter_or_moderator" on public.moderation_reports;
drop policy if exists "moderation_reports_select_reporter_or_admin" on public.moderation_reports;
create policy "moderation_reports_select_reporter_or_admin"
  on public.moderation_reports for select
  to authenticated
  using (
    reported_user_id <> (select auth.uid())
    and (
      reporter_id = (select auth.uid())
      or (select public.is_admin())
    )
  );

-- Replaces "moderation_reports_update_moderator": admins only, never the
-- accused. Reporters cannot edit a filed report (they never could).
drop policy if exists "moderation_reports_update_moderator" on public.moderation_reports;
drop policy if exists "moderation_reports_update_admin" on public.moderation_reports;
create policy "moderation_reports_update_admin"
  on public.moderation_reports for update
  to authenticated
  using (
    reported_user_id <> (select auth.uid())
    and (select public.is_admin())
  )
  with check (
    reported_user_id <> (select auth.uid())
    and (select public.is_admin())
  );

-- ---------------------------------------------------------------------------
-- 3. moderation_actions -- append-only audit
-- ---------------------------------------------------------------------------

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles (id) on delete set null,
  action text not null check (action in ('dismiss', 'warn', 'remove_from_group', 'block')),
  report_id uuid references public.moderation_reports (id) on delete set null,
  target_member uuid references public.profiles (id) on delete cascade,
  group_id uuid references public.groups (id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

alter table public.moderation_actions
  drop constraint if exists moderation_actions_note_bounds;
alter table public.moderation_actions
  add constraint moderation_actions_note_bounds check (
    note is null or length(note) <= 2000
  );

comment on table public.moderation_actions is
  'Append-only audit of every moderation decision. Written only by the admin RPCs in this migration; immutable for all roles (trigger), apart from FK cleanup after a profile is deleted.';

create index if not exists moderation_actions_created_idx
  on public.moderation_actions (created_at desc, id desc);
create index if not exists moderation_actions_report_idx
  on public.moderation_actions (report_id);
create index if not exists moderation_actions_target_idx
  on public.moderation_actions (target_member, created_at desc);

alter table public.moderation_actions enable row level security;

-- Admins read the audit. Nobody else, including the target: telling a member
-- exactly which report got them removed leaks the reporter.
drop policy if exists "moderation_actions_select_admin" on public.moderation_actions;
create policy "moderation_actions_select_admin"
  on public.moderation_actions for select
  to authenticated
  using ((select public.is_admin()));

-- Same append-only guard as subscription_events: only the referential-integrity
-- cleanups that account deletion depends on get through.
create or replace function public.moderation_actions_append_only()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.target_member is not null
       and not exists (select 1 from public.profiles p where p.id = old.target_member) then
      return old;
    end if;
  elsif tg_op = 'UPDATE' then
    -- admin_id / report_id / group_id set-null cleanups, nothing else.
    if new.id = old.id
       and new.action = old.action
       and new.created_at = old.created_at
       and new.target_member is not distinct from old.target_member
       and new.note is not distinct from old.note
       and (
         (new.admin_id is not distinct from old.admin_id)
         or (new.admin_id is null and old.admin_id is not null
             and not exists (select 1 from public.profiles p where p.id = old.admin_id))
       )
       and (
         (new.report_id is not distinct from old.report_id)
         or (new.report_id is null and old.report_id is not null
             and not exists (select 1 from public.moderation_reports r where r.id = old.report_id))
       )
       and (
         (new.group_id is not distinct from old.group_id)
         or (new.group_id is null and old.group_id is not null
             and not exists (select 1 from public.groups g where g.id = old.group_id))
       )
       and (new.admin_id, new.report_id, new.group_id)
             is distinct from (old.admin_id, old.report_id, old.group_id)
    then
      return new;
    end if;
  end if;

  raise exception using
    errcode = '42501',
    message = 'moderation_actions_append_only',
    detail  = format('%s on public.moderation_actions is not permitted; the audit is append-only.', tg_op);
end;
$$;

comment on function public.moderation_actions_append_only() is
  'Trigger guard making public.moderation_actions append-only for all roles (42501 moderation_actions_append_only). Only FK set-null / cascade cleanup after a parent row is deleted is let through.';

revoke all on function public.moderation_actions_append_only() from public;

drop trigger if exists moderation_actions_append_only on public.moderation_actions;
create trigger moderation_actions_append_only
  before update or delete on public.moderation_actions
  for each row execute function public.moderation_actions_append_only();

-- ---------------------------------------------------------------------------
-- 4. admin_list_reports -- the queue
-- ---------------------------------------------------------------------------

-- Keyset cursor is (created_at desc, id desc): pass the last row's values back
-- as p_after_created_at / p_after_id. p_status 'all' returns every status.
-- Reports about the CALLING admin are never returned.
create or replace function public.admin_list_reports(
  p_status text default 'open',
  p_after_created_at timestamptz default null,
  p_after_id uuid default null,
  p_limit integer default 30
)
returns table (
  id uuid,
  reporter_id uuid,
  reporter_name text,
  reported_user_id uuid,
  reported_name text,
  reason text,
  status text,
  content_ref text,
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid := public.assert_admin_caller();
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
  v_status text := coalesce(p_status, 'open');
begin
  if v_status not in ('all', 'open', 'reviewed', 'dismissed', 'actioned') then
    raise exception using errcode = '22023', message = 'invalid_status_filter';
  end if;

  return query
  select r.id,
         r.reporter_id,
         rep.full_name,
         r.reported_user_id,
         acc.full_name,
         r.reason,
         r.status,
         r.content_ref,
         r.resolved_by,
         r.resolved_at,
         r.resolution_note,
         r.created_at
    from public.moderation_reports r
    left join public.profiles rep on rep.id = r.reporter_id
    left join public.profiles acc on acc.id = r.reported_user_id
   where (v_status = 'all' or r.status = v_status)
     and (v_admin is null or r.reported_user_id <> v_admin)
     and (
       p_after_created_at is null
       or (r.created_at, r.id) < (p_after_created_at, coalesce(p_after_id, '00000000-0000-0000-0000-000000000000'::uuid))
     )
   order by r.created_at desc, r.id desc
   limit v_limit;
end;
$$;

comment on function public.admin_list_reports(text, timestamptz, uuid, integer) is
  'Admin-only moderation queue, keyset-paginated on (created_at desc, id desc). p_status one of open/reviewed/dismissed/actioned/all. Reports filed against the calling admin are excluded. Errors: 42501 admin_required/mfa_required, 22023 invalid_status_filter.';

revoke all on function public.admin_list_reports(text, timestamptz, uuid, integer) from public;
grant execute on function public.admin_list_reports(text, timestamptz, uuid, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. review_report -- resolve a report and write the audit row
-- ---------------------------------------------------------------------------

create or replace function public.review_report(
  p_report uuid,
  p_status text,
  p_note text default null
)
returns table (report_id uuid, action_id uuid, status text)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid := public.assert_admin_caller();
  v_accused uuid;
  v_action_id uuid;
begin
  if p_report is null then
    raise exception using errcode = '22023', message = 'report_required';
  end if;

  if p_status not in ('reviewed', 'dismissed', 'actioned') then
    raise exception using errcode = '22023', message = 'invalid_status';
  end if;

  select r.reported_user_id into v_accused
    from public.moderation_reports r
   where r.id = p_report
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'report_not_found';
  end if;

  -- An admin never resolves a report filed against themselves.
  if v_admin is not null and v_accused = v_admin then
    raise exception using errcode = '42501', message = 'accused_cannot_review';
  end if;

  update public.moderation_reports r
     set status          = p_status,
         resolved_by     = v_admin,
         resolved_at     = now(),
         resolution_note = left(p_note, 2000)
   where r.id = p_report;

  insert into public.moderation_actions (admin_id, action, report_id, target_member, note)
  values (v_admin,
          case when p_status = 'dismissed' then 'dismiss' else 'warn' end,
          p_report, v_accused, left(p_note, 2000))
  returning id into v_action_id;

  report_id := p_report;
  action_id := v_action_id;
  status := p_status;
  return next;
end;
$$;

comment on function public.review_report(uuid, text, text) is
  'Admin-only: set a moderation report to reviewed/dismissed/actioned, stamp resolver fields and append a moderation_actions row (dismiss for dismissed, warn otherwise). Errors: 42501 admin_required/mfa_required/accused_cannot_review, P0002 report_not_found, 22023 invalid_status.';

revoke all on function public.review_report(uuid, text, text) from public;
grant execute on function public.review_report(uuid, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. remove_from_group
-- ---------------------------------------------------------------------------

create or replace function public.remove_from_group(
  p_group uuid,
  p_member uuid,
  p_report uuid default null,
  p_note text default null
)
returns table (removed boolean, action_id uuid)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid := public.assert_admin_caller();
  v_removed integer := 0;
  v_action_id uuid;
begin
  if p_group is null or p_member is null then
    raise exception using errcode = '22023', message = 'group_and_member_required';
  end if;

  if not exists (select 1 from public.groups g where g.id = p_group) then
    raise exception using errcode = 'P0002', message = 'group_not_found';
  end if;

  if p_report is not null
     and not exists (select 1 from public.moderation_reports r where r.id = p_report) then
    raise exception using errcode = 'P0002', message = 'report_not_found';
  end if;

  with gone as (
    delete from public.group_members gm
     where gm.group_id = p_group and gm.member_id = p_member
    returning 1
  )
  select count(*) into v_removed from gone;

  -- The audit row is written even when the membership was already gone: the
  -- decision happened, and a silent no-op would hide a moderator's action.
  insert into public.moderation_actions (admin_id, action, report_id, target_member, group_id, note)
  values (v_admin, 'remove_from_group', p_report, p_member, p_group, left(p_note, 2000))
  returning id into v_action_id;

  removed := v_removed > 0;
  action_id := v_action_id;
  return next;
end;
$$;

comment on function public.remove_from_group(uuid, uuid, uuid, text) is
  'Admin-only: delete a group membership and append a remove_from_group audit row (written even if the membership was already gone; removed=false then). Errors: 42501 admin_required/mfa_required, P0002 group_not_found / report_not_found, 22023 group_and_member_required.';

revoke all on function public.remove_from_group(uuid, uuid, uuid, text) from public;
grant execute on function public.remove_from_group(uuid, uuid, uuid, text) to anon, authenticated;
