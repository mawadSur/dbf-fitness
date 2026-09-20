-- Recording -> notes pipeline: private Storage for class recordings, hardened RLS on the
-- recordings/transcripts/workout_notes triple created in 20260919114451_live_classes_schema.sql,
-- a member-owned checklist-progress table, and a shape check for the generated checklist JSON.
--
-- Pipeline in one line:
--   coach uploads to storage://recordings/<coach uid>/<recording id>/<file>  (status 'uploading')
--     -> Edge Function `transcribe-recording` (service role) flips to 'transcribing'
--     -> ASR adapter writes `transcripts`
--     -> drafter adapter writes `workout_notes.draft_content` and flips to 'draft'
--     -> coach edits `edited_content` and sets `published_at` -> recording goes 'published'
--   any failure -> status 'failed' + `recordings.error_message`, retryable from 'failed'.
--
-- PRODUCT DECISION RECORDED (v1): notes are NOT subscription-gated. Live-class video is
-- (see the subscriptions migration); a member who can see the class can read its published notes.
--
-- Threat model this closes in the pre-existing schema:
--   * `recordings.status = 'published'` was readable by EVERY authenticated user, and
--     `transcripts` inherited that, so any signed-up stranger could read another coach's
--     `storage_path` and the full raw ASR transcript of their class.
--   * `workout_notes` with `published_at is not null` were likewise world-readable to any
--     authenticated user rather than to that coach's own members.
--   * A coach could `update recordings set status = 'draft'` (or 'published') by hand and forge a
--     finished pipeline run without any transcript ever existing. Status is now trigger-guarded;
--     only the pipeline (service role) drives it, apart from the coach's own draft<->published flip.
--
-- Everything here is additive: no existing table, column or policy intent is removed. Three SELECT
-- policies are REPLACED, each strictly narrower than what it replaces (see the notes inline).

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- Role / identity helpers
-- ---------------------------------------------------------------------------

-- True when the statement is running as the pipeline itself (the Edge Function's service-role
-- client, or a migration/psql session), rather than as an end user.
--
-- Inside a trigger `current_user` is useless (it is the table owner / definer), so the CALLER is
-- identified via the `role` GUC that PostgREST and storage-api set with `set local role ...`
-- ('none' when unset), falling back to session_user for a plain psql or migration session. This is
-- the same technique used by apply_realtime_presence_policies() in 20260919140000.
--
-- End users always reach Postgres through PostgREST/storage-api as 'authenticated' or 'anon', and
-- neither service lets a client choose its own role GUC, so a client cannot spoof this.
create or replace function public.is_pipeline_role()
returns boolean
language sql
stable
as $$
  select coalesce(nullif(current_setting('role', true), 'none'), session_user)
         in ('postgres', 'supabase_admin', 'service_role');
$$;

revoke all on function public.is_pipeline_role() from public;
grant execute on function public.is_pipeline_role() to anon, authenticated, service_role;

