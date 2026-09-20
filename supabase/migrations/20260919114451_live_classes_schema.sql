-- live_classes: scheduled two-way video sessions (Agora), coach-hosted.
create table public.live_classes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  agora_channel_name text not null unique,
  starts_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'ended', 'cancelled')),
  created_at timestamptz not null default now()
);

alter table public.live_classes enable row level security;

create policy "live_classes_select_authenticated"
  on public.live_classes for select
  using (auth.uid() is not null);

create policy "live_classes_write_coach"
  on public.live_classes for all
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

-- live_class_participants: who joined which live class, and when.
create table public.live_class_participants (
  id uuid primary key default gen_random_uuid(),
  live_class_id uuid not null references public.live_classes (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz,
  left_at timestamptz,
  unique (live_class_id, member_id)
);

alter table public.live_class_participants enable row level security;

create policy "live_class_participants_select_self_or_coach"
  on public.live_class_participants for select
  using (
    member_id = auth.uid()
    or exists (
      select 1 from public.live_classes lc
      where lc.id = live_class_participants.live_class_id and lc.coach_id = auth.uid()
    )
  );

create policy "live_class_participants_write_self"
  on public.live_class_participants for all
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

-- recordings: uploaded session video driving the async transcription pipeline.
create table public.recordings (
  id uuid primary key default gen_random_uuid(),
  live_class_id uuid references public.live_classes (id) on delete set null,
  uploaded_by uuid not null references public.profiles (id) on delete cascade,
  storage_path text,
  status text not null default 'uploading' check (
    status in ('uploading', 'transcribing', 'draft', 'published', 'failed')
  ),
  created_at timestamptz not null default now()
);

alter table public.recordings enable row level security;

create policy "recordings_select_owner_coach_or_published"
  on public.recordings for select
  using (
    uploaded_by = auth.uid()
    or status = 'published'
    or exists (
      select 1 from public.live_classes lc
      where lc.id = recordings.live_class_id and lc.coach_id = auth.uid()
    )
  );

create policy "recordings_insert_self"
  on public.recordings for insert
  with check (uploaded_by = auth.uid());

create policy "recordings_update_owner_or_coach"
  on public.recordings for update
  using (
    uploaded_by = auth.uid()
    or exists (
      select 1 from public.live_classes lc
      where lc.id = recordings.live_class_id and lc.coach_id = auth.uid()
    )
  )
  with check (
    uploaded_by = auth.uid()
    or exists (
      select 1 from public.live_classes lc
      where lc.id = recordings.live_class_id and lc.coach_id = auth.uid()
    )
  );

create policy "recordings_delete_owner"
  on public.recordings for delete
  using (uploaded_by = auth.uid());

-- transcripts: raw ASR output for a recording (durable coaching-library asset, never discarded).
create table public.transcripts (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null unique references public.recordings (id) on delete cascade,
  raw_text text,
  created_at timestamptz not null default now()
);

alter table public.transcripts enable row level security;

create policy "transcripts_select_via_recording"
  on public.transcripts for select
  using (
    exists (
      select 1 from public.recordings r
      where r.id = transcripts.recording_id
        and (r.uploaded_by = auth.uid() or r.status = 'published')
    )
  );

create policy "transcripts_write_via_recording_owner"
  on public.transcripts for all
  using (
    exists (
      select 1 from public.recordings r
      where r.id = transcripts.recording_id and r.uploaded_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.recordings r
      where r.id = transcripts.recording_id and r.uploaded_by = auth.uid()
    )
  );

-- workout_notes: draft (ASR-generated) -> coach-edited -> published checklist for a recording.
create table public.workout_notes (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null references public.recordings (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  draft_content text,
  edited_content text,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.workout_notes enable row level security;

create policy "workout_notes_select_published_or_owner"
  on public.workout_notes for select
  using (
    published_at is not null
    or created_by = auth.uid()
    or exists (
      select 1 from public.recordings r
      where r.id = workout_notes.recording_id and r.uploaded_by = auth.uid()
    )
  );

create policy "workout_notes_write_owner"
  on public.workout_notes for all
  using (created_by = auth.uid())
  with check (created_by = auth.uid());
