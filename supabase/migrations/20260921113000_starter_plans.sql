-- D1b.4 — starter plans.
--
-- The gap this closes: a member who picked a coach saw an EMPTY app until
-- that coach got around to writing them a plan. First impression of the
-- product: nothing to do. From here, choosing a coach immediately materialises
-- a starter plan from a template, flagged `needs_tailoring` so the coach's
-- roster (D1c) shows exactly who is still on the generic plan.
--
-- The template is stored in the same jsonb shape as a plan draft, so it is
-- validated by the same plan_draft_normalize() the publisher uses: one schema,
-- one validator, no second definition to drift.

begin;

-- ---------------------------------------------------------------------------
-- 1. Template library
-- ---------------------------------------------------------------------------

create table if not exists public.plan_templates (
  id          uuid primary key default gen_random_uuid(),
  title       text        not null,
  description text,
  template    jsonb       not null,
  is_starter  boolean     not null default false,
  created_by  uuid        references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint plan_templates_title_bounds
    check (char_length(title) between 1 and 200)
);

comment on table public.plan_templates is
  'Reusable plan skeletons in the plan-draft jsonb shape. Readable by any '
  'coach or admin; writable by admins only. is_starter marks the template '
  'handed to a member the moment they choose a coach.';

alter table public.plan_templates enable row level security;

drop policy if exists plan_templates_read_staff on public.plan_templates;
create policy plan_templates_read_staff on public.plan_templates
  for select using ((select public.is_coach_or_admin()));

drop policy if exists plan_templates_write_admin on public.plan_templates;
create policy plan_templates_write_admin on public.plan_templates
  for all using ((select public.is_admin())) with check ((select public.is_admin()));

-- Validate on write, so a broken template can never reach a member's plan.
create or replace function public.plan_templates_validate()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform public.plan_draft_normalize(new.template);
  return new;
end;
$$;

drop trigger if exists plan_templates_validate on public.plan_templates;
create trigger plan_templates_validate
  before insert or update of template on public.plan_templates
  for each row execute function public.plan_templates_validate();

-- At most one starter at a time: "the" starter plan has to be unambiguous.
create unique index if not exists plan_templates_one_starter_idx
  on public.plan_templates ((true)) where is_starter;

-- ---------------------------------------------------------------------------
-- 2. Plan provenance
-- ---------------------------------------------------------------------------

alter table public.workout_plans
  add column if not exists source          text    not null default 'coach',
  add column if not exists needs_tailoring boolean not null default false;

alter table public.workout_plans drop constraint if exists workout_plans_source_check;
alter table public.workout_plans add constraint workout_plans_source_check
  check (source in ('coach', 'starter', 'import'));

comment on column public.workout_plans.source is
  'Where the plan came from: coach (hand-written), starter (materialised from '
  'a plan_templates row), import.';
comment on column public.workout_plans.needs_tailoring is
  'True while the plan is still the generic starter. Cleared automatically the '
  'first time the coach publishes an edit.';

create index if not exists workout_plans_needs_tailoring_idx
  on public.workout_plans (coach_id) where needs_tailoring;

-- Publishing IS tailoring. Driving the flag off rev rather than off
-- publish_plan() means it also clears for any future edit path, and keeps
-- publish_plan() (which is in another migration) untouched.
create or replace function public.workout_plans_clear_tailoring()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.rev > old.rev then
    new.needs_tailoring := false;
  end if;
  return new;
end;
$$;

drop trigger if exists workout_plans_clear_tailoring on public.workout_plans;
create trigger workout_plans_clear_tailoring
  before update of rev on public.workout_plans
  for each row execute function public.workout_plans_clear_tailoring();

-- ---------------------------------------------------------------------------
-- 3. Materialising the starter plan.
--
-- Authorization note. This runs from inside choose_coach(), which is itself
-- SECURITY DEFINER called by an ordinary authenticated member — so
-- is_privileged_writer() is FALSE in here and cannot be the gate. It reuses
-- choose_coach's existing sanctioned window instead: the
-- `app.coach_choice_member` GUC, which is set for exactly one statement span
-- around the assignment and is already what is_coach_assignment_context()
-- trusts. A direct call from a client, where the GUC is unset, is refused.
--
-- Idempotency comes from workout_plans' UNIQUE(member_id) (D1a): the insert is
-- ON CONFLICT DO NOTHING, so re-choosing the same coach, a double submit, or a
-- member who already has a real plan all end up doing nothing at all.
-- ---------------------------------------------------------------------------

