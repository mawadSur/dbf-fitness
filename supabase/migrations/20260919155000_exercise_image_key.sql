-- Exercise pictograms: optional per-exercise pin to a bundled pictogram key.
-- Additive only. No policy or function changes: the existing exercises_write_coach policy
-- (20260919152000) still decides who may write, so only the plan's own coach/admin can set it.
alter table public.exercises
  add column if not exists image_key text;

alter table public.exercises
  drop constraint if exists exercises_image_key_format;
alter table public.exercises
  add constraint exercises_image_key_format
  check (image_key is null or (image_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(image_key) <= 40));

comment on column public.exercises.image_key is
  'Names a bundled pictogram (lowercase kebab-case key, max 40 chars). NULL means the client resolves the pictogram from the exercise name. Writable only by the plan''s coach via exercises_write_coach.';
