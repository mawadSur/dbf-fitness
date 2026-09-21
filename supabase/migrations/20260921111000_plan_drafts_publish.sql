-- D1b.2 — plan drafts and safe publish.
--
-- The problem this closes: a coach editing a live plan was editing the rows the
-- member is looking at, one PostgREST write at a time. A half-saved edit was
-- visible immediately, a deleted day took the member's completions with it, and
-- two coaches (or two tabs) silently overwrote each other.
--
-- The shape of the fix:
--   * edits accumulate in `workout_plan_drafts` as ONE jsonb document, invisible
--     to the member;
--   * `publish_plan()` validates that document, then DIFF-APPLIES it to the live
--     rows: matched rows are UPDATED IN PLACE (ids stay stable), new rows are
--     inserted, and rows the coach dropped are ARCHIVED, never deleted;
--   * both RPCs use optimistic concurrency against `workout_plans.rev`, so a
--     stale editor is told to reload instead of clobbering.
--
-- Because rows are archived rather than deleted and completions carry their own
-- snapshots (D1a), a member who is mid-workout when their coach publishes keeps
-- a coherent session: finish_workout() ignores archived exercise ids and the
-- completion records the day/exercise names as they were.

begin;

-- ---------------------------------------------------------------------------
-- 1. Draft storage
-- ---------------------------------------------------------------------------