create or replace function public.apply_starter_template(p_member uuid, p_coach uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tpl     public.plan_templates%rowtype;
  v_doc     jsonb;
  v_plan    uuid;
  v_day     jsonb;
  v_ex      jsonb;
  v_pres    jsonb;
  v_day_id  uuid;
begin
  if not (public.is_privileged_writer()
          or coalesce(current_setting('app.coach_choice_member', true), '') = p_member::text) then
    raise exception 'not_allowed' using errcode = '42501',
      hint = 'Starter plans are created by choose_coach(), not directly.';
  end if;

  if p_member is null or p_coach is null then
    return null;
  end if;

  select * into v_tpl from public.plan_templates where is_starter limit 1;
  if v_tpl.id is null then
    return null;
  end if;

  -- Normalising here rather than trusting the stored document means a
  -- template written before a validation rule tightened still cannot produce
  -- an invalid plan; it fails loudly instead.
  v_doc := public.plan_draft_normalize(v_tpl.template);

  insert into public.workout_plans (member_id, coach_id, title, description, source, needs_tailoring)
  values (p_member, p_coach, v_doc ->> 'title', v_doc ->> 'description', 'starter', true)
  on conflict (member_id) do nothing
  returning id into v_plan;

  if v_plan is null then
    return null;  -- the member already had a plan; leave it alone
  end if;

  for v_day in select value from jsonb_array_elements(v_doc -> 'days') loop
    insert into public.workout_days (workout_plan_id, day_number, block_name, duration_minutes)
    values (v_plan, (v_day ->> 'day_number')::int, v_day ->> 'block_name',
            (v_day ->> 'duration_minutes')::int)
    returning id into v_day_id;

    for v_ex in select value from jsonb_array_elements(v_day -> 'exercises') loop
      v_pres := v_ex -> 'prescription';
      insert into public.exercises (
        workout_day_id, name, reps_or_duration, order_index, detail, image_key,
        prescription_mode, sets, reps_min, reps_max, seconds, rest_seconds,
        weight, weight_unit, distance_m, notes, exercise_key, video_url)
      values (
        v_day_id, v_ex ->> 'name',
        public.format_prescription_text(
          v_pres ->> 'mode', (v_pres ->> 'sets')::int, (v_pres ->> 'reps_min')::int,
          (v_pres ->> 'reps_max')::int, (v_pres ->> 'seconds')::int,
          (v_pres ->> 'weight')::numeric, v_pres ->> 'weight_unit',
          (v_pres ->> 'distance_m')::int, v_pres ->> 'notes'),
        (v_ex ->> 'position')::int, v_ex ->> 'detail', v_ex ->> 'image_key',
        v_pres ->> 'mode', (v_pres ->> 'sets')::int, (v_pres ->> 'reps_min')::int,
        (v_pres ->> 'reps_max')::int, (v_pres ->> 'seconds')::int,
        (v_pres ->> 'rest_seconds')::int, (v_pres ->> 'weight')::numeric,
        v_pres ->> 'weight_unit', (v_pres ->> 'distance_m')::int,
        v_pres ->> 'notes', v_ex ->> 'exercise_key', v_ex ->> 'video_url');
    end loop;
  end loop;

  return v_plan;
end;
$$;

comment on function public.apply_starter_template(uuid, uuid) is
  'Materialises the is_starter plan_templates row into a workout_plan for a '
  'member who has none (source ''starter'', needs_tailoring true). Returns the '
  'new plan id, or null when there is no starter template or the member '
  'already has a plan. Callable only from choose_coach()''s sanctioned window '
  'or by a privileged writer.';

revoke all on function public.apply_starter_template(uuid, uuid) from public;

-- ---------------------------------------------------------------------------
-- 4. choose_coach() hands out the starter plan.
--
-- Unchanged from 20260919153000 except for the two marked lines: same guards,
-- same role-integrity checks, same early return when the member re-picks the
-- coach they already have (which is what makes a double submit a no-op).
-- ---------------------------------------------------------------------------

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
  -- D1b.4: still inside the window, so apply_starter_template() can prove the
  -- call came from here. A member who already has a plan keeps it.
  perform public.apply_starter_template(v_caller, p_coach_id);
  perform set_config('app.coach_choice_member', '', true);
end;
$$;

revoke all on function public.choose_coach(uuid) from public;

commit;
