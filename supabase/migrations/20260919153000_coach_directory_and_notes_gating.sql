-- ============================================================================
-- 20260919153000_coach_directory_and_notes_gating.sql
--
-- Two product decisions (2026-09-19), one migration:
--
--   1. COACH DIRECTORY. Members pick their own coach from a screen. The pick must
--      stay unforgeable: 20260919152000 made profiles.coach_id server-owned via
--      profiles_guard_privileged_columns(), and that stays true — the ONLY new way a
--      client can influence coach_id is public.choose_coach(), which validates the
--      target and writes the caller's own row and nothing else.
--
--   2. NOTES ARE SUBSCRIPTION-GATED. 20260919151000 recorded the opposite decision
--      ("notes are NOT subscription-gated"); the product owner has since reversed it.
--      Published workout notes, the recordings rows behind them, and the checklist
--      progress a member writes are now behind public.has_live_access() exactly like
--      live classes: active or grace, with coaches/admins ('staff') exempt.
--
-- ADDITIVE. Nothing earlier is edited. Three functions are re-created with
-- `create or replace` (profiles_guard_privileged_columns, can_read_published_notes,
-- can_read_workout_note) and five policies are replaced; each replacement restates
-- the original intent and is annotated with exactly what changed.
--
-- FUNCTION PRIVILEGES — the standing rule from common.md and every migration since
-- 20260919120000: `revoke all ... from public` ONLY. EXECUTE deliberately stays with
-- anon/authenticated (Supabase's default privileges grant it at CREATE time), because
-- on this Postgres 17.6 build a role calling a SECURITY DEFINER function it lacks
-- EXECUTE on SEGFAULTS the backend instead of raising 42501. The security boundary is
-- the gate INSIDE each body: auth.uid() is NULL for anon, so anon gets empty/false.
-- ============================================================================

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- 1. coach_profiles — the coach-authored half of a directory entry
-- ---------------------------------------------------------------------------

-- Array bounds cannot be expressed in a CHECK directly (a CHECK may not contain a
-- subquery, and unnest() needs one), so the rule lives in an IMMUTABLE helper, the same
-- pattern is_valid_note_checklist() uses in 20260919151000.
--
-- array_ndims('{}'::text[]) is NULL, not 1, hence the coalesce: the empty array — the
-- column default — must pass.
create or replace function public.is_valid_specialties(p_items text[])
returns boolean
language sql
immutable
as $$
  select p_items is null
      or (
        coalesce(array_ndims(p_items), 1) = 1
        and coalesce(array_length(p_items, 1), 0) <= 8
        and not exists (
          select 1
          from unnest(p_items) as s
          where s is null or btrim(s) = '' or char_length(s) > 30
        )
      );
$$;

comment on function public.is_valid_specialties(text[]) is
  'Validates coach_profiles.specialties: a 1-dimensional array of at most 8 non-empty entries of at most 30 characters each. NULL and the empty array are valid. Mirrored in TypeScript by validateSpecialties() in src/features/coaching/validators.ts.';

revoke all on function public.is_valid_specialties(text[]) from public;

create table if not exists public.coach_profiles (
  coach_id uuid primary key references public.profiles (id) on delete cascade,
  bio text,
  specialties text[] not null default '{}'::text[],
  accepting_members boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint coach_profiles_bio_bounds check (bio is null or char_length(bio) <= 500),
  constraint coach_profiles_specialties_bounds check (public.is_valid_specialties(specialties))
);

comment on table public.coach_profiles is
  'Directory entry a coach writes about themselves. Read by members only through list_coaches() / get_my_coach() (SECURITY DEFINER); the table itself is self-only for coaches and admins.';
comment on column public.coach_profiles.accepting_members is
  'When false the coach is hidden from nobody but cannot be newly chosen: choose_coach() raises coach_not_accepting. A member who already has this coach keeps them.';

alter table public.coach_profiles enable row level security;

-- Plain trigger function (not SECURITY DEFINER), mirroring subscriptions_touch_updated_at.
create or replace function public.coach_profiles_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.coach_profiles_touch_updated_at() from public;

drop trigger if exists coach_profiles_touch_updated_at on public.coach_profiles;
create trigger coach_profiles_touch_updated_at
  before update on public.coach_profiles
  for each row execute function public.coach_profiles_touch_updated_at();

-- A coach/admin reads and writes exactly one row: their own. Members are given NOTHING
-- here — every member-facing read goes through list_coaches() / get_my_coach(), which
-- project only the four directory columns and never touch profiles.email or anything
-- else. is_coach_or_admin() reads the (unforgeable since 20260919152000) server-side
-- role, so a demoted coach loses write access immediately, matching R2-6/R3-2.
--
-- `coach_id = auth.uid()` is a DIRECT column arm with no self-query, so
-- `insert ... returning` (supabase-js `.upsert().select()`, which
-- src/features/coaching/api.ts saveMyCoachProfile uses) evaluates cleanly against the
-- statement's own snapshot — the R2-4 / R2-5 defect does not apply here.
drop policy if exists "coach_profiles_select_self_staff" on public.coach_profiles;
create policy "coach_profiles_select_self_staff"
  on public.coach_profiles for select
  to authenticated
  using (coach_id = auth.uid() and public.is_coach_or_admin());

drop policy if exists "coach_profiles_insert_self_staff" on public.coach_profiles;
create policy "coach_profiles_insert_self_staff"
  on public.coach_profiles for insert
  to authenticated
  with check (coach_id = auth.uid() and public.is_coach_or_admin());

drop policy if exists "coach_profiles_update_self_staff" on public.coach_profiles;
create policy "coach_profiles_update_self_staff"
  on public.coach_profiles for update
  to authenticated
  using (coach_id = auth.uid() and public.is_coach_or_admin())
  with check (coach_id = auth.uid() and public.is_coach_or_admin());

drop policy if exists "coach_profiles_delete_self_staff" on public.coach_profiles;
create policy "coach_profiles_delete_self_staff"
  on public.coach_profiles for delete
  to authenticated
  using (coach_id = auth.uid() and public.is_coach_or_admin());

-- ---------------------------------------------------------------------------
-- 2. The directory RPCs
-- ---------------------------------------------------------------------------

-- Every coach on the platform, for an authenticated caller. Admins are deliberately NOT
-- listed: `admin` is a platform role, not a product one, and nobody should be able to
-- pick one as their coach.
--
-- SECURITY DEFINER because profiles' SELECT policy (self / own members / admin) hides
-- every other coach from a member. The projection is the whole security story: id,
-- full_name and the coach's own directory copy — never email, never coach_id chains,
-- never another member's identity. member_count is an aggregate, so it discloses a
-- count, not a roster.
create or replace function public.list_coaches()
returns table (
  coach_id uuid,
  full_name text,
  bio text,
  specialties text[],
  accepting_members boolean,
  member_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.full_name,
    cp.bio,
    coalesce(cp.specialties, '{}'::text[]),
    coalesce(cp.accepting_members, true),
    (
      select count(*)
      from public.profiles m
      where m.coach_id = p.id and m.role = 'member'
    )::integer
  from public.profiles p
  left join public.coach_profiles cp on cp.coach_id = p.id
  where auth.uid() is not null
    and p.role = 'coach'
  order by p.full_name;
$$;

comment on function public.list_coaches() is
  'The coach directory: one row per profiles.role = ''coach'' (admins excluded), ordered by full_name, with the coach''s own bio/specialties/accepting_members and a count of their members. Authenticated callers only; anon gets zero rows.';

revoke all on function public.list_coaches() from public;

-- The caller's own coach. A member cannot read their coach's profiles row directly
-- (profiles_select_self_or_coach_or_admin only admits self / own members / admin), so
-- this projects the same directory columns as list_coaches, minus the member count.
create or replace function public.get_my_coach()
returns table (
  coach_id uuid,
  full_name text,
  bio text,
  specialties text[],
  accepting_members boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.full_name,
    cp.bio,
    coalesce(cp.specialties, '{}'::text[]),
    coalesce(cp.accepting_members, true)
  from public.profiles me
  join public.profiles c on c.id = me.coach_id
  left join public.coach_profiles cp on cp.coach_id = c.id
  where auth.uid() is not null
    and me.id = auth.uid();
$$;

comment on function public.get_my_coach() is
  'The calling member''s chosen coach as a single directory row, or zero rows when they have none (or are signed out).';

revoke all on function public.get_my_coach() from public;

-- ---------------------------------------------------------------------------
-- 3. choose_coach() and the narrow hole it needs in the profiles guard
-- ---------------------------------------------------------------------------

-- THE PROBLEM. profiles_guard_privileged_columns() (20260919152000) refuses any change
-- to profiles.coach_id unless is_privileged_writer() — and is_privileged_writer() reads
-- the `role` GUC, which PostgREST sets to 'authenticated' and which a SECURITY DEFINER
-- function does NOT change. So choose_coach() would be refused by the very trigger that
-- makes coach assignment trustworthy.
--
-- THE SMALLEST SAFE CHANGE. `current_user`, unlike the role GUC, DOES change: inside a
-- SECURITY DEFINER function it is the function's OWNER, and a BEFORE UPDATE trigger
-- function that is SECURITY INVOKER (which profiles_guard_privileged_columns is) sees
-- that same owner. So "we are executing inside a privileged-owner SECURITY DEFINER
-- function" is expressible, and it is not something a client can fake: PostgREST and
-- storage-api execute client statements as `authenticated` / `anon`, and neither role
-- can SET ROLE to postgres.
--
-- On its own that would open the door to any future SECURITY DEFINER function owned by
-- postgres, so it is paired with a transaction-local GUC naming the exact row being
-- assigned. Both conditions must hold:
--
--     current_user in (postgres, supabase_admin, service_role)   <- unfakeable by a client
--     app.coach_choice_member = the row's own id                 <- scopes it to ONE row
--
-- choose_coach() sets that GUC to auth.uid() immediately before its UPDATE and clears it
-- immediately after, so even inside the same transaction the window covers one statement
-- and one row — the caller's own.
--
-- What is NOT changed: role and id stay frozen for every non-privileged writer, a direct
-- `update profiles set coach_id = …` from a client still raises 42501 (current_user is
-- 'authenticated' there), and the privileged-writer fast path is untouched, so
-- supabase/seed.sql and service-role tooling behave exactly as before.
--
-- SECURITY INVOKER on purpose (SECURITY DEFINER would pin current_user to the owner and
-- make the check a tautology), search_path pinned to pg_catalog like its caller.
create or replace function public.is_coach_assignment_context(p_member uuid)
returns boolean
language sql
stable
set search_path = pg_catalog
as $$
  select coalesce(
           p_member is not null
           and current_user in ('postgres', 'supabase_admin', 'service_role')
           and nullif(current_setting('app.coach_choice_member', true), '') = p_member::text,
           false);
$$;

comment on function public.is_coach_assignment_context(uuid) is
  'True only while public.choose_coach() is assigning THIS member''s coach: requires both a privileged current_user (i.e. we are inside a SECURITY DEFINER function owned by postgres/supabase_admin/service_role, which PostgREST clients never are) and the transaction-local app.coach_choice_member GUC naming this exact member. The single hole in profiles_guard_privileged_columns'' coach_id freeze.';

revoke all on function public.is_coach_assignment_context(uuid) from public;

-- REPLACES profiles_guard_privileged_columns() from 20260919152000. Identical except for
-- the `and not public.is_coach_assignment_context(new.id)` conjunct on the coach_id arm.
-- role and id remain absolutely frozen; the privileged-writer fast path is byte-for-byte
-- the same.
create or replace function public.profiles_guard_privileged_columns()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if public.is_privileged_writer() then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'profiles.role is assigned server-side; it cannot be changed by the account itself'
      using errcode = '42501';
  end if;

  -- The one sanctioned client-initiated coach_id write is public.choose_coach(), which
  -- validated the target and is assigning the caller's OWN row. Everything else — a
  -- direct PostgREST update, a member editing someone else's row, any other statement —
  -- still fails here, because current_user is 'authenticated' outside that function.
  if new.coach_id is distinct from old.coach_id
     and not public.is_coach_assignment_context(new.id) then
    raise exception 'profiles.coach_id is assigned server-side; it cannot be changed by the account itself'
      using errcode = '42501';
  end if;

  if new.id is distinct from old.id then
    raise exception 'profiles.id cannot be changed' using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.profiles_guard_privileged_columns() is
  'BEFORE UPDATE guard: only postgres / supabase_admin / service_role may change profiles.role or profiles.id, and coach_id additionally only through public.choose_coach() (see is_coach_assignment_context). Members may still edit benign columns (full_name, avatar_url).';

revoke all on function public.profiles_guard_privileged_columns() from public;

-- The trigger itself is unchanged and already installed by 20260919152000; re-created
-- here only so a from-scratch reset does not depend on statement ordering subtleties.
drop trigger if exists profiles_guard_privileged_columns on public.profiles;
create trigger profiles_guard_privileged_columns
  before update on public.profiles
  for each row execute function public.profiles_guard_privileged_columns();

-- A member chooses (or changes) their coach.
--
-- Errors are raised with errcode P0001 and a MACHINE-READABLE message, because that pair
-- is what PostgREST forwards and what mapChooseCoachError() in
-- src/features/coaching/api.ts switches on. Anything else there becomes 'unknown'.
--
--   not_authenticated   -- anon
--   not_a_member        -- the caller is a coach, an admin, or has no profile row
--   coach_not_found     -- the target is missing, is not role 'coach' (so: self, another
--                          member, an admin, a random uuid), or is NULL
--   coach_not_accepting -- the target is a coach who has closed their books
--
-- Re-choosing the CURRENT coach is a no-op success and is checked before the accepting
-- test on purpose: a member must not be told "not accepting" about the coach they
-- already have, and an idempotent retry from a flaky mobile connection must succeed.
create or replace function public.choose_coach(p_coach_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller       uuid := auth.uid();
  v_caller_role  text;
  v_current      uuid;
  v_target_role  text;
  v_accepting    boolean;
begin
  if v_caller is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select p.role, p.coach_id
    into v_caller_role, v_current
    from public.profiles p
   where p.id = v_caller;

  if v_caller_role is distinct from 'member' then
    raise exception 'not_a_member' using errcode = 'P0001';
  end if;

  if p_coach_id is null then
    raise exception 'coach_not_found' using errcode = 'P0001';
  end if;

  select p.role, coalesce(cp.accepting_members, true)
    into v_target_role, v_accepting
    from public.profiles p
    left join public.coach_profiles cp on cp.coach_id = p.id
   where p.id = p_coach_id;

  if v_target_role is distinct from 'coach' then
    raise exception 'coach_not_found' using errcode = 'P0001';
  end if;

  if v_current is not null and v_current = p_coach_id then
    return;
  end if;

  if not v_accepting then
    raise exception 'coach_not_accepting' using errcode = 'P0001';
  end if;

  -- The guard trigger's one sanctioned window: this statement, this row.
  perform set_config('app.coach_choice_member', v_caller::text, true);
  update public.profiles set coach_id = p_coach_id where id = v_caller;
  perform set_config('app.coach_choice_member', '', true);
end;
$$;

comment on function public.choose_coach(uuid) is
  'A member assigns themselves to a coach who is accepting members. Writes only the caller''s own profiles.coach_id, through the single sanctioned window in profiles_guard_privileged_columns. Raises P0001 not_authenticated / not_a_member / coach_not_found / coach_not_accepting.';

revoke all on function public.choose_coach(uuid) from public;

-- ---------------------------------------------------------------------------
-- 4. Notes are subscription-gated
-- ---------------------------------------------------------------------------

-- REPLACES can_read_published_notes() from 20260919151000. Intent unchanged — "the
-- caller is a MEMBER coached by this recording's coach" — with the product's new
-- entitlement conjunct: that member must also currently have live access (active or
-- grace; staff are exempt inside has_live_access itself).
--
-- This is the CHOKE POINT: all three member-facing paths to note content go through it
--   * recordings_select_coach_or_published_member (the published-recording arm)
--   * workout_notes_select_coach_or_published_member (the published-note arm)
--   * can_read_workout_note() (which gates workout_note_progress writes)
-- and each of those also states the conjunct explicitly below, so a future reader of any
-- one policy sees the rule without having to open this function.
--
-- has_live_access(auth.uid()) is self-directed, so subscription_state_row's visibility
-- gate always admits it; for anon, auth.uid() is NULL, the existing null-uid gate short
-- circuits first, and has_live_access(NULL) is false anyway. No coach path runs through
-- here (coaches reach notes via can_manage_recording), so no coach loses anything.
create or replace function public.can_read_published_notes(p_recording uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and public.has_live_access(auth.uid())
     and exists (
       select 1
       from public.profiles p
       where p.id = auth.uid()
         and p.coach_id is not null
         and p.coach_id = public.recording_coach_id(p_recording)
     );
$$;

comment on function public.can_read_published_notes(uuid) is
  'True when the caller is a member coached by the recording''s coach AND currently has live access (active / grace / staff). Gates published notes only; grants nothing about drafts, transcripts or the storage object. Subscription gating added 2026-09-19 by product decision, reversing the note in 20260919151000.';

revoke all on function public.can_read_published_notes(uuid) from public;

-- REPLACES can_read_workout_note() from 20260919151000. Same two arms; the member arm
-- now spells out the entitlement conjunct that can_read_published_notes also enforces.
create or replace function public.can_read_workout_note(p_note uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workout_notes wn
    where wn.id = p_note
      and (
        public.can_manage_recording(wn.recording_id)
        or (
          wn.published_at is not null
          and public.has_live_access(auth.uid())
          and public.can_read_published_notes(wn.recording_id)
        )
      )
  );
$$;

comment on function public.can_read_workout_note(uuid) is
  'True when the caller may see the note: its coach, or one of that coach''s members with live access once it is published.';

revoke all on function public.can_read_workout_note(uuid) from public;

-- REPLACES recordings_select_coach_or_published_member (20260919151000). Intent kept
-- exactly (uploader / managing coach / published-to-my-members); the member arm gains
-- the subscription conjunct. Both coach arms are untouched, so a coach never loses a row.
drop policy if exists "recordings_select_coach_or_published_member" on public.recordings;
create policy "recordings_select_coach_or_published_member"
  on public.recordings for select
  to authenticated
  using (
    uploaded_by = auth.uid()
    or public.can_manage_recording(recordings.id)
    or (
      status = 'published'
      and public.has_live_access(auth.uid())
      and public.can_read_published_notes(recordings.id)
    )
  );

-- REPLACES workout_notes_select_coach_or_published_member (20260919151000). Same shape:
-- coach arm untouched, member arm gated. This is the policy that actually withholds note
-- CONTENT (draft_content / edited_content) from a lapsed member.
drop policy if exists "workout_notes_select_coach_or_published_member" on public.workout_notes;
create policy "workout_notes_select_coach_or_published_member"
  on public.workout_notes for select
  to authenticated
  using (
    public.can_manage_recording(workout_notes.recording_id)
    or (
      published_at is not null
      and public.has_live_access(auth.uid())
      and public.can_read_published_notes(workout_notes.recording_id)
    )
  );

-- workout_note_progress: ticking a checklist item is part of the paid product, so
-- INSERT / UPDATE / DELETE need live access. SELECT of one's OWN rows deliberately stays
-- open — a lapsed member still sees what they already completed (and the UI needs it to
-- render the read-only checklist), which discloses nothing beyond their own history.
--
-- REPLACES the three write policies from 20260919151000; every original conjunct is kept
-- verbatim and one is added, so each is strictly narrower.
drop policy if exists "workout_note_progress_insert_self" on public.workout_note_progress;
create policy "workout_note_progress_insert_self"
  on public.workout_note_progress for insert
  to authenticated
  with check (
    member_id = auth.uid()
    and public.has_live_access(auth.uid())
    and public.can_read_workout_note(note_id)
  );

drop policy if exists "workout_note_progress_update_self" on public.workout_note_progress;
create policy "workout_note_progress_update_self"
  on public.workout_note_progress for update
  to authenticated
  using (member_id = auth.uid() and public.has_live_access(auth.uid()))
  with check (
    member_id = auth.uid()
    and public.has_live_access(auth.uid())
    and public.can_read_workout_note(note_id)
  );

drop policy if exists "workout_note_progress_delete_self" on public.workout_note_progress;
create policy "workout_note_progress_delete_self"
  on public.workout_note_progress for delete
  to authenticated
  using (member_id = auth.uid() and public.has_live_access(auth.uid()));

-- workout_note_progress_select_self (member_id = auth.uid()) is intentionally NOT
-- touched; restated here so the omission reads as a decision rather than an oversight.