create table if not exists public.workout_plan_drafts (
  plan_id    uuid primary key references public.workout_plans(id) on delete cascade,
  draft      jsonb       not null,
  base_rev   int         not null,
  updated_by uuid        references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.workout_plan_drafts is
  'Work-in-progress plan edits. One row per plan. Readable and writable ONLY by '
  'the member''s CURRENT coach or an admin — never by the member themselves.';

alter table public.workout_plan_drafts enable row level security;

-- One combined policy rather than four: the predicate is identical for every
-- verb, and a single policy cannot drift out of sync with itself.
drop policy if exists workout_plan_drafts_rw_coach on public.workout_plan_drafts;
create policy workout_plan_drafts_rw_coach on public.workout_plan_drafts
  for all
  using (
    exists (
      select 1 from public.workout_plans wp
      where wp.id = workout_plan_drafts.plan_id
        and (public.is_coach_of_member(wp.member_id) or (select public.is_admin()))
    )
  )
  with check (
    exists (
      select 1 from public.workout_plans wp
      where wp.id = workout_plan_drafts.plan_id
        and (public.is_coach_of_member(wp.member_id) or (select public.is_admin()))
    )
  );

create index if not exists workout_plan_drafts_updated_idx
  on public.workout_plan_drafts (updated_at desc);

-- ---------------------------------------------------------------------------
-- 2. Archived day numbering
--
-- UNIQUE(workout_plan_id, day_number) covers archived rows too, so an archived
-- "day 3" would block the coach from creating a new day 3. Archived days are
-- moved to a negative number from this sequence: globally unique, never
-- colliding with a live day, and harmless to history because
-- workout_completions.day_number is a snapshot taken at completion time.
-- ---------------------------------------------------------------------------

create sequence if not exists public.workout_days_archived_seq as int;

-- ---------------------------------------------------------------------------
-- 3. Draft validation and normalisation.
--
-- ONE function is the gate for everything that ever reaches the live rows.
-- It does three jobs at once, and doing them together is the point:
--   * it REJECTS malformed input (wrong JSON types, out-of-range numbers,
--     non-https video URLs, duplicate day numbers, oversized documents);
--   * it STRIPS unknown fields, so a future client cannot smuggle a column
--     name past the publisher;
--   * it returns a CANONICAL document, so publish_plan() can read every field
--     positionally without re-checking anything.
--
-- Every rejection is 22023 'invalid_draft' with the specific reason in DETAIL:
-- one code for the client to branch on, a human sentence for the coach.
-- ---------------------------------------------------------------------------

-- Field-level helpers. They exist so that every rejection in this migration
-- carries the same errcode and the same sentence shape, and so the normaliser
-- below reads as the SCHEMA it enforces rather than as a wall of type checks.

create or replace function public.plan_draft_is_id(p_value jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_value is null
      or jsonb_typeof(p_value) = 'null'
      or (jsonb_typeof(p_value) = 'string'
          and p_value #>> '{}' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
$$;

create or replace function public.plan_draft_int(
  p_value jsonb, p_field text, p_min int, p_max int, p_nullable boolean)
returns int
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_n numeric;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    if p_nullable then
      return null;
    end if;
    raise exception 'invalid_draft' using errcode = '22023', detail = p_field || ' is required';
  end if;
  if jsonb_typeof(p_value) <> 'number' then
    raise exception 'invalid_draft' using errcode = '22023',
      detail = p_field || ' must be a number';
  end if;
  v_n := (p_value #>> '{}')::numeric;
  if v_n <> trunc(v_n) then
    raise exception 'invalid_draft' using errcode = '22023',
      detail = p_field || ' must be a whole number';
  end if;
  if v_n < p_min or v_n > p_max then
    raise exception 'invalid_draft' using errcode = '22023',
      detail = p_field || ' must be between ' || p_min || ' and ' || p_max;
  end if;
  return v_n::int;
end;
$$;

create or replace function public.plan_draft_text(p_value jsonb, p_field text, p_max int)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_text text;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_value) <> 'string' then
    raise exception 'invalid_draft' using errcode = '22023',
      detail = p_field || ' must be a string or null';
  end if;
  v_text := nullif(btrim(p_value #>> '{}'), '');
  if v_text is not null and char_length(v_text) > p_max then
    raise exception 'invalid_draft' using errcode = '22023',
      detail = p_field || ' must be at most ' || p_max || ' characters';
  end if;
  return v_text;
end;
$$;

create or replace function public.plan_draft_key(p_value jsonb, p_field text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_key text := public.plan_draft_text(p_value, p_field, 40);
begin
  if v_key is not null and v_key !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'invalid_draft' using errcode = '22023',
      detail = p_field || ' must be kebab-case (a-z, 0-9, hyphens)';
  end if;
  return v_key;
end;
$$;

-- https only, and no whitespace: the same shape the exercises_video_url_https
-- CHECK enforces, refused here so the coach gets a sentence instead of 23514.
create or replace function public.plan_draft_url(p_value jsonb)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_url text := public.plan_draft_text(p_value, 'video_url', 2048);
begin
  if v_url is not null and v_url !~ '^https://[^[:space:]]+$' then
    raise exception 'invalid_draft' using errcode = '22023',
      detail = 'video_url must be an https:// URL';
  end if;
  return v_url;
end;
$$;

-- The prescription block. Bounds mirror the exercises_prescription_bounds
-- CHECK exactly; the final renderability test is the interesting one: a mode
-- whose numbers cannot produce reps_or_duration text (mode 'reps' with no rep
-- count) is rejected HERE, where the coach can still fix it, instead of
-- surfacing later as a NOT NULL violation on a half-published plan.
create or replace function public.plan_draft_prescription(p_value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_mode   text;
  v_weight numeric;
  v_unit   text;
  v_out    jsonb;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    raise exception 'invalid_draft' using errcode = '22023',
      detail = 'prescription is required';
  end if;
  if jsonb_typeof(p_value) <> 'object' then
    raise exception 'invalid_draft' using errcode = '22023',
      detail = 'prescription must be an object';
  end if;

  v_mode := public.plan_draft_text(p_value -> 'mode', 'prescription.mode', 20);
  if v_mode is null or v_mode not in ('reps', 'range', 'seconds', 'per_side', 'amrap', 'distance', 'notes') then
    raise exception 'invalid_draft' using errcode = '22023',
      detail = 'prescription.mode must be one of reps, range, seconds, per_side, amrap, distance, notes';
  end if;

  if jsonb_typeof(coalesce(p_value -> 'weight', 'null'::jsonb)) = 'null' then
    v_weight := null;
  elsif jsonb_typeof(p_value -> 'weight') <> 'number' then
    raise exception 'invalid_draft' using errcode = '22023',
      detail = 'prescription.weight must be a number';
  else
    v_weight := (p_value #>> '{weight}')::numeric;
    if v_weight <= 0 or v_weight > 1000 then
      raise exception 'invalid_draft' using errcode = '22023',
        detail = 'prescription.weight must be between 0 and 1000';
    end if;
    v_weight := round(v_weight, 2);
  end if;

  v_unit := public.plan_draft_text(p_value -> 'weight_unit', 'prescription.weight_unit', 2);
  if v_unit is not null and v_unit not in ('kg', 'lb') then
    raise exception 'invalid_draft' using errcode = '22023',
      detail = 'prescription.weight_unit must be kg or lb';
  end if;

  v_out := jsonb_build_object(
    'mode',         v_mode,
    'sets',         to_jsonb(public.plan_draft_int(p_value -> 'sets',         'prescription.sets',         1, 20,     true)),
    'reps_min',     to_jsonb(public.plan_draft_int(p_value -> 'reps_min',     'prescription.reps_min',     1, 100,    true)),
    'reps_max',     to_jsonb(public.plan_draft_int(p_value -> 'reps_max',     'prescription.reps_max',     1, 100,    true)),
    'seconds',      to_jsonb(public.plan_draft_int(p_value -> 'seconds',      'prescription.seconds',      1, 3600,   true)),
    'rest_seconds', to_jsonb(public.plan_draft_int(p_value -> 'rest_seconds', 'prescription.rest_seconds', 0, 600,    true)),
    'weight',       to_jsonb(v_weight),
    'weight_unit',  to_jsonb(v_unit),
    'distance_m',   to_jsonb(public.plan_draft_int(p_value -> 'distance_m',   'prescription.distance_m',   1, 100000, true)),
    'notes',        to_jsonb(public.plan_draft_text(p_value -> 'notes',       'prescription.notes',        2000))
  );

  if (v_out ->> 'reps_min') is not null and (v_out ->> 'reps_max') is not null
     and (v_out ->> 'reps_max')::int < (v_out ->> 'reps_min')::int then
    raise exception 'invalid_draft' using errcode = '22023',
      detail = 'prescription.reps_max must be at least reps_min';
  end if;

  if public.format_prescription_text(
       v_mode,
       (v_out ->> 'sets')::int, (v_out ->> 'reps_min')::int, (v_out ->> 'reps_max')::int,
       (v_out ->> 'seconds')::int, (v_out ->> 'weight')::numeric, v_out ->> 'weight_unit',
       (v_out ->> 'distance_m')::int, v_out ->> 'notes') is null then
    raise exception 'invalid_draft' using errcode = '22023',
      detail = 'prescription is incomplete for mode ' || v_mode;
  end if;

  return v_out;
end;
$$;

revoke all on function public.plan_draft_is_id(jsonb) from public;
revoke all on function public.plan_draft_int(jsonb, text, int, int, boolean) from public;
revoke all on function public.plan_draft_text(jsonb, text, int) from public;
revoke all on function public.plan_draft_key(jsonb, text) from public;
revoke all on function public.plan_draft_url(jsonb) from public;
revoke all on function public.plan_draft_prescription(jsonb) from public;

create or replace function public.plan_draft_normalize(p_draft jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_days   jsonb := '[]'::jsonb;
  v_exs    jsonb;
  v_day    jsonb;
  v_ex     jsonb;
  v_pres   jsonb;
  v_title  text;
  v_desc   text;
  v_mode   text;
  v_name   text;
  v_block  text;
  v_nums   int[] := '{}';
  v_num    int;
  v_pos    int;
  v_count  int;
begin
  if p_draft is null or jsonb_typeof(p_draft) <> 'object' then
    raise exception 'invalid_draft' using errcode = '22023',
      detail = 'draft must be a JSON object';
  end if;

  -- Size is checked on the TEXT form, not on the array lengths, because a
  -- document can be small in rows and enormous in one string field.
  if octet_length(p_draft::text) > 262144 then
    raise exception 'invalid_draft' using errcode = '22023',
      detail = 'draft exceeds the 256 kB limit';
  end if;

  if jsonb_typeof(coalesce(p_draft -> 'title', 'null'::jsonb)) <> 'string' then
    raise exception 'invalid_draft' using errcode = '22023',
      detail = 'title must be a string';
  end if;
  v_title := nullif(btrim(p_draft ->> 'title'), '');
  if v_title is null or char_length(v_title) > 200 then
    raise exception 'invalid_draft' using errcode = '22023',
      detail = 'title must be 1..200 characters';
  end if;

  if jsonb_typeof(coalesce(p_draft -> 'description', 'null'::jsonb)) not in ('string', 'null') then
    raise exception 'invalid_draft' using errcode = '22023',
      detail = 'description must be a string or null';
  end if;
  v_desc := nullif(btrim(coalesce(p_draft ->> 'description', '')), '');
  if v_desc is not null and char_length(v_desc) > 4000 then
    raise exception 'invalid_draft' using errcode = '22023',
      detail = 'description must be at most 4000 characters';
  end if;

  if jsonb_typeof(coalesce(p_draft -> 'days', 'null'::jsonb)) <> 'array' then
    raise exception 'invalid_draft' using errcode = '22023',
      detail = 'days must be an array';
  end if;
  v_count := jsonb_array_length(p_draft -> 'days');
  if v_count < 1 or v_count > 31 then
    raise exception 'invalid_draft' using errcode = '22023',
      detail = 'a plan needs between 1 and 31 days';
  end if;

  for v_day in select value from jsonb_array_elements(p_draft -> 'days') loop
    if jsonb_typeof(v_day) <> 'object' then
      raise exception 'invalid_draft' using errcode = '22023',
        detail = 'each day must be an object';
    end if;

    if not public.plan_draft_is_id(v_day -> 'id') then
      raise exception 'invalid_draft' using errcode = '22023',
        detail = 'day id must be a uuid or null';
    end if;

    v_num := public.plan_draft_int(v_day -> 'day_number', 'day_number', 1, 31, false);
    if v_num = any (v_nums) then
      raise exception 'invalid_draft' using errcode = '22023',
        detail = 'day_number ' || v_num || ' appears twice';
    end if;
    v_nums := v_nums || v_num;

    if jsonb_typeof(coalesce(v_day -> 'block_name', 'null'::jsonb)) <> 'string' then
      raise exception 'invalid_draft' using errcode = '22023',
        detail = 'block_name must be a string';
    end if;
    v_block := nullif(btrim(v_day ->> 'block_name'), '');
    if v_block is null or char_length(v_block) > 120 then
      raise exception 'invalid_draft' using errcode = '22023',
        detail = 'block_name must be 1..120 characters';
    end if;

    if jsonb_typeof(coalesce(v_day -> 'exercises', 'null'::jsonb)) <> 'array' then
      raise exception 'invalid_draft' using errcode = '22023',
        detail = 'exercises must be an array';
    end if;
    if jsonb_array_length(v_day -> 'exercises') > 50 then
      raise exception 'invalid_draft' using errcode = '22023',
        detail = 'a day may hold at most 50 exercises';
    end if;

    v_exs := '[]'::jsonb;
    v_pos := 0;

    for v_ex in select value from jsonb_array_elements(v_day -> 'exercises') loop
      if jsonb_typeof(v_ex) <> 'object' then
        raise exception 'invalid_draft' using errcode = '22023',
          detail = 'each exercise must be an object';
      end if;
      if not public.plan_draft_is_id(v_ex -> 'id') then
        raise exception 'invalid_draft' using errcode = '22023',
          detail = 'exercise id must be a uuid or null';
      end if;

      if jsonb_typeof(coalesce(v_ex -> 'name', 'null'::jsonb)) <> 'string' then
        raise exception 'invalid_draft' using errcode = '22023',
          detail = 'exercise name must be a string';
      end if;
      v_name := nullif(btrim(v_ex ->> 'name'), '');
      if v_name is null or char_length(v_name) > 120 then
        raise exception 'invalid_draft' using errcode = '22023',
          detail = 'exercise name must be 1..120 characters';
      end if;

      v_pres := public.plan_draft_prescription(v_ex -> 'prescription');
      v_mode := v_pres ->> 'mode';

      -- Position is taken from the ARRAY ORDER, not from the client's
      -- "position" field: two exercises claiming position 0 is then simply
      -- impossible rather than an error the coach has to understand.
      v_exs := v_exs || jsonb_build_object(
        'id',           coalesce(v_ex -> 'id', 'null'::jsonb),
        'position',     v_pos,
        'name',         v_name,
        'exercise_key', to_jsonb(public.plan_draft_key(v_ex -> 'exercise_key', 'exercise_key')),
        'image_key',    to_jsonb(public.plan_draft_key(v_ex -> 'image_key', 'image_key')),
        'prescription', v_pres,
        'detail',       to_jsonb(public.plan_draft_text(v_ex -> 'detail', 'detail', 2000)),
        'video_url',    to_jsonb(public.plan_draft_url(v_ex -> 'video_url'))
      );
      v_pos := v_pos + 1;
    end loop;

    v_days := v_days || jsonb_build_object(
      'id',               coalesce(v_day -> 'id', 'null'::jsonb),
      'day_number',       v_num,
      'block_name',       v_block,
      'duration_minutes', to_jsonb(public.plan_draft_int(v_day -> 'duration_minutes', 'duration_minutes', 1, 600, true)),
      'exercises',        v_exs
    );
  end loop;

  return jsonb_build_object(
    'title',       v_title,
    'description', to_jsonb(v_desc),
    'days',        v_days
  );
end;
$$;

comment on function public.plan_draft_normalize(jsonb) is
  'Validates a plan draft document and returns its canonical form with unknown '
  'fields stripped. Raises 22023 ''invalid_draft'' with the reason in DETAIL.';

revoke all on function public.plan_draft_normalize(jsonb) from public;

-- ---------------------------------------------------------------------------
-- 4. The authorization gate, shared by both RPCs.
--
-- Both functions are SECURITY DEFINER, so the RLS policy above does not
-- protect them: the gate has to be IN THE BODY. It resolves the plan and the
-- caller's right to edit it in one place, so the two RPCs cannot drift apart.
-- Note it asks is_coach_of_member(member) — the member's CURRENT coach — not
-- workout_plans.coach_id, which D1a demoted to authorship.
-- ---------------------------------------------------------------------------

create or replace function public.plan_editor_gate(p_plan uuid)
returns table (member_id uuid, rev int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_member uuid;
  v_rev    int;
begin
  if v_uid is null then
    raise exception 'not_your_member' using errcode = '42501',
      hint = 'Sign in as this member''s coach.';
  end if;

  select wp.member_id, wp.rev into v_member, v_rev
  from public.workout_plans wp
  where wp.id = p_plan;

  if v_member is null then
    raise exception 'plan_not_found' using errcode = 'P0002',
      hint = 'This plan no longer exists.';
  end if;

  -- The member is deliberately NOT an editor of their own plan, and is not
  -- allowed to see drafts at all.
  if not (public.is_coach_of_member(v_member) or public.is_admin()) then
    raise exception 'not_your_member' using errcode = '42501',
      hint = 'Only this member''s current coach or an admin can edit their plan.';
  end if;

  return query select v_member, v_rev;
end;
$$;

comment on function public.plan_editor_gate(uuid) is
  'Shared in-body gate for the plan draft RPCs: resolves the plan and asserts '
  'the caller is the member''s CURRENT coach or an admin. 42501 not_your_member, '
  'P0002 plan_not_found.';

revoke all on function public.plan_editor_gate(uuid) from public;

-- ---------------------------------------------------------------------------
-- 5. save_plan_draft — optimistic-concurrency autosave.
--
-- The draft is deliberately NOT fully validated here. A coach halfway through
-- typing a day has an incomplete document, and refusing to autosave it would
-- lose their work; the full schema is enforced at publish time, where it
-- matters. Only the outer shape and the size are checked, so the column can
-- never hold something publish_plan() would not even be able to read.
-- ---------------------------------------------------------------------------

create or replace function public.save_plan_draft(
  p_plan              uuid,
  p_draft             jsonb,
  p_expected_base_rev int
)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_rev int;
begin
  select g.rev into v_rev from public.plan_editor_gate(p_plan) g;

  if p_draft is null or jsonb_typeof(p_draft) <> 'object'
     or jsonb_typeof(coalesce(p_draft -> 'days', 'null'::jsonb)) <> 'array' then
    raise exception 'invalid_draft' using errcode = '22023',
      detail = 'draft must be an object with a days array';
  end if;
  if octet_length(p_draft::text) > 262144 then
    raise exception 'invalid_draft' using errcode = '22023',
      detail = 'draft exceeds the 256 kB limit';
  end if;

  -- The editor states which revision it loaded. If the plan has moved on
  -- (another coach published, or the member was reassigned and the new coach
  -- published), the autosave is refused rather than silently based on a plan
  -- that no longer exists in that form.
  if p_expected_base_rev is distinct from v_rev then
    raise exception 'stale_draft' using errcode = '40001',
      hint = 'This plan changed while you were editing. Reload it.';
  end if;

  insert into public.workout_plan_drafts as d (plan_id, draft, base_rev, updated_by, updated_at)
  values (p_plan, p_draft, v_rev, v_uid, now())
  on conflict (plan_id) do update
    set draft      = excluded.draft,
        base_rev   = excluded.base_rev,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;

  return v_rev;
end;
$$;

comment on function public.save_plan_draft(uuid, jsonb, int) is
  'Upserts the working draft for a plan. Returns the base revision it was '
  'saved against. 42501 not_your_member, P0002 plan_not_found, 40001 '
  'stale_draft, 22023 invalid_draft.';

revoke all on function public.save_plan_draft(uuid, jsonb, int) from public;

-- ---------------------------------------------------------------------------
-- 6. publish_plan — the diff-apply.
--
-- The rule that makes this safe for a member who is mid-session: ROW IDS ARE
-- STABLE AND ROWS ARE NEVER DELETED. A day or exercise the coach removed gets
-- archived_at = now(); its completions keep pointing at it, and D1a's snapshot
-- columns already recorded the names. A day the coach kept keeps its id, so a
-- client holding that id keeps working.
--
-- Day renumbering relies on the DEFERRABLE INITIALLY DEFERRED unique from
-- D1a: days can pass through transiently duplicated numbers while the new
-- order is written, and the constraint is verified once at commit.
-- ---------------------------------------------------------------------------

create or replace function public.publish_plan(p_plan uuid, p_expected_rev int)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rev     int;
  v_new_rev int;
  v_base    int;
  v_draft   jsonb;
  v_doc     jsonb;
  v_day     jsonb;
  v_ex      jsonb;
  v_pres    jsonb;
  v_day_ids uuid[] := '{}';
  v_ex_ids  uuid[];
  v_day_id  uuid;
  v_text    text;
begin
  select g.rev into v_rev from public.plan_editor_gate(p_plan) g;

  -- Serialise concurrent publishes of the same plan before reading the rev we
  -- are about to bump.
  perform 1 from public.workout_plans where id = p_plan for update;
  select wp.rev into v_rev from public.workout_plans wp where wp.id = p_plan;

  select d.draft, d.base_rev into v_draft, v_base
  from public.workout_plan_drafts d
  where d.plan_id = p_plan;

  if v_draft is null then
    raise exception 'draft_not_found' using errcode = 'P0002',
      hint = 'There is nothing to publish for this plan.';
  end if;

  -- Two independent staleness checks: the caller must be on the current rev,
  -- AND the draft must have been written against it. The second catches the
  -- case where the editor reloaded the plan but is publishing an old draft.
  if p_expected_rev is distinct from v_rev or v_base is distinct from v_rev then
    raise exception 'stale_plan' using errcode = '40001',
      hint = 'This plan changed while you were editing. Reload it.';
  end if;

  v_doc := public.plan_draft_normalize(v_draft);

  select coalesce(array_agg((d.value ->> 'id')::uuid), '{}'::uuid[])
    into v_day_ids
  from jsonb_array_elements(v_doc -> 'days') d
  where d.value ->> 'id' is not null;

  if exists (
    select 1 from unnest(v_day_ids) i(id)
    where not exists (
      select 1 from public.workout_days wd
      where wd.id = i.id and wd.workout_plan_id = p_plan)
  ) then
    raise exception 'unknown_day_id' using errcode = '22023',
      detail = 'a day id in the draft does not belong to this plan';
  end if;

  -- Dropped days: archive their exercises first, then the day itself. The
  -- archived day is moved to a negative number from the sequence so it cannot
  -- block the coach from reusing that day number for a new day.
  update public.exercises e
     set archived_at = now()
   where e.archived_at is null
     and e.workout_day_id in (
       select wd.id from public.workout_days wd
       where wd.workout_plan_id = p_plan
         and wd.archived_at is null
         and not (wd.id = any (v_day_ids)));

  update public.workout_days wd
     set archived_at = now(),
         day_number  = - nextval('public.workout_days_archived_seq')
   where wd.workout_plan_id = p_plan
     and wd.archived_at is null
     and not (wd.id = any (v_day_ids));

  for v_day in select value from jsonb_array_elements(v_doc -> 'days') loop
    if v_day ->> 'id' is null then
      insert into public.workout_days (workout_plan_id, day_number, block_name, duration_minutes)
      values (p_plan, (v_day ->> 'day_number')::int, v_day ->> 'block_name',
              (v_day ->> 'duration_minutes')::int)
      returning id into v_day_id;
    else
      v_day_id := (v_day ->> 'id')::uuid;
      update public.workout_days
         set day_number       = (v_day ->> 'day_number')::int,
             block_name       = v_day ->> 'block_name',
             duration_minutes = (v_day ->> 'duration_minutes')::int,
             archived_at      = null
       where id = v_day_id;
    end if;

    select coalesce(array_agg((x.value ->> 'id')::uuid), '{}'::uuid[])
      into v_ex_ids
    from jsonb_array_elements(v_day -> 'exercises') x
    where x.value ->> 'id' is not null;

    if exists (
      select 1 from unnest(v_ex_ids) i(id)
      where not exists (
        select 1 from public.exercises e
        where e.id = i.id and e.workout_day_id = v_day_id)
    ) then
      raise exception 'unknown_exercise_id' using errcode = '22023',
        detail = 'an exercise id in the draft does not belong to its day';
    end if;

    update public.exercises e
       set archived_at = now()
     where e.workout_day_id = v_day_id
       and e.archived_at is null
       and not (e.id = any (v_ex_ids));

    for v_ex in select value from jsonb_array_elements(v_day -> 'exercises') loop
      v_pres := v_ex -> 'prescription';
      -- Non-null by construction: plan_draft_prescription() already refused
      -- any structure this cannot render.
      v_text := public.format_prescription_text(
        v_pres ->> 'mode', (v_pres ->> 'sets')::int, (v_pres ->> 'reps_min')::int,
        (v_pres ->> 'reps_max')::int, (v_pres ->> 'seconds')::int,
        (v_pres ->> 'weight')::numeric, v_pres ->> 'weight_unit',
        (v_pres ->> 'distance_m')::int, v_pres ->> 'notes');

      if v_ex ->> 'id' is null then
        insert into public.exercises (
          workout_day_id, name, reps_or_duration, order_index, detail, image_key,
          prescription_mode, sets, reps_min, reps_max, seconds, rest_seconds,
          weight, weight_unit, distance_m, notes, exercise_key, video_url)
        values (
          v_day_id, v_ex ->> 'name', v_text, (v_ex ->> 'position')::int,
          v_ex ->> 'detail', v_ex ->> 'image_key',
          v_pres ->> 'mode', (v_pres ->> 'sets')::int, (v_pres ->> 'reps_min')::int,
          (v_pres ->> 'reps_max')::int, (v_pres ->> 'seconds')::int,
          (v_pres ->> 'rest_seconds')::int, (v_pres ->> 'weight')::numeric,
          v_pres ->> 'weight_unit', (v_pres ->> 'distance_m')::int,
          v_pres ->> 'notes', v_ex ->> 'exercise_key', v_ex ->> 'video_url');
      else
        update public.exercises
           set name              = v_ex ->> 'name',
               reps_or_duration  = v_text,
               order_index       = (v_ex ->> 'position')::int,
               detail            = v_ex ->> 'detail',
               image_key         = v_ex ->> 'image_key',
               prescription_mode = v_pres ->> 'mode',
               sets              = (v_pres ->> 'sets')::int,
               reps_min          = (v_pres ->> 'reps_min')::int,
               reps_max          = (v_pres ->> 'reps_max')::int,
               seconds           = (v_pres ->> 'seconds')::int,
               rest_seconds      = (v_pres ->> 'rest_seconds')::int,
               weight            = (v_pres ->> 'weight')::numeric,
               weight_unit       = v_pres ->> 'weight_unit',
               distance_m        = (v_pres ->> 'distance_m')::int,
               notes             = v_pres ->> 'notes',
               exercise_key      = v_ex ->> 'exercise_key',
               video_url         = v_ex ->> 'video_url',
               archived_at       = null
         where id = (v_ex ->> 'id')::uuid;
      end if;
    end loop;
  end loop;

  update public.workout_plans
     set title       = v_doc ->> 'title',
         description = v_doc ->> 'description',
         rev         = rev + 1
   where id = p_plan
  returning rev into v_new_rev;

  delete from public.workout_plan_drafts where plan_id = p_plan;

  return v_new_rev;
end;
$$;

comment on function public.publish_plan(uuid, int) is
  'Validates the stored draft and diff-applies it to workout_days/exercises, '
  'keeping row ids stable and archiving (never deleting) dropped rows. Bumps '
  'workout_plans.rev and clears the draft. 42501 not_your_member, P0002 '
  'plan_not_found/draft_not_found, 40001 stale_plan, 22023 invalid_draft/'
  'unknown_day_id/unknown_exercise_id.';

revoke all on function public.publish_plan(uuid, int) from public;

commit;
