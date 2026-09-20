-- ===========================================================================
-- Ticket S1, round 3 — corrections following the third attacker pass over
-- 20260919152000 / 152100 / 152200.
--
-- ADDITIVE; applies after 152200; nothing earlier is edited. Every change below is a
-- TIGHTENING or a purely additive read surface. NO policy is weakened: each replacement
-- keeps the original intent and says what changed and why.
--
-- Standing hazard (common.md): this Postgres 17.6 SIGSEGVs when a role calls a
-- SECURITY DEFINER function it lacks EXECUTE on. Nothing here revokes EXECUTE from
-- anon/authenticated. Every new/replaced function keeps `revoke all ... from public`
-- only and gates INSIDE its body.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- R3-1 (high) — a coach could re-attribute a completion to ANOTHER coach's member.
--
-- Reproduced in one rolled-back tx: Dana (coach A) ran
--   update public.workout_completions
--      set member_id = <coach B's member>, effort_score = 10, scored_by = auth.uid()
--    where id = <Jordan's completion on Dana's day>
-- -> UPDATE 1. The victim then saw the row through workout_completions_select_owner
-- (`victim sees completions|1`) and has_earned_milestone(victim,'first_day') flipped to
-- true, so the victim could mint an unearned milestone. That is a cross-tenant WRITE.
--
-- Two independent holes lined up:
--   (a) the coach branch of workout_completions_update_member_or_coach's WITH CHECK
--       constrained only workout_day_id (is_coach_of_workout_day), never member_id; and
--   (b) workout_completions_guard_client_writes froze member_id only on the
--       `if not v_is_coach` path, so the coach path skipped the freeze entirely.
--
-- Both are closed. Every sibling policy already enforces tenancy this way
-- (workout_plans_insert_coach / workout_plans_update_coach both require
-- is_coach_of_member(member_id)); this one now matches.
--
-- Scope note: the workout_day_id freeze is deliberately LEFT on the non-coach path only.
-- Round 2 (R2-1) showed that over-reaching here breaks real flows, and a coach moving a
-- row between days is already confined by the policy to days inside their own plans, so
-- it is not a tenancy escape. member_id is the column that crosses the tenant boundary,
-- and that is the one now frozen for every non-privileged caller.
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
  'Keeps completed_at server-side, freezes member_id for every non-privileged caller (coach included), and confines effort_score / scored_by to the coach of the day''s plan (who must score as themselves).';

revoke all on function public.workout_completions_guard_client_writes() from public;

-- Belt to the trigger's braces: the coach branch must also own the MEMBER, not just the day.
-- Intent unchanged (a member updates their own row; the plan's coach updates their members'
-- rows). The added conjunct only removes rows whose member is not the coach's.
drop policy if exists "workout_completions_update_member_or_coach" on public.workout_completions;
create policy "workout_completions_update_member_or_coach"
  on public.workout_completions for update
  to authenticated
  using (
    member_id = auth.uid()
    or (
      public.is_coach_or_admin()
      and public.is_coach_of_workout_day(workout_completions.workout_day_id)
      and public.is_coach_of_member(workout_completions.member_id)
    )
  )
  with check (
    (member_id = auth.uid() and public.owns_workout_day(workout_completions.workout_day_id))
    or (
      public.is_coach_or_admin()
      and public.is_coach_of_workout_day(workout_completions.workout_day_id)
      and public.is_coach_of_member(workout_completions.member_id)
    )
  );

-- ---------------------------------------------------------------------------
-- R3-2 (medium) — a DEMOTED coach kept full write access to notes, transcripts and
-- their stored recording objects.
--
-- Reproduced in one rolled-back tx: create coach C + class + recording + transcript, then
-- `update public.profiles set role='member'` as postgres, then act as C:
--     demoted is_coach_or_admin      | false
--     demoted can_manage_recording   | true
--     demoted PUBLISHED a note       | 1     <- insert ... published_at = now() SUCCEEDED
--     demoted rewrote transcript     | REWRITTEN AFTER DEMOTION
--
-- workout_notes.published_at is what makes a note visible to every one of that coach's
-- members through can_read_published_notes, so this is a CONTENT-PUBLISHING capability
-- retained after role revocation, not merely self-data editing.
--
-- This is the exact twin of R2-6 (groups UPDATE/DELETE), which round 2 fixed but did not
-- carry across to notes / transcripts / the storage DELETE policy. Ticket S1 item 6 names
-- "notes/recordings tables" explicitly.
--
-- IMPORTANT — this is a WRITE-ONLY tightening. Both tables carry a dedicated SELECT policy
-- (workout_notes_select_coach_or_published_member, transcripts_select_recording_coach) that
-- is left untouched, and RLS policies are OR-ed, so nobody loses a read. The Edge Function
-- writes as the service role and bypasses RLS, so the pipeline is unaffected.
drop policy if exists "workout_notes_write_recording_coach" on public.workout_notes;
create policy "workout_notes_write_recording_coach"
  on public.workout_notes for all
  to authenticated
  using (
    public.is_coach_or_admin()
    and public.can_manage_recording(workout_notes.recording_id)
  )
  with check (
    public.is_coach_or_admin()
    and public.can_manage_recording(workout_notes.recording_id)
    and (created_by is null or created_by = auth.uid())
  );

