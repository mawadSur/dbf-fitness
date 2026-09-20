-- ============================================================================
-- 20260919154000_account_deletion.sql
--
-- IN-APP ACCOUNT DELETION (Apple App Store guideline 5.1.1(v), product decision
-- 2026-09-20): a signed-in user must be able to permanently delete their own
-- account and personal data from inside the app.
--
-- The delete itself is performed by the `delete-account` Edge Function with the
-- service role: it removes the user's Storage objects and then calls
-- auth.admin.deleteUser(), which is a `delete from auth.users` — everything in
-- public.* has to fall out of that ONE delete through foreign keys. This
-- migration is the SQL half of that guarantee.
--
-- ADDITIVE. No earlier migration is edited, no policy is weakened, and no row is
-- touched. Three functions are created below (is_account_deletion_context,
-- workout_completions_guard_client_writes, profiles_release_before_delete); none
-- of them has EXECUTE revoked from anon/authenticated, per the "never REVOKE
-- EXECUTE" rule in common.md.
--
-- ---------------------------------------------------------------------------
-- FK INVENTORY (pg_constraint, every FK whose parent is auth.users or
-- public.profiles) and the ON DELETE action each one ends up with. Nothing is
-- `restrict` or `no action`, so nothing BLOCKS the delete; the audit below is
-- about what is LEFT BEHIND.
--
--   -> auth.users (GoTrue's own, untouched, all cascade)
--     auth.identities.user_id, auth.sessions.user_id, auth.mfa_factors.user_id,
--     auth.one_time_tokens.user_id, auth.oauth_authorizations.user_id,
--     auth.oauth_consents.user_id, auth.webauthn_challenges.user_id,
--     auth.webauthn_credentials.user_id                           ... cascade
--     public.profiles.id                                          ... cascade
--
--   -> public.profiles  (cascade = the row is the user's own data)
--     coach_profiles.coach_id, diet_checkins.member_id,
--     diet_plan_assignments.member_id, diet_plans.coach_id,
--     group_members.member_id, live_class_participants.member_id,
--     live_classes.coach_id, milestones.member_id,
--     moderation_reports.reporter_id, moderation_reports.reported_user_id,
--     push_tokens.user_id, recordings.uploaded_by, subscriptions.member_id,
--     user_blocks.blocker_id, user_blocks.blocked_id,
--     workout_completions.member_id, workout_note_progress.member_id,
--     workout_plans.coach_id, workout_plans.member_id             ... cascade
--
--   -> public.profiles  (set null = the row is ANOTHER user's data that merely
--      names this one; deleting it would destroy a bystander's history)
--     profiles.coach_id            ... set null  (the coach's members simply see
--                                   "Choose your coach" again — the product rule)
--     workout_completions.scored_by ... set null (this CONSTRAINT only drops the
--                                   coach's attribution. Read it with the blast
--                                   radius below before concluding the member
--                                   keeps the row: when the deleted coach also
--                                   AUTHORED the plan the completion hangs off,
--                                   workout_plans.coach_id -> cascade deletes the
--                                   completion outright and this SET NULL never
--                                   gets to run. Only a completion on ANOTHER
--                                   coach's plan actually survives.)
--     workout_notes.created_by      ... set null (a note hangs off a recording;
--                                   the coach's own notes are already removed by
--                                   recordings.uploaded_by -> cascade ->
--                                   workout_notes.recording_id -> cascade)
--
--   -> public.profiles  (CHANGED BY THIS MIGRATION)
--     groups.created_by  set null  ->  CASCADE                    (see below)
--
-- Second-order cascades reached from the rows above, for completeness:
--   live_classes -> live_class_participants (cascade), -> recordings.live_class_id
--   (set null; the recording itself is already gone via uploaded_by when the coach
--   uploaded it); recordings -> transcripts, workout_notes (cascade);
--   workout_notes -> workout_note_progress (cascade); workout_plans ->
--   workout_days -> exercises (cascade); workout_completions ->
--   exercise_completions (cascade); diet_plans -> diet_items ->
--   diet_checkins (cascade); groups -> group_members (cascade).
--
-- BLAST RADIUS ONTO OTHER USERS' ROWS (added 2026-09-20 after review; the
-- inventory above described each constraint in isolation and read as though a
-- coach's departure only ever cost a coach their own rows — it does not).
-- Deleting a COACH removes, for every one of their members:
--   * workout_plans the coach authored (coach_id -> cascade), and with them
--     workout_days, exercises, the MEMBER's workout_completions on those days
--     and their exercise_completions;
--   * diet_plans the coach authored (coach_id -> cascade), and with them
--     diet_items, the MEMBER's diet_checkins and diet_plan_assignments;
--   * workout_notes off the coach's recordings, and with them the MEMBER's
--     workout_note_progress;
--   * live_class_participants rows for the coach's classes;
--   * group_members rows for groups the coach created (via the cascade this
--     migration introduces below).
-- In other words a member keeps only what is keyed to them independently of
-- that coach: their profile (coach_id -> null), subscription, milestones,
-- push_tokens, and plans/completions/check-ins authored by a DIFFERENT coach.
--
-- This is the pre-existing schema's behaviour (114448 / 114449), not something
-- account deletion introduced, and it is NOT changed here: workout_plans.coach_id
-- and diet_plans.coach_id are NOT NULL, so "keep the plan, drop the authorship"
-- would need a nullable column plus a policy rewrite in those migrations — well
-- outside account deletion. What IS fixed here is that the behaviour was
-- undocumented and undisclosed: the constraint comments below record it in the
-- catalog, supabase/tests/database/20_account_deletion.test.sql section D
-- asserts it row by row, and the coach's delete-account panel
-- (src/features/account/deleteAccount.ts) now says it out loud before the user
-- confirms.
--
-- NOT reachable by any FK, and therefore the Edge Function's job:
--   storage.objects.owner / storage.objects.owner_id hold a user id with NO
--   foreign key to auth.users, so a plain `delete from auth.users` leaves both
--   the rows and the stored bytes behind (verified: after deleting a coach with
--   one recordings object, storage.objects.owner still matched their uuid).
--   Direct DELETE on storage.objects is blocked by storage.protect_delete(), so
--   delete-account removes the `<uid>/` prefix through the Storage API BEFORE it
--   deletes the auth user, and refuses to delete the user if that fails.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- groups.created_by: set null -> cascade
--
-- Product rule for a deleting COACH: "their live classes / participants /
-- recordings / transcripts / workout notes / coach_profiles / groups they
-- created are removed". With `set null` the group survived as an ownerless row
-- that nobody can rename, moderate or delete (groups_update_owner and
-- groups_delete_owner both require created_by = auth.uid()), while still being
-- visible to its members through is_fellow_group_member() — an orphan no
-- operator inside the app can clean up.
--
-- Cascading instead removes the group and, through
-- group_members_group_id_fkey (already cascade), its membership rows. That does
-- touch other members' group_members rows; it is the intended consequence the
-- deletion UI warns about ("N members will lose access to your classes and
-- notes"). No member content is lost: a group holds no posts, and every other
-- table a member owns keys off profiles.id, not off the group.
--
-- The constraint is dropped and recreated (Postgres has no ALTER CONSTRAINT for
-- ON DELETE), keeping the same name, column and parent. Nothing else about the
-- table, its RLS or its policies changes.
-- ---------------------------------------------------------------------------
alter table public.groups
  drop constraint if exists groups_created_by_fkey;

alter table public.groups
  add constraint groups_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete cascade;

comment on constraint groups_created_by_fkey on public.groups is
  'ON DELETE CASCADE since 20260919154000: deleting a coach account removes the groups they created (and their memberships) instead of leaving an unowned, unmanageable group behind.';

-- ---------------------------------------------------------------------------
-- Documenting (NOT changing) the two pre-existing cascades that make account
-- deletion cost a coach's MEMBERS their own history. COMMENT only: no
-- constraint is dropped, recreated or re-pointed here, and no row is touched.
-- These sat unlabelled in 114448 / 114449, which is how the FK inventory at the
-- top of this file came to describe the SET NULL on workout_completions.scored_by
-- as if the member's completion always survived. Anyone who reads the catalog
-- before changing account deletion now sees the real consequence.
-- ---------------------------------------------------------------------------
comment on constraint workout_plans_coach_id_fkey on public.workout_plans is
  'ON DELETE CASCADE (since 20260919114448). Deleting the AUTHORING coach deletes the plan, its workout_days/exercises, and through workout_days the MEMBER''s own workout_completions and exercise_completions - so workout_completions_scored_by_fkey''s SET NULL only preserves a completion when the plan was written by a DIFFERENT coach. Documented (not changed) by 20260919154000; disclosed to the coach by the delete-account panel.';

comment on constraint diet_plans_coach_id_fkey on public.diet_plans is
  'ON DELETE CASCADE (since 20260919114449). Deleting the AUTHORING coach deletes the diet plan, its diet_items, and through diet_items the MEMBER''s own diet_checkins, plus their diet_plan_assignments. Documented (not changed) by 20260919154000; disclosed to the coach by the delete-account panel.';

-- ---------------------------------------------------------------------------
-- Making the cascade DETERMINISTIC (a real failure, reproduced on this database)
--
-- Deleting a coach who had scored one of their own plan's workouts aborted the
-- whole delete:
--
--   ERROR: insert or update on table "workout_completions" violates foreign key
--          constraint "workout_completions_workout_day_id_fkey"
--   DETAIL: Key (workout_day_id)=(…) is not present in table "workout_days".
--
-- The row was the target of TWO referential actions at once: a cascade DELETE
-- (profiles -> workout_plans -> workout_days -> workout_completions) and a SET
-- NULL (workout_completions.scored_by). Postgres does not order the RI queue
-- between different constraints, so the SET NULL fired as an UPDATE on a row
-- whose workout_days parent the cascade had already removed, and the UPDATE's
-- own FK recheck failed. Nothing is wrong with either constraint on its own —
-- it is the combination, and it made account deletion fail for exactly the
-- coaches most likely to use it.
--
-- The same shape exists twice more:
--   workout_notes   is cascade-deleted through recordings while
--                   workout_notes.created_by wants a SET NULL, and
--   recordings      is cascade-deleted through uploaded_by while
--                   recordings.live_class_id wants a SET NULL from the coach's
--                   live_classes going away.
--
-- Fix: a BEFORE DELETE trigger on profiles that drops those references FIRST,
-- while every other row is still present, so no SET NULL is left to race a
-- cascade. It removes work from the RI queue; it never removes anything the
-- foreign keys would have kept.
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- ...and the second failure the same trigger has to fix: a coach with members
-- could not be deleted AT ALL.
--
-- GoTrue's admin delete runs `delete from auth.users` as supabase_auth_admin.
-- The cascade reaches profiles, and profiles_coach_id_fkey's SET NULL issues
--     UPDATE public.profiles SET coach_id = NULL WHERE <coach> = coach_id
-- which lands on profiles_guard_privileged_columns (20260919152000). That guard
-- exempts only is_privileged_writer() — postgres / supabase_admin / service_role
-- by `current_setting('role')` or session_user — and supabase_auth_admin is none
-- of them, so every such delete died with:
--     ERROR: profiles.coach_id is assigned server-side; it cannot be changed by
--            the account itself  (42501)
-- Reproduced over HTTP: a coach with two members got 500 delete_failed while a
-- coach with none succeeded.
--
-- The guard is NOT weakened to fix this — it keeps rejecting every client write
-- exactly as before. Instead the release is done here, through the ONE path
-- 20260919153000 already sanctioned for a server-side coach_id write:
-- is_coach_assignment_context(member), which requires current_user to be
-- postgres/supabase_admin/service_role AND `app.coach_choice_member` to name
-- the row being written. Inside this SECURITY DEFINER function current_user IS
-- postgres (the owner), so the sanctioned path applies — and "the coach was
-- deleted, so this member now has no coach" is precisely a server-side coach
-- assignment. The GUC is set per member, is transaction-local, and is restored
-- afterwards so the sanctioned context cannot leak into the rest of the
-- transaction. Once coach_id is already null the RI SET NULL matches no rows
-- and never reaches the guard.
-- ---------------------------------------------------------------------------
-- ...and the THIRD failure, found by review on 2026-09-20: the same
-- supabase_auth_admin problem, one table over.
--
-- `update public.workout_completions set scored_by = null` (below) lands on
-- workout_completions_guard_client_writes (20260919152300), whose only bypass is
-- is_privileged_writer(). That function reads `current_setting('role')` /
-- `session_user`, and NEITHER changes inside a SECURITY DEFINER function, so the
-- release trigger runs with current_user = postgres but role/session_user still
-- supabase_auth_admin — not privileged. Every coach who had ever scored one of
-- their members' workouts (app/effort-review.tsx) therefore got:
--     ERROR: workout_completions.effort_score / scored_by are set by the
--            member's coach  (42501)
-- and the HTTP call returned 500 delete_failed. Reproduced as supabase_auth_admin
-- against this database.
--
-- Two hypotheses were tested and REJECTED before the fix below:
--   * `perform set_config('role','postgres',true)` inside the trigger:
--       ERROR: cannot set parameter "role" within security-definer function
--     and from the session directly:
--       ERROR: permission denied to set role "service_role"
--     (SET ROLE is checked against the SESSION user, which is supabase_auth_admin
--     and is a member of nothing.)
--   * deleting the explicit UPDATE and letting the plain ON DELETE SET NULL do
--     it: Postgres runs an RI action as the referencing table's OWNER but leaves
--     the role GUC / session_user alone, so the guard fires there too and the
--     delete fails identically. The explicit UPDATE is not the cause.
--
-- Fix: the same shape 20260919153000 already uses for the coach_id freeze — a
-- transaction-local GUC plus a context predicate that a client can never satisfy
-- — and an exemption in the guard that is the narrowest statement that unblocks
-- the delete.
-- ---------------------------------------------------------------------------
create or replace function public.is_account_deletion_context(p_user uuid)
returns boolean
language sql
stable
set search_path = pg_catalog
as $$
  select coalesce(
           p_user is not null
           and current_user in ('postgres', 'supabase_admin', 'service_role')
           and nullif(current_setting('app.deleting_account', true), '') = p_user::text,
           false);
$$;

comment on function public.is_account_deletion_context(uuid) is
  'True only while public.profiles_release_before_delete() is erasing THIS user: requires both a privileged current_user (i.e. we are inside a SECURITY DEFINER function owned by postgres/supabase_admin/service_role, which PostgREST clients never are) and the transaction-local app.deleting_account GUC naming this exact user. Mirrors is_coach_assignment_context; added by 20260919154000.';

-- SECURITY INVOKER on purpose (a DEFINER function would pin current_user to the
-- owner and make the current_user test a tautology), search_path pinned to
-- pg_catalog like its sibling. EXECUTE deliberately stays with anon/authenticated
-- (common.md: revoking it segfaults this Postgres 17.6 build); the function
-- returns false for them and leaks nothing.
revoke all on function public.is_account_deletion_context(uuid) from public;

-- REPLACES workout_completions_guard_client_writes() from 20260919152300.
-- IDENTICAL to that version except for the single `is_account_deletion_context`
-- early exit marked below. No migration after 20260919152300 redefines this
-- function, so this is the live definition; anyone changing the guard must change
-- it HERE (the later file wins).
create or replace function public.workout_completions_guard_client_writes()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_is_coach boolean;
begin
  if public.is_privileged_writer() then
    return new;
  end if;

  -- ADDED BY 20260919154000. Account deletion: profiles_release_before_delete()
  -- must drop a departing coach's attribution from OTHER members' completions,
  -- and GoTrue runs that delete as supabase_auth_admin (see the block above).
  -- Narrow on purpose: an UPDATE that ONLY nulls scored_by, only for the exact
  -- account named by app.deleting_account, and only while current_user is
  -- postgres/supabase_admin/service_role. is_account_deletion_context() is
  -- evaluated last so the ordinary client path does not pay for it.
  if tg_op = 'UPDATE'
     and new.scored_by is null
     and old.scored_by is not null
     and new.member_id is not distinct from old.member_id
     and new.workout_day_id is not distinct from old.workout_day_id
     and new.completed_at is not distinct from old.completed_at
     and new.effort_score is not distinct from old.effort_score
     and public.is_account_deletion_context(old.scored_by) then
    return new;
  end if;

  v_is_coach := public.is_coach_or_admin() and public.is_coach_of_workout_day(new.workout_day_id);

  -- completed_at is a server clock, always. A client value is simply ignored on insert, and the
  -- column is frozen afterwards.
  if tg_op = 'INSERT' then
    new.completed_at := now();
  elsif new.completed_at is distinct from old.completed_at then
    raise exception 'workout_completions.completed_at is set by the server'
      using errcode = '42501';
  end if;

  -- R3-1: the owner of a completion is frozen for EVERY non-privileged caller, coach
  -- included. Previously this lived inside the `not v_is_coach` branch below, which let a
  -- coach hand their member's completion (and the milestone it earns) to a stranger.
  if tg_op = 'UPDATE' and new.member_id is distinct from old.member_id then
    raise exception 'workout_completions rows cannot be moved to another member'
      using errcode = '42501';
  end if;

  if not v_is_coach then
    if tg_op = 'INSERT' then
      if new.effort_score is not null or new.scored_by is not null then
        raise exception 'workout_completions.effort_score / scored_by are set by the member''s coach'
          using errcode = '42501';
      end if;
    else
      if new.effort_score is distinct from old.effort_score
         or new.scored_by is distinct from old.scored_by then
        raise exception 'workout_completions.effort_score / scored_by are set by the member''s coach'
          using errcode = '42501';
      end if;
      if new.workout_day_id is distinct from old.workout_day_id then
        raise exception 'workout_completions rows cannot be moved to another day'
          using errcode = '42501';
      end if;
    end if;
  elsif new.scored_by is not null and new.scored_by <> auth.uid() then
    -- A coach scores as themselves; they may not attribute the score to another coach.
    raise exception 'workout_completions.scored_by must be the scoring coach'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.workout_completions_guard_client_writes() is
  'Keeps completed_at server-side, freezes member_id for every non-privileged caller (coach included), and confines effort_score / scored_by to the coach of the day''s plan (who must score as themselves). Since 20260919154000 it also lets profiles_release_before_delete() null out a departing account''s scored_by (is_account_deletion_context), which GoTrue runs as supabase_auth_admin.';

revoke all on function public.workout_completions_guard_client_writes() from public;

create or replace function public.profiles_release_before_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saved text := coalesce(current_setting('app.coach_choice_member', true), '');
  v_saved_deleting text := coalesce(current_setting('app.deleting_account', true), '');
  v_member uuid;
begin
  -- Members of a coach who is leaving: coach_id -> null, one row at a time so
  -- the sanctioned context names exactly the row being written and nothing else.
  for v_member in select id from public.profiles where coach_id = old.id loop
    perform set_config('app.coach_choice_member', v_member::text, true);
    update public.profiles set coach_id = null where id = v_member;
  end loop;
  perform set_config('app.coach_choice_member', v_saved, true);

  -- Attribution on OTHER users' rows. The member keeps their completion and the
  -- note keeps its text; only the departing user's name comes off, which is what
  -- workout_completions_scored_by_fkey / workout_notes_created_by_fkey already
  -- say ON DELETE SET NULL. Doing it here just makes the timing deterministic.
  -- workout_notes has no write guard, so this one needs no context.
  update public.workout_notes set created_by = null where created_by = old.id;

  -- workout_completions DOES have one (workout_completions_guard_client_writes),
  -- and the delete arrives as supabase_auth_admin, so name the account being
  -- erased for exactly the length of this statement and put the GUC back.
  perform set_config('app.deleting_account', old.id::text, true);
  update public.workout_completions set scored_by = null where scored_by = old.id;
  perform set_config('app.deleting_account', v_saved_deleting, true);

  -- The user's OWN recordings, which recordings_uploaded_by_fkey deletes anyway.
  -- Removing them here takes their transcripts and notes with them in one
  -- ordered step instead of racing live_classes -> recordings.live_class_id.
  delete from public.recordings where uploaded_by = old.id;

  return old;
end;
$$;

-- Standing rule from common.md and every migration since 20260919120000:
-- `revoke all ... from public` ONLY. EXECUTE deliberately stays with
-- anon/authenticated, because on this Postgres 17.6 build a role calling a
-- SECURITY DEFINER function it lacks EXECUTE on SEGFAULTS the backend instead of
-- raising 42501. There is nothing to protect here in any case: Postgres refuses
-- to run a trigger function called directly (0A000), and the body only ever
-- clears references to a profiles row that is already being deleted.
revoke all on function public.profiles_release_before_delete() from public;

comment on function public.profiles_release_before_delete() is
  'BEFORE DELETE on profiles: clears the SET NULL attribution columns and the user''s own recordings before the FK cascades run, so a delete from auth.users cannot abort on a SET NULL update whose other parent the cascade already removed. Added by 20260919154000 (account deletion).';

drop trigger if exists profiles_release_before_delete on public.profiles;
create trigger profiles_release_before_delete
  before delete on public.profiles
  for each row execute function public.profiles_release_before_delete();

-- ---------------------------------------------------------------------------
-- The delete-account panel tells a coach how many members they are about to cut
-- off, which is `select count(*) from profiles where coach_id = auth.uid()`
-- under profiles_select_self_or_coach_or_admin. profiles had no index on
-- coach_id, so that count (and every other coach-roster read) was a seq scan.
-- Index only; no policy, column or default changes.
-- ---------------------------------------------------------------------------
create index if not exists profiles_coach_id_idx
  on public.profiles (coach_id)
  where coach_id is not null;