-- The coach who owns a recording: the coach of its live class, falling back to the uploader for a
-- class-less recording. SECURITY DEFINER so it can be called from the policies of the very tables
-- it reads (recordings, live_classes) without re-entering their RLS.
create or replace function public.recording_coach_id(p_recording uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(lc.coach_id, r.uploaded_by)
  from public.recordings r
  left join public.live_classes lc on lc.id = r.live_class_id
  where r.id = p_recording
    -- SECURITY DEFINER bypasses RLS, so gate in the body: a signed-out caller who guessed a
    -- recording id must not learn which coach owns it. Every internal caller below already
    -- requires auth.uid(), so this changes nothing for them.
    and auth.uid() is not null;
$$;

revoke all on function public.recording_coach_id(uuid) from public;
grant execute on function public.recording_coach_id(uuid) to anon, authenticated, service_role;

-- True when the caller is the coach who owns the recording (class coach or uploader). This is the
-- "can see everything about this recording" predicate: raw transcript, draft notes, storage path.
create or replace function public.can_manage_recording(p_recording uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and exists (
       select 1
       from public.recordings r
       where r.id = p_recording
         and (r.uploaded_by = auth.uid() or public.recording_coach_id(p_recording) = auth.uid())
     );
$$;

revoke all on function public.can_manage_recording(uuid) from public;
grant execute on function public.can_manage_recording(uuid) to anon, authenticated, service_role;

-- True when the caller is a MEMBER coached by the recording's coach. Gates published notes only;
-- it deliberately grants nothing about drafts, transcripts or the storage object.
create or replace function public.can_read_published_notes(p_recording uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and exists (
       select 1
       from public.profiles p
       where p.id = auth.uid()
         and p.coach_id is not null
         and p.coach_id = public.recording_coach_id(p_recording)
     );
$$;

revoke all on function public.can_read_published_notes(uuid) from public;
grant execute on function public.can_read_published_notes(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Checklist JSON shape
-- ---------------------------------------------------------------------------

-- `workout_notes.draft_content` / `.edited_content` are `text` columns holding a JSON checklist:
--
--   {
--     "title": "Saturday Conditioning",
--     "items": [
--       { "key": "warmup",  "text": "Row 500m easy",  "kind": "note" },
--       { "key": "squat-1", "text": "Back squat",     "kind": "exercise", "sets": 4, "reps": "8-10" }
--     ]
--   }
--
-- `title` string (required), `items` array (required, may be empty). Each item: `key` non-empty
-- string, `text` string, `kind` exactly 'exercise' or 'note'; optional `sets` number and `reps`
-- string. Unknown extra keys are tolerated so the drafter can grow. The identical contract is
-- mirrored in TypeScript in src/services/transcription/types.ts (NoteChecklist / validateChecklist)
-- and in supabase/functions/_shared/drafter.ts.
--
-- NULL passes: a row may exist before its draft has been generated.
--
-- IMMUTABLE so it can back a CHECK constraint; jsonb parsing and shape inspection are pure.
-- jsonb_typeof() returns NULL for a MISSING key, and `NULL <> 'string'` is NULL (not true), which
-- would let a missing key through -- hence coalesce(..., 'missing') on every probe.
create or replace function public.is_valid_note_checklist(p_content text)
returns boolean
language plpgsql
immutable
as $$
declare
  doc jsonb;
  item jsonb;
begin
  if p_content is null then
    return true;
  end if;

  begin
    doc := p_content::jsonb;
  exception when others then
    return false;
  end;

  if jsonb_typeof(doc) <> 'object' then return false; end if;
  if coalesce(jsonb_typeof(doc -> 'title'), 'missing') <> 'string' then return false; end if;
  if coalesce(jsonb_typeof(doc -> 'items'), 'missing') <> 'array' then return false; end if;

  for item in select value from jsonb_array_elements(doc -> 'items') loop
    if jsonb_typeof(item) <> 'object' then return false; end if;
    if coalesce(jsonb_typeof(item -> 'key'), 'missing') <> 'string' then return false; end if;
    if coalesce(item ->> 'key', '') = '' then return false; end if;
    if coalesce(jsonb_typeof(item -> 'text'), 'missing') <> 'string' then return false; end if;
    if coalesce(item ->> 'kind', '') not in ('exercise', 'note') then return false; end if;
    if item ? 'sets' and jsonb_typeof(item -> 'sets') <> 'number' then return false; end if;
    if item ? 'reps' and jsonb_typeof(item -> 'reps') <> 'string' then return false; end if;
  end loop;

  return true;
end;
$$;

comment on function public.is_valid_note_checklist(text) is
  'Validates the workout-notes checklist JSON shape: {"title": string, "items": [{"key": string, "text": string, "kind": "exercise"|"note", "sets"?: number, "reps"?: string}]}. NULL is valid.';

revoke all on function public.is_valid_note_checklist(text) from public;
grant execute on function public.is_valid_note_checklist(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- recordings: error_message + status forgery guard
-- ---------------------------------------------------------------------------

alter table public.recordings
  add column if not exists error_message text;

comment on column public.recordings.error_message is
  'Short, secret-free reason the last pipeline run failed (set only by transcribe-recording; cleared on retry). Truncated to 500 chars by the function.';

comment on column public.recordings.status is
  'uploading -> transcribing -> draft -> published, or failed. Driven by the transcribe-recording Edge Function (service role); the only transition a client may make is the coach flipping draft <-> published (see recordings_guard_client_writes).';

-- claimed_at is the transcription LEASE.
--
-- The function stamps it in the same UPDATE that claims the recording and clears it when the run
-- ends. Without a lease a run that never comes back -- an Edge-runtime wall-clock kill mid-ASR is
-- the ordinary cause, since the whole pipeline is awaited inside one HTTP request -- leaves the
-- row in 'transcribing' forever: every later call gets 409 and the guard trigger below refuses to
-- let the coach move it either, so the recording is unrecoverable. A 'transcribing' row whose
-- claim is older than the lease is treated as abandoned and can be re-claimed.
alter table public.recordings
  add column if not exists claimed_at timestamptz;

comment on column public.recordings.claimed_at is
  'When the transcription pipeline claimed this recording (lease start). Set by transcribe-recording under the service role on claim, cleared when the run ends (draft/failed). A ''transcribing'' row whose claimed_at is older than the lease (TRANSCRIPTION_LEASE_MS in supabase/functions/transcribe-recording/logic.ts, 15 minutes) -- or null -- is stale and may be re-claimed by the next call.';

-- Rows stranded in 'transcribing' before the lease existed: date the claim from the row itself so
-- they age out like every other claim instead of staying stuck.
update public.recordings
   set claimed_at = created_at
 where status = 'transcribing'
   and claimed_at is null;

-- storage_path is private (it is the object key in a private bucket and is not selected by member
-- queries). The client still has to tell "uploaded, pipeline never started" apart from "still
-- uploading" to offer a retry, so expose only the boolean.
alter table public.recordings
  add column if not exists has_file boolean generated always as (storage_path is not null) stored;

comment on column public.recordings.has_file is
  'Generated: the object has been uploaded (storage_path is not null). Lets clients offer "retry transcription" for a recording stuck in ''uploading'' after a failed pipeline hand-off without reading storage_path.';

create index if not exists recordings_live_class_id_idx on public.recordings (live_class_id);
create index if not exists recordings_uploaded_by_idx on public.recordings (uploaded_by);
create index if not exists recordings_stale_claim_idx
  on public.recordings (claimed_at)
  where status = 'transcribing';

-- RLS cannot compare OLD and NEW, so the status machine is enforced by a trigger instead.
-- Without it any coach could `update recordings set status='draft'` and present a finished
-- pipeline run that never happened (no transcript, no draft notes), or hand-write an
-- error_message. Runs as the CALLER (not SECURITY DEFINER) and touches no table.
create or replace function public.recordings_guard_client_writes()
returns trigger
language plpgsql
as $$
begin
  -- The pipeline (service role / migrations) owns the state machine outright.
  if public.is_pipeline_role() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'uploading' then
      raise exception 'recordings.status must be ''uploading'' on insert; the transcription pipeline sets every later status'
        using errcode = '42501';
    end if;
    if new.error_message is not null then
      raise exception 'recordings.error_message is set by the transcription pipeline'
        using errcode = '42501';
    end if;
    if new.claimed_at is not null then
      raise exception 'recordings.claimed_at is set by the transcription pipeline'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE. The coach may publish or unpublish a finished recording; every other status move
  -- belongs to the pipeline.
  if new.status is distinct from old.status
     and (old.status, new.status) not in (('draft', 'published'), ('published', 'draft')) then
    raise exception 'recordings.status transition % -> % is made by the transcription pipeline',
      old.status, new.status
      using errcode = '42501';
  end if;

  if new.error_message is distinct from old.error_message then
    raise exception 'recordings.error_message is set by the transcription pipeline'
      using errcode = '42501';
  end if;

  -- The lease belongs to the pipeline: a client that could back-date claimed_at could make a live
  -- run look abandoned and have a second run started on top of it.
  if new.claimed_at is distinct from old.claimed_at then
    raise exception 'recordings.claimed_at is set by the transcription pipeline'
      using errcode = '42501';
  end if;

  -- storage_path is the uploader's to set, but only while the object is still being uploaded;
  -- afterwards it would re-point a transcript/draft at a different file.
  if new.storage_path is distinct from old.storage_path and old.status <> 'uploading' then
    raise exception 'recordings.storage_path can only change while the recording is ''uploading'''
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.recordings_guard_client_writes() from public;

drop trigger if exists recordings_guard_client_writes on public.recordings;
create trigger recordings_guard_client_writes
  before insert or update on public.recordings
  for each row execute function public.recordings_guard_client_writes();

-- REPLACES recordings_insert_self (was: `uploaded_by = auth.uid()`), keeping that intent and
-- adding: the row must start in 'uploading', carry no error_message, and belong to a live class
-- THIS coach owns. A recording is always created for one of the coach's own classes by
-- src/services/recordings/upload.ts, so requiring the class costs nothing and stops a member (or
-- another coach) from attaching a recording to someone else's class.
drop policy if exists "recordings_insert_self" on public.recordings;
drop policy if exists "recordings_insert_own_class_uploading" on public.recordings;
create policy "recordings_insert_own_class_uploading"
  on public.recordings for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and status = 'uploading'
    and error_message is null
    and exists (
      select 1
      from public.live_classes lc
      where lc.id = recordings.live_class_id
        and lc.coach_id = auth.uid()
    )
  );

-- REPLACES recordings_select_owner_coach_or_published. The old policy's `status = 'published'`
-- arm made every published recording (including its storage_path) readable by EVERY authenticated
-- user. Same intent -- a published recording is visible to its audience -- but the audience is now
-- that coach's own members.
drop policy if exists "recordings_select_owner_coach_or_published" on public.recordings;
drop policy if exists "recordings_select_coach_or_published_member" on public.recordings;
create policy "recordings_select_coach_or_published_member"
  on public.recordings for select
  to authenticated
  using (
    uploaded_by = auth.uid()
    or public.can_manage_recording(recordings.id)
    or (status = 'published' and public.can_read_published_notes(recordings.id))
  );

-- ---------------------------------------------------------------------------
-- transcripts: coach-only, never members
-- ---------------------------------------------------------------------------

-- The ASR adapter returns sentence-level timings alongside the flat text; keeping them makes the
-- transcript navigable later (jump-to-moment) without re-running ASR. `provider` records which
-- adapter produced the row ('deepgram' or 'mock'), so a mock-generated transcript is never
-- mistaken for a real one.
alter table public.transcripts
  add column if not exists segments jsonb;
alter table public.transcripts
  add column if not exists provider text;

comment on column public.transcripts.segments is
  'ASR segments: [{ "start": number, "end": number, "text": string }] in seconds from the start of the recording.';
comment on column public.transcripts.provider is
  'Which ASR adapter produced this transcript: ''deepgram'' (real) or ''mock'' (deterministic offline generator).';

-- REPLACES transcripts_select_via_recording, which let anyone read the raw transcript of any
-- recording whose status was 'published'. Raw ASR output is a coach-only asset: it contains
-- whatever was said in the room, including other members' names and off-topic conversation.
drop policy if exists "transcripts_select_via_recording" on public.transcripts;
drop policy if exists "transcripts_select_recording_coach" on public.transcripts;
create policy "transcripts_select_recording_coach"
  on public.transcripts for select
  to authenticated
  using (public.can_manage_recording(transcripts.recording_id));

-- REPLACES transcripts_write_via_recording_owner (uploader only) with the same intent, expressed
-- through the shared predicate so the class coach is covered too. In practice both are the coach
-- who uploaded; the Edge Function writes transcripts as the service role and bypasses RLS anyway.
drop policy if exists "transcripts_write_via_recording_owner" on public.transcripts;
drop policy if exists "transcripts_write_recording_coach" on public.transcripts;
create policy "transcripts_write_recording_coach"
  on public.transcripts for all
  to authenticated
  using (public.can_manage_recording(transcripts.recording_id))
  with check (public.can_manage_recording(transcripts.recording_id));

-- ---------------------------------------------------------------------------
-- workout_notes: coach drafts/edits/publishes, the coach's members read published only
-- ---------------------------------------------------------------------------

create index if not exists workout_notes_recording_id_idx on public.workout_notes (recording_id);

alter table public.workout_notes
  drop constraint if exists workout_notes_draft_content_shape;
alter table public.workout_notes
  add constraint workout_notes_draft_content_shape
  check (public.is_valid_note_checklist(draft_content));

alter table public.workout_notes
  drop constraint if exists workout_notes_edited_content_shape;
alter table public.workout_notes
  add constraint workout_notes_edited_content_shape
  check (public.is_valid_note_checklist(edited_content));

comment on column public.workout_notes.draft_content is
  'Checklist JSON produced by the notes drafter. Shape enforced by is_valid_note_checklist().';
comment on column public.workout_notes.edited_content is
  'Coach-edited checklist JSON; overrides draft_content once set. Shape enforced by is_valid_note_checklist().';

-- REPLACES workout_notes_select_published_or_owner. Its `published_at is not null` arm was
-- unqualified, so published notes were readable by every authenticated user rather than by the
-- coach's own members. Intent preserved, audience narrowed.
drop policy if exists "workout_notes_select_published_or_owner" on public.workout_notes;
drop policy if exists "workout_notes_select_coach_or_published_member" on public.workout_notes;
create policy "workout_notes_select_coach_or_published_member"
  on public.workout_notes for select
  to authenticated
  using (
    public.can_manage_recording(workout_notes.recording_id)
    or (published_at is not null and public.can_read_published_notes(workout_notes.recording_id))
  );

-- REPLACES workout_notes_write_owner (`created_by = auth.uid()`). Same intent -- the coach owns
-- the note -- but keyed off the recording, because the Edge Function creates the row as the
-- service role and a coach must still be able to edit and publish what the pipeline drafted.
drop policy if exists "workout_notes_write_owner" on public.workout_notes;
drop policy if exists "workout_notes_write_recording_coach" on public.workout_notes;
create policy "workout_notes_write_recording_coach"
  on public.workout_notes for all
  to authenticated
  using (public.can_manage_recording(workout_notes.recording_id))
  with check (public.can_manage_recording(workout_notes.recording_id));

-- Publishing a note is the one coach-driven step of the recording state machine, so keep
-- recordings.status in step with it instead of asking the client to write the status itself
-- (which the guard trigger would refuse from any other state). The draft <-> published pair is
-- exactly what recordings_guard_client_writes allows the coach to do.
create or replace function public.workout_notes_sync_recording_status()
returns trigger
language plpgsql
as $$
begin
  if new.published_at is not null then
    update public.recordings
       set status = 'published'
     where id = new.recording_id
       and status = 'draft';
  elsif tg_op = 'UPDATE' and old.published_at is not null then
    update public.recordings
       set status = 'draft'
     where id = new.recording_id
       and status = 'published';
  end if;
  return new;
end;
$$;

revoke all on function public.workout_notes_sync_recording_status() from public;

drop trigger if exists workout_notes_sync_recording_status on public.workout_notes;
create trigger workout_notes_sync_recording_status
  after insert or update of published_at on public.workout_notes
  for each row execute function public.workout_notes_sync_recording_status();

-- ---------------------------------------------------------------------------
-- workout_note_progress: a member ticking off items of a published checklist
-- ---------------------------------------------------------------------------

create table if not exists public.workout_note_progress (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles (id) on delete cascade,
  note_id uuid not null references public.workout_notes (id) on delete cascade,
  item_key text not null,
  checked_at timestamptz not null default now(),
  unique (member_id, note_id, item_key)
);

comment on table public.workout_note_progress is
  'One row per checklist item a member has ticked off. item_key matches an items[].key of the note checklist; absence of a row means unticked.';

create index if not exists workout_note_progress_note_idx
  on public.workout_note_progress (note_id, member_id);

alter table public.workout_note_progress enable row level security;

-- True when the caller may see the note at all (its coach, or one of that coach's members once it
-- is published). SECURITY DEFINER so it can be used from workout_note_progress' policies without
-- dragging workout_notes' own RLS in.
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
        or (wn.published_at is not null and public.can_read_published_notes(wn.recording_id))
      )
  );
$$;

revoke all on function public.can_read_workout_note(uuid) from public;
grant execute on function public.can_read_workout_note(uuid) to anon, authenticated, service_role;

-- Strictly self-only: a member reads and writes their OWN ticks and nobody else's -- not even
-- their coach, who has no business seeing a half-finished checklist. New ticks additionally have
-- to point at a note the member can actually read, so progress rows cannot be parked on arbitrary
-- note ids.
drop policy if exists "workout_note_progress_select_self" on public.workout_note_progress;
create policy "workout_note_progress_select_self"
  on public.workout_note_progress for select
  to authenticated
  using (member_id = auth.uid());

drop policy if exists "workout_note_progress_insert_self" on public.workout_note_progress;
create policy "workout_note_progress_insert_self"
  on public.workout_note_progress for insert
  to authenticated
  with check (member_id = auth.uid() and public.can_read_workout_note(note_id));

drop policy if exists "workout_note_progress_update_self" on public.workout_note_progress;
create policy "workout_note_progress_update_self"
  on public.workout_note_progress for update
  to authenticated
  using (member_id = auth.uid())
  with check (member_id = auth.uid() and public.can_read_workout_note(note_id));

drop policy if exists "workout_note_progress_delete_self" on public.workout_note_progress;
create policy "workout_note_progress_delete_self"
  on public.workout_note_progress for delete
  to authenticated
  using (member_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Storage: private `recordings` bucket
-- ---------------------------------------------------------------------------

-- 500 MB ceiling and a video/audio allow-list, enforced by storage-api on upload. The bucket is
-- private: there is no public URL, and the Edge Function reads objects through a short-lived
-- signed URL minted with the service role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recordings',
  'recordings',
  false,
  524288000,
  array[
    'video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/3gpp', 'video/mpeg',
    'audio/mp4', 'audio/mpeg', 'audio/m4a', 'audio/x-m4a', 'audio/aac',
    'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Object-name gate for the `recordings` bucket: the caller may only touch objects under their own
-- `<auth.uid()>/` prefix. auth.uid() is a uuid, so its text form contains no LIKE metacharacter
-- and cannot be spoofed by a crafted name; `..` anywhere is refused outright so no name can be
-- normalised out of the prefix by a client or a CDN in front of Storage.
--
-- Not SECURITY DEFINER: it reads no table, only auth.uid(). EXECUTE stays granted to anon and
-- authenticated -- this predicate is reachable from an RLS expression, and revoking EXECUTE from a
-- role that can still reach the function segfaults this Postgres build (see 20260919120000 and
-- 20260919140000). The security boundary is auth.uid(), which is NULL for anon.
create or replace function public.owns_recording_object(p_name text)
returns boolean
language sql
stable
as $$
  select auth.uid() is not null
     and p_name is not null
     and length(p_name) <= 512
     and position('..' in p_name) = 0
     and p_name like (auth.uid()::text || '/%');
$$;

revoke all on function public.owns_recording_object(text) from public;
grant execute on function public.owns_recording_object(text) to anon, authenticated, service_role;

-- storage.objects already has RLS enabled with zero policies for this bucket (deny-all). These
-- four give the uploading coach -- and only them -- access to their own prefix. The service role
-- (Edge Function) has BYPASSRLS and is unaffected; `anon` fails on auth.uid() is null.
drop policy if exists "recordings_objects_select_own" on storage.objects;
create policy "recordings_objects_select_own"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'recordings' and public.owns_recording_object(name));

drop policy if exists "recordings_objects_insert_own" on storage.objects;
create policy "recordings_objects_insert_own"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'recordings' and public.owns_recording_object(name));

-- UPDATE covers overwrite/move: both the existing object and the proposed name must be the
-- caller's, so an overwrite cannot be aimed at someone else's file.
drop policy if exists "recordings_objects_update_own" on storage.objects;
create policy "recordings_objects_update_own"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'recordings' and public.owns_recording_object(name))
  with check (bucket_id = 'recordings' and public.owns_recording_object(name));

drop policy if exists "recordings_objects_delete_own" on storage.objects;
create policy "recordings_objects_delete_own"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'recordings' and public.owns_recording_object(name));