drop policy if exists "transcripts_write_recording_coach" on public.transcripts;
create policy "transcripts_write_recording_coach"
  on public.transcripts for all
  to authenticated
  using (
    public.is_coach_or_admin()
    and public.can_manage_recording(transcripts.recording_id)
  )
  with check (
    public.is_coach_or_admin()
    and public.can_manage_recording(transcripts.recording_id)
  );

-- recordings_objects_insert_own and recordings_objects_update_own already carry
-- is_coach_or_admin() (added in 152000); DELETE was left on bare ownership, so a demoted
-- coach could still destroy the stored media. Same gate, same intent.
-- SELECT stays ownership-only on purpose: a demoted coach may still read back their own
-- files, which is data access they already had, not a staff capability.
drop policy if exists "recordings_objects_delete_own" on storage.objects;
create policy "recordings_objects_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'recordings'
    and public.owns_recording_object(name)
    and public.is_coach_or_admin()
  );

-- ---------------------------------------------------------------------------
-- R3-3 (low) — is_coach_or_admin(p_uid) / is_admin(p_uid) were still a staff-role oracle
-- for any COACH caller.
--
-- Round 2 closed the anon/member probe but kept a caller-ROLE arm
-- (`exists (caller is coach/admin)`), so any coach could enumerate which of a list of uuids
-- are staff. Reproduced as Dana against an unrelated in-tx coach B and admin (no shared
-- member, group, class or plan):
--     dana->unrelated coachB is_coach_or_admin | true
--     dana->unrelated admin  is_admin          | true
--     dana->unrelated coachB profiles rows     | 0    <- profiles RLS hides that same uuid
--
-- The gate is now RELATIONSHIP-based, matching every other helper in this schema
-- (is_coach_of_member, recording_coach_id, subscription_state_row all require an actual
-- relationship). Admins keep an unconditional arm because platform administration
-- legitimately spans tenants.
--
-- The zero-arg behaviour is unchanged byte-for-byte: p_uid = auth.uid() makes the first arm
-- a tautology. Every in-tree call site is zero-arg (grep over supabase/migrations,
-- supabase/functions, src and app: only declarations, comments and revokes mention the
-- argument form), so no policy changes meaning.
--
-- The admin arm is INLINED rather than delegated to is_admin(): SQL OR is not guaranteed to
-- short-circuit, so is_admin(p_uid) calling is_admin() inside its own gate would risk
-- unbounded recursion. is_coach_of_member is safe to call (it never calls back into these).
create or replace function public.is_coach_or_admin(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- coalesce(...) is load-bearing: for anon, auth.uid() is NULL, so `p_uid = auth.uid()` is
  -- NULL and the OR-chain yields NULL, not false. Over PostgREST `null` is distinguishable
  -- from `false`, i.e. the same oracle in a three-valued disguise.
  select p_uid is not null
     and coalesce(
           p_uid = auth.uid()
           or public.is_privileged_writer()
           -- platform admins may ask about anyone
           or exists (
             select 1 from public.profiles a
             where a.id = auth.uid() and a.role = 'admin'
           )
           -- ...otherwise you may only ask about someone you actually have a relationship with
           or public.is_coach_of_member(p_uid)
           or exists (
             select 1 from public.profiles m
             where m.id = auth.uid() and m.coach_id = p_uid
           ),
           false
         )
     and exists (
       select 1 from public.profiles p
       where p.id = p_uid and p.role in ('coach', 'admin')
     );
$$;

comment on function public.is_coach_or_admin(uuid) is
  'True when the given user (default auth.uid()) has the server-side role coach or admin. NULL uid -> false. Foreign probes are refused: only the subject themselves, an admin, a privileged writer, or someone in an actual coach/member relationship with the subject gets a real answer - so this is not a role oracle for anon, members OR unrelated coaches.';

revoke all on function public.is_coach_or_admin(uuid) from public;

create or replace function public.is_admin(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- coalesce(...): same three-valued-logic hazard as is_coach_or_admin above.
  select p_uid is not null
     and coalesce(
           p_uid = auth.uid()
           or public.is_privileged_writer()
           or exists (
             select 1 from public.profiles a
             where a.id = auth.uid() and a.role = 'admin'
           )
           or public.is_coach_of_member(p_uid)
           or exists (
             select 1 from public.profiles m
             where m.id = auth.uid() and m.coach_id = p_uid
           ),
           false
         )
     and exists (
       select 1 from public.profiles p
       where p.id = p_uid and p.role = 'admin'
     );
$$;

comment on function public.is_admin(uuid) is
  'True when the given user (default auth.uid()) has the server-side role admin. NULL uid -> false. Foreign probes are refused on a relationship basis (see is_coach_or_admin).';

revoke all on function public.is_admin(uuid) from public;

-- ---------------------------------------------------------------------------
-- R3-4 (medium) — give PostgREST a working `select=*` surface for recordings.
--
-- 152000 replaced the table-level SELECT grant on public.recordings with a column list that
-- omits storage_path (the control that stops a member reading the private object key). The
-- side effect, confirmed over HTTP with the owning coach's real GoTrue JWT:
--     GET /rest/v1/recordings?select=*        -> 403 {"code":"42501","message":"permission denied for table recordings"}
--     GET /rest/v1/recordings?select=id,status -> 200 []
-- The error names no column, so Studio, a third-party client or a future bare `.select()`
-- fails closed and opaquely.
--
-- The suggested alternative - restore the table-level SELECT grant and hide storage_path
-- behind a view - was REJECTED on validation: a published recording is readable by all of
-- that coach's members, so restoring the table grant re-opens exactly the round-1 exfil the
-- column list exists to close. The view is added; the grant is NOT restored.
--
-- public.recordings_client is security_invoker, so the base table's RLS is evaluated as the
-- CALLER, not as the view owner. Verified in a rolled-back tx with two coaches' recordings:
-- Dana saw only her own row through the view, exactly as through the table.
-- It exposes a strict SUBSET of the columns anon/authenticated are already granted, so it
-- cannot widen anything.
create or replace view public.recordings_client
  with (security_invoker = true) as
  select
    id,
    live_class_id,
    uploaded_by,
    status,
    created_at,
    error_message,
    claimed_at,
    has_file
  from public.recordings;

comment on view public.recordings_client is
  'select=*-safe projection of public.recordings for PostgREST clients: every column the client roles may read, with storage_path (the private object key) structurally absent. security_invoker, so public.recordings'' RLS is enforced as the caller. Use this when you want select=*; the base table still requires an explicit column list.';

grant select on public.recordings_client to anon, authenticated;

comment on table public.recordings is
  'Coach-uploaded class recordings. SELECT is granted COLUMN-WISE (storage_path deliberately excluded), so PostgREST select=* / supabase-js bare .select() returns 403 42501 on THIS table for every role. Pass an explicit column list (RECORDING_COLUMNS in src/features/notes/api.ts) or query the public.recordings_client view, which is select=*-safe.';

-- ---------------------------------------------------------------------------
-- R3-5 (low) — let agora-rtc-token tell "missing class" from "not your class".
--
-- common.md's canonical contract reserves 404 class_not_found for a class that does not
-- exist and requires 403 not_entitled when the caller is neither the class's coach nor one
-- of that coach's members. Reproduced with a freshly signed-up member (coach_id NULL):
--     POST /functions/v1/agora-rtc-token {"class_id":"88888888-..."}  (class EXISTS) -> 404 class_not_found
-- The function loads the class row under the CALLER's RLS, so
-- live_classes_select_entitled_tenant filters it out and decideAccess never sees a row -
-- the not_entitled branch is unreachable for unaffiliated callers.
--
-- This helper answers the existence question alone. It is deliberately NOT the service role:
-- the function's standing invariant ("a bug in this file must not be able to hand out a token
-- the SQL would refuse") is preserved because the ENTITLEMENT verdict still comes from
-- can_join_live_class evaluated as the caller. All this adds is the ability to pick the
-- correct refusal code.
--
-- Disclosure: an authenticated caller learns whether a uuid they already hold names a class.
-- That is precisely the distinction common.md's contract mandates, and uuids are not
-- guessable. anon gets false (in-body null-uid gate), so the contract's 401 path is
-- unaffected.
create or replace function public.live_class_exists(p_class uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and p_class is not null
     and exists (select 1 from public.live_classes lc where lc.id = p_class);
$$;

comment on function public.live_class_exists(uuid) is
  'True when a live class with this id exists, for any authenticated caller; false for anon and for a null/unknown id. Used ONLY by agora-rtc-token to distinguish 404 class_not_found from 403 not_entitled. Carries no class data and grants no entitlement - can_join_live_class remains the authority.';

revoke all on function public.live_class_exists(uuid) from public;
