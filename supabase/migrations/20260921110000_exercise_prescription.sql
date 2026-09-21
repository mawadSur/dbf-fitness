-- D1b.1 — structured prescription on exercises.
--
-- Today an exercise carries one free-text field, `reps_or_duration` ("30s",
-- "10 reps/leg", "3x12"). The app cannot reason about it: it cannot pick the
-- right unit icon, cannot render a rest timer, cannot diff two plan revisions.
-- This migration adds the structured columns and keeps the text column as a
-- DERIVED, always-populated mirror so that:
--   * every existing client (which reads and writes only `reps_or_duration`)
--     keeps working, unchanged, forever;
--   * a new client can write structure and let the DB render the text;
--   * a legacy write is best-effort parsed back INTO structure, so the data
--     does not rot into two disagreeing halves.
--
-- Nothing here is destructive: `reps_or_duration` stays NOT NULL and the
-- original text is never lost (an unparseable string lands in `notes` with
-- mode 'notes', and the text column keeps it verbatim).

begin;

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------

alter table public.exercises
  add column if not exists prescription_mode text,
  add column if not exists sets              int,
  add column if not exists reps_min          int,
  add column if not exists reps_max          int,
  add column if not exists seconds           int,
  add column if not exists rest_seconds      int,
  add column if not exists weight            numeric(6, 2),
  add column if not exists weight_unit       text,
  add column if not exists distance_m        int,
  add column if not exists notes             text,
  add column if not exists exercise_key      text,
  add column if not exists video_url         text;

comment on column public.exercises.prescription_mode is
  'How this exercise is prescribed: reps | range | seconds | per_side | amrap | distance | notes. '
  'NULL only for rows written by a legacy client before the fill trigger could classify them.';
comment on column public.exercises.exercise_key is
  'Canonical kebab-case identity of the movement (matches the pictogram registry where it can). '
  'Derived from name when the writer does not supply one.';
comment on column public.exercises.reps_or_duration is
  'Human-readable prescription. DERIVED from the structured columns by '
  'exercises_fill_prescription(); kept NOT NULL so pre-D1b clients keep working.';

-- ---------------------------------------------------------------------------
-- 2. Bounds
--
-- Dropped-then-added rather than guarded with a catalog lookup: both statements
-- are cheap, and this way re-running the migration converges on exactly the
-- definition written here instead of silently keeping an older one.
-- ---------------------------------------------------------------------------

alter table public.exercises drop constraint if exists exercises_prescription_mode_check;
alter table public.exercises add constraint exercises_prescription_mode_check
  check (prescription_mode is null or prescription_mode in
         ('reps', 'range', 'seconds', 'per_side', 'amrap', 'distance', 'notes'));

alter table public.exercises drop constraint if exists exercises_prescription_bounds;
alter table public.exercises add constraint exercises_prescription_bounds
  check (
        (sets         is null or (sets         between 1 and 20))
    and (reps_min     is null or (reps_min     between 1 and 100))
    and (reps_max     is null or (reps_max     between 1 and 100))
    and (seconds      is null or (seconds      between 1 and 3600))
    and (rest_seconds is null or (rest_seconds between 0 and 600))
    and (weight       is null or (weight       >  0 and weight <= 1000))
    and (distance_m   is null or (distance_m   between 1 and 100000))
    and (reps_min is null or reps_max is null or reps_max >= reps_min)
  );

alter table public.exercises drop constraint if exists exercises_weight_unit_check;
alter table public.exercises add constraint exercises_weight_unit_check
  check (weight_unit is null or weight_unit in ('kg', 'lb'));

alter table public.exercises drop constraint if exists exercises_notes_bounds;
alter table public.exercises add constraint exercises_notes_bounds
  check (notes is null or char_length(notes) <= 2000);

-- Same shape as exercises_image_key_format, so a key can be used as an image
-- key and vice versa without a second normalisation step.
alter table public.exercises drop constraint if exists exercises_exercise_key_format;
alter table public.exercises add constraint exercises_exercise_key_format
  check (exercise_key is null
         or (exercise_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(exercise_key) <= 40));

