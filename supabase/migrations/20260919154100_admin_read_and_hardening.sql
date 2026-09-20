-- 20260919154100_admin_read_and_hardening.sql
--
-- Follow-ups from the security workflow (lowBacklog + round-3 `abuse`) and the integration
-- workflow (lowBacklog + tests-verifier medium), applied additively on top of 20260919153000.
-- Nothing here weakens an existing policy: every widening is a SEPARATE, SELECT-ONLY permissive
-- policy, and every narrowing replaces a predicate with a strictly smaller one.
--
-- Items, in order:
--   1. Admin read gap on the member training record (workout_* / diet_* / completions /
--      milestones) and, transitively, the member_workout_stats view.
--   2. Row caps on workout_note_progress + the missing length bounds on workout_notes content
--      and transcripts raw_text/segments.
--   3. get_my_coach() must stop returning a DEMOTED coach.
--   4. live_class_exists() in-body gate.
--   5. group_members raw SELECT must respect user_blocks the way get_group_roster does.
--   6. recordings_client was granted full DML to anon and authenticated.
--   7. choose_coach() documentation: 22P02 mapping and the "no coach_profiles row = accepting"
--      rule (the SQL behaviour is unchanged; item 7's code change is in src/features/coaching).


-- ===========================================================================
-- 1. Admin read gap (medium, verifier-confirmed)
-- ===========================================================================
--
-- THE BUG. `workout_completions_select_owner` is (member_id = auth.uid() OR the day's coach).
-- `profiles_select_self_or_coach_or_admin` HAS an admin branch and the security_invoker view
-- public.member_workout_stats joins the two, so an admin got a row of ZEROS for every member:
-- completed_count 0, streak 0 — indistinguishable from a member who never trained. Meanwhile the
-- SECURITY DEFINER rpc public.has_earned_milestone() *does* have an admin branch (20260919152200)
-- and answers TRUE for the same member. Two staff-facing surfaces contradicting each other is
-- worse than either answer alone, because the zeros look like data.
--
-- THE SHAPE OF THE FIX. Each table gets a SEPARATE permissive policy `FOR SELECT` whose USING is
-- just `public.is_admin()`. This is deliberate and matters:
--   * Permissive policies of the same command are OR'd, so the read widens.
--   * An INSERT/UPDATE/DELETE still has to satisfy that table's own write policy, which these do
--     not touch. (PostgreSQL ANDs the SELECT policies onto an UPDATE that reads columns; it never
--     substitutes them for the UPDATE policy.) So an admin gains READ and nothing else — the
--     T-S1 write boundary (`is_coach_or_admin() AND is_coach_of_<thing>()`) is untouched.
--   * Rewriting the existing USING clauses instead would have put an admin branch on
--     `exercise_completions_owner`, which is FOR ALL — that would have handed admins DELETE.
--
-- WHICH TABLES. The member training record that staff surfaces already claim to show:
-- workout_plans / workout_days / exercises / workout_completions / exercise_completions and the
-- diet mirror of the same chain, plus milestones (the table has_earned_milestone speaks for).
--
-- WHICH TABLES DELIBERATELY NOT (audited, left alone, and why):
--   * recordings / transcripts / workout_notes — the notes chain is gated by
--     can_manage_recording(), which has no admin branch, so it is INTERNALLY consistent: no admin
--     surface claims otherwise. transcripts is raw ASR of a live room (other members' names,
--     off-topic talk) and workout_notes carries unpublished coach drafts; widening either is a
--     privacy decision, not a bug fix, and is out of scope here.
--   * workout_note_progress — self-only ON PURPOSE (20260919151000: "not even their coach, who
--     has no business seeing a half-finished checklist"). An admin branch would contradict the
--     stated intent.
--   * group_members / groups / user_blocks — community privacy; item 5 below NARROWS these.
--   * live_class_participants — can_see_live_class() already has an admin branch, so an admin
--     sees the class; the attendee list is not claimed by any admin surface. Reported, not fixed.
--   * profiles / subscriptions / moderation_reports — already have admin branches.
--
-- member_workout_stats itself needs NO change: it is security_invoker, so fixing
-- workout_completions fixes the view for admins by construction.

drop policy if exists "workout_plans_select_admin" on public.workout_plans;
create policy "workout_plans_select_admin"
  on public.workout_plans for select
  to authenticated
  using (public.is_admin());

drop policy if exists "workout_days_select_admin" on public.workout_days;
create policy "workout_days_select_admin"
  on public.workout_days for select
  to authenticated
  using (public.is_admin());

drop policy if exists "exercises_select_admin" on public.exercises;
create policy "exercises_select_admin"
  on public.exercises for select
  to authenticated
  using (public.is_admin());

drop policy if exists "workout_completions_select_admin" on public.workout_completions;
create policy "workout_completions_select_admin"
  on public.workout_completions for select
  to authenticated
  using (public.is_admin());

drop policy if exists "exercise_completions_select_admin" on public.exercise_completions;
create policy "exercise_completions_select_admin"
  on public.exercise_completions for select
  to authenticated
  using (public.is_admin());

drop policy if exists "milestones_select_admin" on public.milestones;
create policy "milestones_select_admin"
  on public.milestones for select
  to authenticated
  using (public.is_admin());

drop policy if exists "diet_plans_select_admin" on public.diet_plans;
create policy "diet_plans_select_admin"
  on public.diet_plans for select
  to authenticated
  using (public.is_admin());

drop policy if exists "diet_items_select_admin" on public.diet_items;
create policy "diet_items_select_admin"
  on public.diet_items for select
  to authenticated
  using (public.is_admin());

drop policy if exists "diet_plan_assignments_select_admin" on public.diet_plan_assignments;
create policy "diet_plan_assignments_select_admin"
  on public.diet_plan_assignments for select
  to authenticated
  using (public.is_admin());

drop policy if exists "diet_checkins_select_admin" on public.diet_checkins;
create policy "diet_checkins_select_admin"
  on public.diet_checkins for select
  to authenticated
  using (public.is_admin());

comment on view public.member_workout_stats is
  'Live streak/score per member, security_invoker. Visibility follows the caller''s RLS on profiles and workout_completions: self, the member''s coach, or an admin (via the *_select_admin policies added in 20260919154100). Before that migration an admin saw a row of zeros rather than the truth.';


-- ===========================================================================
-- 2. Row caps and the missing length bounds
-- ===========================================================================

-- workout_note_progress: `member_id = auth.uid() and can_read_workout_note(note_id)` lets a
-- member insert one row per item_key, and item_key is free text (<= 200 chars, 20260919152000).
-- One readable note therefore allowed UNBOUNDED rows from a single member. The unique constraint
-- (member_id, note_id, item_key) does not help: every new key is a new row.
--
-- Caps chosen against the real producer. The drafter (supabase/functions/_shared/drafter.ts)
-- builds a checklist of a couple of dozen items; the UI ticks one row per item of ONE note.
--   * 200 rows per (member, note) — an order of magnitude above the largest checklist the
--     drafter can emit, so no honest client can reach it.
--   * 5000 rows per member — ~25 fully-ticked maximal notes; a member with a year of classes
--     stays far below it.
-- Privileged writers (service_role / postgres — the pipeline, backfills) are exempt, matching
-- push_tokens_enforce_row_cap (20260919152000).
create or replace function public.workout_note_progress_enforce_row_cap()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_note_count   integer;
  v_member_count integer;
begin
  if public.is_privileged_writer() then
    return new;
  end if;

  select count(*) into v_note_count
    from public.workout_note_progress p
   where p.member_id = new.member_id and p.note_id = new.note_id;
  if v_note_count >= 200 then
    raise exception 'too many checklist ticks for this note (limit 200)' using errcode = '23514';
  end if;

  select count(*) into v_member_count
    from public.workout_note_progress p
   where p.member_id = new.member_id;
  if v_member_count >= 5000 then
    raise exception 'too many checklist ticks for this member (limit 5000)' using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.workout_note_progress_enforce_row_cap() is
  'BEFORE INSERT row cap on workout_note_progress: <= 200 rows per (member, note) and <= 5000 per member, raising check_violation (23514). Privileged writers are exempt.';

revoke all on function public.workout_note_progress_enforce_row_cap() from public;

drop trigger if exists workout_note_progress_enforce_row_cap on public.workout_note_progress;
create trigger workout_note_progress_enforce_row_cap
  before insert on public.workout_note_progress
  for each row execute function public.workout_note_progress_enforce_row_cap();

-- workout_notes.draft_content / edited_content: is_valid_note_checklist() validates the SHAPE but
-- puts no ceiling on size, so a coach (the only writer) could store an arbitrarily large document
-- that every one of their members then downloads. 64 KB serialized: the drafter's output is a few
-- KB at most, and 64 KB is still a comfortable mobile payload.
alter table public.workout_notes drop constraint if exists workout_notes_content_bounds;
alter table public.workout_notes add constraint workout_notes_content_bounds check (
  (draft_content is null or length(draft_content) <= 65536)
  and (edited_content is null or length(edited_content) <= 65536)
);

-- transcripts had no text CHECK at all. Written by transcribe-recording as the service role, so
-- this is a blast-radius bound on a compromised/buggy ASR adapter rather than on a client.
--   * raw_text <= 1,000,000 chars — roughly 150k spoken words, ~16 h of speech; a class is < 2 h.
--     The mock adapter (_shared/asr.ts MOCK_SCRIPT) emits a few hundred characters.
--   * segments <= 2 MB serialized — the deepgram adapter emits one {start,end,text} object per
--     utterance, a small multiple of raw_text; 2 MB leaves ample headroom over the 1 MB text cap.
-- A transcript that somehow exceeded these fails the INSERT, and transcribe-recording's own
-- error path records it as `failed` with a sanitized message — a loud, recoverable outcome.
alter table public.transcripts drop constraint if exists transcripts_text_bounds;
alter table public.transcripts add constraint transcripts_text_bounds check (
  (raw_text is null or length(raw_text) <= 1000000)
  and (segments is null or length(segments::text) <= 2097152)
);


-- ===========================================================================
-- 3. get_my_coach() must not present a DEMOTED coach
-- ===========================================================================
--
-- choose_coach() refuses a target whose profiles.role is not 'coach', but nothing re-checks the
-- role afterwards. When an admin demotes a coach to 'member', every one of their members kept
-- seeing them as "your coach" in the UI. list_coaches() already filters on role = 'coach'; this
-- brings get_my_coach() in line. profiles.coach_id is left as-is on purpose: unpicking the
-- assignment is a product decision, and zero rows is the same state the UI already renders for a
-- member who has not chosen a coach yet.
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
    and me.id = auth.uid()
    and c.role = 'coach';
$$;

comment on function public.get_my_coach() is
  'The calling member''s chosen coach as a single directory row, or zero rows when they have none, are signed out, or their assigned coach has since been demoted out of the ''coach'' role (20260919154100).';

revoke all on function public.get_my_coach() from public;


-- ===========================================================================
-- 4. live_class_exists() — in-body gate
-- ===========================================================================
--
-- The finding: an unrestricted class-existence oracle for any authenticated caller.
--
-- What the ONE real caller needs (supabase/functions/agora-rtc-token/index.ts:134 ->
-- logic.ts resolveInvisibleClass): when the class row is invisible under the caller's own RLS,
-- pick 404 class_not_found (no such class) over 403 not_entitled (exists, not yours). That is
-- common.md's canonical contract, so the existence bit itself cannot be removed without breaking
-- the contract — and it cannot be moved to the service role either: this function's standing
-- invariant is "the service role is never used here".
--
-- What CAN be removed is the caller class. Before: any bearer token that parses as a user got an
-- answer — including a JWT for an account that was never provisioned or has since been deleted,
-- which is exactly the shape a scripted prober uses. Now the caller must hold a real profiles row
-- with a product role. Every genuine caller has one (public.handle_new_user provisions it at
-- signup, 20260919152100), so the 403/404 split is unchanged for them; anon still gets false
-- through the null-uid gate, so the 401 path is unaffected.
--
-- Residual, deliberate: a provisioned account learns whether a uuid IT ALREADY HOLDS names a
-- class. uuids are not guessable and the answer carries no class data. Narrowing further (e.g.
-- only non-ended classes, or only the caller's own tenant) would re-break R3-5, which exists
-- precisely so an unaffiliated member gets 403 rather than 404.
--
-- EXECUTE is NOT revoked from anon/authenticated (revoking it SIGSEGVs this Postgres build; see
-- common.md) — the gate is in the body, as required.
create or replace function public.live_class_exists(p_class uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and p_class is not null
     and exists (
       select 1 from public.profiles me
       where me.id = auth.uid()
         and me.role in ('member', 'coach', 'admin')
     )
     and exists (select 1 from public.live_classes lc where lc.id = p_class);
$$;

comment on function public.live_class_exists(uuid) is
  'True when a live class with this id exists AND the caller is a provisioned profile (member/coach/admin); false for anon, for an unprovisioned/deleted account, and for a null or unknown id. Used ONLY by agora-rtc-token to distinguish 404 class_not_found from 403 not_entitled. Carries no class data and grants no entitlement - can_join_live_class remains the authority.';

revoke all on function public.live_class_exists(uuid) from public;


-- ===========================================================================
-- 5. group_members raw SELECT must honour user_blocks
-- ===========================================================================
--
-- get_group_roster() excludes blocked pairs in BOTH directions, but the row policy behind it did
-- not: a blocked member could still read the blocker's group_members row straight over PostgREST
-- (`/rest/v1/group_members?group_id=eq.<uuid>`) and learn they are in the group. The filter has to
-- live on the row, or the roster function is only a UI convention.
--
-- The check has to read public.user_blocks rows the caller does NOT own (user_blocks_select_blocker
-- is blocker-only), and it is evaluated from inside a policy, so it must be SECURITY DEFINER with
-- an in-body gate — the same shape as is_fellow_group_member.
create or replace function public.is_blocked_pair(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and p_other is not null
     and p_other <> auth.uid()
     and exists (
       select 1
       from public.user_blocks b
       where (b.blocker_id = auth.uid() and b.blocked_id = p_other)
          or (b.blocker_id = p_other and b.blocked_id = auth.uid())
     );
$$;

comment on function public.is_blocked_pair(uuid) is
  'True when the caller and p_other have blocked each other in either direction. Symmetric on purpose, so the blocked party never learns they were blocked - they simply stop seeing the blocker. Returns false for anon, for a null id and for the caller themselves. Mirrors the filter get_group_roster already applies.';

revoke all on function public.is_blocked_pair(uuid) from public;
grant execute on function public.is_blocked_pair(uuid) to anon, authenticated;

-- REPLACES group_members_select_fellow_member (20260919120000), keeping both of its arms and
-- ANDing the block filter onto the fellow-member arm only. Strictly narrower:
--   * `member_id = auth.uid()` is untouched, so a member always sees their OWN membership rows.
--     Joining (insert) and leaving (delete) are unaffected - their policies are separate and the
--     self arm keeps the row visible to the DELETE.
--   * src/features/community/api.ts only ever reads its own rows (.eq('member_id', memberId)),
--     so no client path changes.
drop policy if exists "group_members_select_fellow_member" on public.group_members;
create policy "group_members_select_fellow_member"
  on public.group_members for select
  using (
    member_id = auth.uid()
    or (
      public.is_fellow_group_member(group_members.group_id)
      and not public.is_blocked_pair(group_members.member_id)
    )
  );


-- ===========================================================================
-- 6. recordings_client was granted full DML, not SELECT
-- ===========================================================================
--
-- `grant select on public.recordings_client to anon, authenticated` (20260919152300) was only
-- half the story: Supabase's ALTER DEFAULT PRIVILEGES in the public schema had already handed
-- anon and authenticated INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER on the view at CREATE
-- time. The view is simple and auto-updatable, so those were live write paths into
-- public.recordings that the migration's own comment said did not exist. RLS and
-- recordings_guard_client_writes still stood behind them, but a privilege that nothing uses and
-- the documentation denies should not exist.
--
-- Privilege changes on a VIEW are safe here: the "never REVOKE EXECUTE" rule in common.md is
-- about FUNCTIONS (a role calling a SECURITY DEFINER function it lacks EXECUTE on SIGSEGVs this
-- build). A role selecting from a view it lacks SELECT on gets a clean 42501.
revoke all on public.recordings_client from anon, authenticated;
grant select on public.recordings_client to authenticated;

comment on view public.recordings_client is
  'select=*-safe projection of public.recordings for PostgREST clients: every column the client roles may read, with storage_path (the private object key) structurally absent. security_invoker, so public.recordings'' RLS is enforced as the caller. SELECT is granted to authenticated ONLY - anon holds no privilege on it, and no role holds INSERT/UPDATE/DELETE/TRUNCATE (20260919154100 revoked the defaults that CREATE VIEW picked up). The base table public.recordings keeps its deliberate COLUMN-LEVEL SELECT grant, which excludes storage_path and therefore 403s on select=*; that design is intentional and unchanged - use this view when you want select=*, or the explicit RECORDING_COLUMNS list in src/features/notes/api.ts.';


-- ===========================================================================
-- 7. choose_coach() edge cases (documentation; behaviour unchanged)
-- ===========================================================================
--
-- (a) Invalid uuid. PostgREST/PostgreSQL rejects a malformed p_coach_id while COERCING the
--     argument, before the function body runs, so the client sees SQLSTATE 22P02
--     (invalid_text_representation) and NOT the P0001 'coach_not_found' the body would raise for
--     a well-formed-but-unknown uuid. Mapping that in SQL would mean accepting text and casting,
--     which weakens the signature; it is mapped in the client instead -
--     mapChooseCoachError() in src/features/coaching/api.ts now folds 22P02 onto
--     'coach_not_found', which is the same answer the body gives for a uuid that names nothing.
--
-- (b) A coach with NO public.coach_profiles row is treated as ACCEPTING. The body reads
--     `coalesce(cp.accepting_members, true)` over a LEFT JOIN, so a coach who has never opened
--     the profile editor can still be chosen. That is deliberate: accepting_members is an opt-OUT
--     ("close my books"), and defaulting a brand-new coach to closed would make them unchoosable
--     until they touched a screen they may not know exists. list_coaches() lists such a coach with
--     accepting_members = true for the same reason. Pinned by pgTAP 21_admin_read_and_hardening.
comment on function public.choose_coach(uuid) is
  'A member assigns themselves to a coach who is accepting members. Writes only the caller''s own profiles.coach_id, through the single sanctioned window in profiles_guard_privileged_columns. Raises P0001 not_authenticated / not_a_member / coach_not_found / coach_not_accepting. A malformed p_coach_id never reaches the body: PostgreSQL raises 22P02 during argument coercion, which the client maps onto coach_not_found. A coach with no coach_profiles row counts as accepting (coalesce(..., true)) - accepting_members is an opt-out.';