-- https only: these URLs are rendered in a WebView/Video component, and an
-- http:// or javascript: URL there is an injection surface.
alter table public.exercises drop constraint if exists exercises_video_url_https;
alter table public.exercises add constraint exercises_video_url_https
  check (video_url is null
         or (video_url ~ '^https://[^[:space:]]+$' and char_length(video_url) <= 2048));

create index if not exists exercises_exercise_key_idx
  on public.exercises (exercise_key)
  where exercise_key is not null;


-- ---------------------------------------------------------------------------
-- 3. Canonical exercise key from a free-text name.
--
-- Mirrors normalizeExerciseName() + the alias table in
-- src/features/exercises/resolve.ts: lower-case, strip punctuation, singularise
-- each word, then map the five bundled pictogram movements onto their registry
-- key. Anything else becomes the kebab-cased normalised name, which is still a
-- stable identity (two coaches typing "Goblet Squats" and "goblet squat" agree)
-- even though no pictogram exists for it yet.
--
-- IMMUTABLE: depends only on its argument, so it can be used in an index or a
-- generated expression later.
-- ---------------------------------------------------------------------------

create or replace function public.exercise_key_from_name(p_name text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_norm text;
  v_key  text;
begin
  -- Normalise: lower, punctuation -> space, collapse.
  v_norm := nullif(trim(regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', ' ', 'g')), '');
  if v_norm is null then
    return null;
  end if;

  -- Singularise each word with the same rules as singularize() in resolve.ts.
  select string_agg(
           case
             when length(w) <= 2                then w
             when w ~ '[^aeiou]ies$'            then left(w, length(w) - 3) || 'y'
             when w ~ '(s|x|z|ch|sh)es$'        then left(w, length(w) - 2)
             when w ~ '[^s]s$'                  then left(w, length(w) - 1)
             else w
           end, ' ' order by ord)
    into v_norm
  from unnest(string_to_array(v_norm, ' ')) with ordinality as u(w, ord)
  where w <> '';

  if v_norm is null then
    return null;
  end if;

  -- Alias table. Longest/most specific phrase first: "split squat" and
  -- "squat thrust" must NOT land on the plain squat pictogram, matching the
  -- ordering guarantees in resolve.ts.
  v_key := case
    when v_norm ~ '(^| )(split squat|squat thrust)( |$)'        then null
    when v_norm ~ '(^| )(mountain climber|mountain climbing)( |$)' then 'mountain-climber'
    when v_norm ~ '(^| )(walking lunge|lunge|lunging)( |$)'     then 'walking-lunge'
    when v_norm ~ '(^| )(push up|pushup|press up)( |$)'         then 'push-up'
    when v_norm ~ '(^| )(high knee|high kneee)( |$)'            then 'high-knees'
    when v_norm ~ '(^| )(bodyweight squat|air squat|squat)( |$)' then 'bodyweight-squat'
    else null
  end;

  if v_key is not null then
    return v_key;
  end if;

  -- Fallback: the normalised name itself, kebab-cased and clipped to the same
  -- 40 characters the format CHECK allows. Trailing '-' after the clip would
  -- break the kebab pattern, so trim it.
  v_key := left(replace(v_norm, ' ', '-'), 40);
  v_key := regexp_replace(v_key, '-+$', '');
  return nullif(v_key, '');
end;
$$;

comment on function public.exercise_key_from_name(text) is
  'Canonical kebab-case movement key for a free-text exercise name; mirrors '
  'normalizeExerciseName()/NAME_ALIASES in src/features/exercises/resolve.ts.';

revoke all on function public.exercise_key_from_name(text) from public;

-- ---------------------------------------------------------------------------
-- 4. Best-effort parse of a legacy prescription string into structure.
--
-- This is deliberately conservative. It is used on rows written by clients
-- that know nothing about the structured columns, so a WRONG guess is worse
-- than no guess: anything it is not confident about, or anything that would
-- violate the bounds CHECK, degrades to mode 'notes' with the original text
-- preserved verbatim. That degradation is also what keeps legacy INSERTs from
-- suddenly failing on a constraint the client cannot see.
--
-- Returns the structured fields as jsonb so it stays a single pure function
-- that pgTAP can assert on directly.
-- ---------------------------------------------------------------------------

create or replace function public.parse_prescription_text(p_text text)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_raw      text := coalesce(p_text, '');
  v_t        text := lower(trim(coalesce(p_text, '')));
  v_body     text;
  v_sets     int;
  v_reps_min int;
  v_reps_max int;
  v_seconds  int;
  v_dist     int;
  v_per_side boolean := false;
  v_amrap    boolean := false;
  v_mode     text;
  v_hit      text;
begin
  if v_t = '' then
    return jsonb_build_object('mode', 'notes', 'notes', v_raw);
  end if;

  v_per_side := v_t ~ '(per|each)\s+(leg|side|arm)' or v_t ~ '/\s*(leg|side|arm)';
  v_amrap    := v_t ~ 'amrap';

  -- Leading "3 x " / "3x" is a set count; strip it so the remaining number is
  -- unambiguously the rep/second count.
  v_hit := substring(v_t from '^([0-9]{1,2})\s*[x×]\s*');
  if v_hit is not null then
    v_sets := v_hit::int;
    v_body := regexp_replace(v_t, '^[0-9]{1,2}\s*[x×]\s*', '');
  else
    v_body := v_t;
  end if;

  -- Minutes BEFORE metres, otherwise the "m" of "min" reads as a distance.
  v_hit := substring(v_body from '([0-9]{1,4})\s*(?:min|minute)');
  if v_hit is not null then
    v_seconds := v_hit::int * 60;
  else
    v_hit := substring(v_body from '([0-9]{1,4})\s*(?:s|sec|second)s?\M');
    if v_hit is not null then
      v_seconds := v_hit::int;
    else
      v_hit := substring(v_body from '([0-9]{1,6})\s*km\M');
      if v_hit is not null then
        v_dist := v_hit::int * 1000;
      else
        v_hit := substring(v_body from '([0-9]{1,6})\s*(?:m|meter|metre)s?\M');
        if v_hit is not null then
          v_dist := v_hit::int;
        end if;
      end if;
    end if;
  end if;

  -- Rep range ("8-12"), then a single rep count.
  if substring(v_body from '([0-9]{1,3})\s*[-–—]\s*[0-9]{1,3}') is not null then
    v_reps_min := substring(v_body from '([0-9]{1,3})\s*[-–—]\s*[0-9]{1,3}')::int;
    v_reps_max := substring(v_body from '[0-9]{1,3}\s*[-–—]\s*([0-9]{1,3})')::int;
  elsif v_seconds is null and v_dist is null then
    v_hit := substring(v_body from '([0-9]{1,3})');
    if v_hit is not null then
      v_reps_min := v_hit::int;
    end if;
  end if;

  -- Classify.
  v_mode := case
    when v_amrap                                     then 'amrap'
    when v_reps_max is not null                      then 'range'
    when v_reps_min is not null                      then 'reps'
    when v_seconds  is not null                      then 'seconds'
    when v_dist     is not null                      then 'distance'
    else 'notes'
  end;

  if v_mode = 'notes' then
    return jsonb_build_object('mode', 'notes', 'notes', v_raw);
  end if;

  -- "10 reps/leg" and "30s each side" are the same prescription shape with a
  -- per-limb multiplier; that is its own mode, not a flag, because the UI
  -- renders it differently.
  if v_per_side and v_mode in ('reps', 'range', 'seconds') then
    v_mode := 'per_side';
  end if;

  -- Bounds gate. A parse that cannot be stored is not a parse.
  if (v_sets     is not null and v_sets     not between 1 and 20)
  or (v_reps_min is not null and v_reps_min not between 1 and 100)
  or (v_reps_max is not null and v_reps_max not between 1 and 100)
  or (v_seconds  is not null and v_seconds  not between 1 and 3600)
  or (v_dist     is not null and v_dist     not between 1 and 100000)
  or (v_reps_min is not null and v_reps_max is not null and v_reps_max < v_reps_min)
  then
    return jsonb_build_object('mode', 'notes', 'notes', v_raw);
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'mode',       v_mode,
    'sets',       v_sets,
    'reps_min',   v_reps_min,
    'reps_max',   v_reps_max,
    'seconds',    v_seconds,
    'distance_m', v_dist
  ));
end;
$$;

comment on function public.parse_prescription_text(text) is
  'Best-effort structure for a legacy reps_or_duration string. Degrades to '
  'mode "notes" carrying the original text rather than guessing or raising.';

revoke all on function public.parse_prescription_text(text) from public;

-- ---------------------------------------------------------------------------
-- 5. Render structure back to the legacy text column.
--
-- One renderer, in the database, so `reps_or_duration` never disagrees with
-- the structured columns no matter which client wrote the row. The TypeScript
-- formatter in src/features/workouts/prescription.ts renders the same strings
-- for the new UI; this one exists for the old UI, which reads only the text.
-- ---------------------------------------------------------------------------

create or replace function public.format_prescription_text(
  p_mode        text,
  p_sets        int     default null,
  p_reps_min    int     default null,
  p_reps_max    int     default null,
  p_seconds     int     default null,
  p_weight      numeric default null,
  p_weight_unit text    default null,
  p_distance_m  int     default null,
  p_notes       text    default null
)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_core   text;
  v_dur    text;
  v_weight text;
begin
  if p_mode is null then
    return null;
  end if;

  -- Durations read as minutes when they divide evenly; "2 min" beats "120s".
  if p_seconds is not null then
    v_dur := case
      when p_seconds >= 60 and p_seconds % 60 = 0 then (p_seconds / 60)::text || ' min'
      else p_seconds::text || 's'
    end;
  end if;

  v_core := case p_mode
    when 'reps'     then case when p_reps_min is null then null
                              else p_reps_min::text || ' reps' end
    when 'range'    then case when p_reps_min is null or p_reps_max is null then null
                              else p_reps_min::text || '-' || p_reps_max::text || ' reps' end
    when 'seconds'  then v_dur
    when 'per_side' then case
                           when p_reps_min is not null and p_reps_max is not null
                             then p_reps_min::text || '-' || p_reps_max::text || ' reps/side'
                           when p_reps_min is not null then p_reps_min::text || ' reps/side'
                           when v_dur is not null      then v_dur || '/side'
                           else null
                         end
    when 'amrap'    then case when v_dur is null then 'AMRAP' else 'AMRAP ' || v_dur end
    when 'distance' then case
                           when p_distance_m is null then null
                           when p_distance_m >= 1000 and p_distance_m % 1000 = 0
                             then (p_distance_m / 1000)::text || 'km'
                           else p_distance_m::text || 'm'
                         end
    when 'notes'    then nullif(btrim(coalesce(p_notes, '')), '')
    else null
  end;

  if v_core is null then
    return null;
  end if;

  -- Set count prefixes everything that is a per-set prescription. AMRAP is a
  -- single open-ended block and 'notes' is verbatim coach text: neither takes
  -- a machine-made prefix.
  if p_sets is not null and p_mode not in ('amrap', 'notes') then
    v_core := p_sets::text || 'x' || v_core;
  end if;

  if p_weight is not null and p_mode <> 'notes' then
    -- trim_scale drops the stored 2dp when the coach meant a whole number.
    -- FM suppresses the padding but NOT the decimal point, so to_char(20)
    -- comes back as '20.' and would render "@ 20.kg"; the rtrim removes that
    -- orphan point. It cannot eat a real digit, so '0.5' survives intact.
    v_weight := rtrim(trim(to_char(trim_scale(p_weight), 'FM9990.99')), '.');
    v_core := v_core || ' @ ' || v_weight || coalesce(p_weight_unit, 'kg');
  end if;

  return v_core;
end;
$$;

comment on function public.format_prescription_text(text, int, int, int, int, numeric, text, int, text) is
  'Renders the structured prescription columns into the legacy reps_or_duration '
  'text. Mirrors formatPrescription() in src/features/workouts/prescription.ts.';

revoke all on function public.format_prescription_text(text, int, int, int, int, numeric, text, int, text) from public;

-- ---------------------------------------------------------------------------
-- 6. The fill trigger — the thing that keeps the two representations in sync.
--
-- Two directions, chosen by WHAT THE WRITER TOUCHED:
--
--   structured write (any of the new columns changed)
--       -> the text column is RE-DERIVED from the structure. A new client
--          never has to render prescription text, and can never desync it.
--
--   legacy write (only reps_or_duration changed, or an INSERT with no mode)
--       -> the text is kept EXACTLY as written and the structure is parsed
--          out of it. This is the backward-compatibility guarantee: a pre-D1b
--          client reads back byte-for-byte what it wrote.
--
-- Guard GUC `app.prescription_backfill`: while set, the text is never
-- re-derived. Used by the backfill below (and by tests) to fill structure into
-- legacy rows without rewriting their text. It grants no access and can only
-- make a row's text disagree with its structure — something a coach can
-- already do by typing freely — so it is not a privilege boundary.
-- ---------------------------------------------------------------------------

create or replace function public.exercises_fill_prescription()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_structured_changed boolean;
  v_parsed jsonb;
  v_text   text;
begin
  if new.exercise_key is null then
    new.exercise_key := public.exercise_key_from_name(new.name);
  end if;

  if tg_op = 'INSERT' then
    v_structured_changed := new.prescription_mode is not null;
  else
    v_structured_changed :=
         new.prescription_mode is distinct from old.prescription_mode
      or new.sets         is distinct from old.sets
      or new.reps_min     is distinct from old.reps_min
      or new.reps_max     is distinct from old.reps_max
      or new.seconds      is distinct from old.seconds
      or new.rest_seconds is distinct from old.rest_seconds
      or new.weight       is distinct from old.weight
      or new.weight_unit  is distinct from old.weight_unit
      or new.distance_m   is distinct from old.distance_m
      or new.notes        is distinct from old.notes;
  end if;

  if v_structured_changed then
    if coalesce(current_setting('app.prescription_backfill', true), '') = '1' then
      return new;
    end if;

    v_text := public.format_prescription_text(
      new.prescription_mode, new.sets, new.reps_min, new.reps_max,
      new.seconds, new.weight, new.weight_unit, new.distance_m, new.notes);

    -- A renderable structure wins. An unrenderable one (mode 'reps' with no
    -- rep count) leaves whatever the writer supplied, so the NOT NULL on
    -- reps_or_duration still reports the real mistake.
    if v_text is not null then
      new.reps_or_duration := v_text;
    end if;

    return new;
  end if;

  -- Legacy direction: only re-parse when the text actually changed (or this is
  -- a fresh legacy row). An UPDATE that touches neither side leaves the row
  -- alone, so an unrelated write (archiving, reordering) cannot reclassify a
  -- prescription the coach set by hand.
  if tg_op = 'INSERT' or new.reps_or_duration is distinct from old.reps_or_duration then
    v_parsed := public.parse_prescription_text(new.reps_or_duration);

    new.prescription_mode := v_parsed->>'mode';
    new.sets              := (v_parsed->>'sets')::int;
    new.reps_min          := (v_parsed->>'reps_min')::int;
    new.reps_max          := (v_parsed->>'reps_max')::int;
    new.seconds           := (v_parsed->>'seconds')::int;
    new.distance_m        := (v_parsed->>'distance_m')::int;
    new.notes             := v_parsed->>'notes';
  end if;

  return new;
end;
$$;

drop trigger if exists exercises_fill_prescription on public.exercises;
create trigger exercises_fill_prescription
  before insert or update on public.exercises
  for each row execute function public.exercises_fill_prescription();

-- ---------------------------------------------------------------------------
-- 7. Backfill every pre-existing row.
-- ---------------------------------------------------------------------------

do $backfill$
begin
  perform set_config('app.prescription_backfill', '1', true);

  update public.exercises e
     set prescription_mode = p.parsed->>'mode',
         sets              = (p.parsed->>'sets')::int,
         reps_min          = (p.parsed->>'reps_min')::int,
         reps_max          = (p.parsed->>'reps_max')::int,
         seconds           = (p.parsed->>'seconds')::int,
         distance_m        = (p.parsed->>'distance_m')::int,
         notes             = p.parsed->>'notes',
         exercise_key      = coalesce(e.exercise_key, e.image_key,
                                      public.exercise_key_from_name(e.name))
    from (select id, public.parse_prescription_text(reps_or_duration) as parsed
            from public.exercises
           where prescription_mode is null) p
   where p.id = e.id;

  perform set_config('app.prescription_backfill', '', true);
end;
$backfill$;

commit;
