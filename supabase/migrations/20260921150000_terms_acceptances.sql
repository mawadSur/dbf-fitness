-- ============================================================================
-- 20260921150000_terms_acceptances.sql
--
-- RECORDED ACCEPTANCE OF THE TERMS OF SERVICE AND PRIVACY POLICY.
--
-- Why this exists: Apple App Store Review Guideline 1.2 (User-Generated
-- Content) requires an app with UGC — DBF Fitness has group rosters, coach
-- bios, live classes and coach-uploaded recordings — to make the user agree to
-- terms that forbid objectionable content and abusive users. "The user tapped a
-- checkbox once in 2026" is only defensible if it was WRITTEN DOWN, and a
-- material change to the documents has to be re-accepted. This table is that
-- record; src/features/legal/TermsGate is the client half.
--
-- ADDITIVE. No earlier migration is edited, no existing policy is weakened, and
-- no existing row is touched. One new table and two new functions.
--
-- Privilege model (see common.md, "NEVER REVOKE EXECUTE"):
--   * `revoke all on function ... from public` ONLY. anon/authenticated keep the
--     EXECUTE that Supabase's default privileges grant them — revoking it
--     segfaults this Postgres 17.6 when the role calls the function directly.
--   * Both functions are SECURITY DEFINER with `set search_path = public`.
--   * Both gate INSIDE the body on `auth.uid() is null`, so an anon caller gets
--     a clean false / no-op instead of an error or a write.
--
-- Write model: there is NO insert/update/delete policy for clients. The ONLY
-- way a row is created is public.accept_terms(), which runs as definer and
-- always writes `auth.uid()` — a member cannot forge an acceptance for someone
-- else, and cannot back-date or delete their own.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists public.terms_acceptances (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  doc         text not null check (doc in ('terms', 'privacy')),
  version     text not null,
  accepted_at timestamptz not null default now(),
  unique (user_id, doc, version)
);

comment on table public.terms_acceptances is
  'One row per (user, document, version) the user has accepted. Written only by public.accept_terms(); clients have no write policy. Supports Apple guideline 1.2 and the privacy-policy consent record.';
comment on column public.terms_acceptances.doc is
  'Which document: terms | privacy. accept_terms() records BOTH in one call because the UI presents them as one checkbox.';
comment on column public.terms_acceptances.version is
  'Mirrors TERMS_VERSION in src/config/legal.ts (ISO effective date). Bumping it re-prompts every user.';

-- The hot query is "has THIS user accepted THIS version?" — the unique
-- constraint already indexes (user_id, doc, version) with user_id leading, so
-- has_accepted_terms() is an index lookup and no extra index is needed.

-- ---------------------------------------------------------------------------
-- RLS: owner reads own, admin reads all, nobody writes
-- ---------------------------------------------------------------------------
alter table public.terms_acceptances enable row level security;

-- `if not exists` on every policy so re-running this file is safe.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'terms_acceptances'
      and policyname = 'terms_acceptances_select_own'
  ) then
    create policy terms_acceptances_select_own
      on public.terms_acceptances
      for select
      to authenticated
      using (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'terms_acceptances'
      and policyname = 'terms_acceptances_select_admin'
  ) then
    -- Admins need the compliance record (who accepted what, when) to answer a
    -- store or legal query. is_admin() is the existing SECURITY DEFINER helper
    -- from 20260919152300, so this does not re-enter profiles' own RLS.
    create policy terms_acceptances_select_admin
      on public.terms_acceptances
      for select
      to authenticated
      using (public.is_admin());
  end if;
end
$$;

-- No INSERT / UPDATE / DELETE policy is created, on purpose: with RLS enabled
-- and no permissive policy for a command, that command is denied for every
-- non-superuser role. accept_terms() bypasses this as SECURITY DEFINER.

-- ---------------------------------------------------------------------------
-- public.accept_terms(p_version text) -> void
-- ---------------------------------------------------------------------------
create or replace function public.accept_terms(p_version text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  -- Gate in the BODY, never by revoking EXECUTE (common.md). An anon or
  -- unauthenticated caller is a silent no-op: nothing is written, nothing
  -- raises, so a signed-out client cannot probe for existence either.
  if v_uid is null then
    return;
  end if;

  if p_version is null or btrim(p_version) = '' then
    raise exception 'accept_terms: version is required' using errcode = '22023';
  end if;

  -- The profile row must exist; the FK would say so anyway, but this gives a
  -- clear error rather than a constraint name during sign-up races.
  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'accept_terms: no profile for the current user' using errcode = '42501';
  end if;

  -- IDEMPOTENT: calling twice for the same version keeps the FIRST accepted_at.
  -- The client calls this from sign-up AND from TermsGate, and a retry after a
  -- network error must not look like a fresh acceptance.
  insert into public.terms_acceptances (user_id, doc, version)
  select v_uid, d.doc, btrim(p_version)
  from (values ('terms'), ('privacy')) as d(doc)
  on conflict (user_id, doc, version) do nothing;
end;
$$;

comment on function public.accept_terms(text) is
  'Records the current user''s acceptance of BOTH the terms and the privacy policy at p_version. Idempotent; no-op when auth.uid() is null. The only writer of terms_acceptances.';

revoke all on function public.accept_terms(text) from public;

-- ---------------------------------------------------------------------------
-- public.has_accepted_terms(p_version text) -> boolean
-- ---------------------------------------------------------------------------
create or replace function public.has_accepted_terms(p_version text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- False (never null, never an error) for an anon caller or a blank version:
  -- TermsGate treats false as "show the accept screen", which is the safe
  -- default, and a signed-out user never reaches the gate anyway.
  select case
    when auth.uid() is null then false
    when p_version is null or btrim(p_version) = '' then false
    else exists (
      select 1
      from public.terms_acceptances ta
      where ta.user_id = auth.uid()
        and ta.doc = 'terms'
        and ta.version = btrim(p_version)
    ) and exists (
      select 1
      from public.terms_acceptances ta
      where ta.user_id = auth.uid()
        and ta.doc = 'privacy'
        and ta.version = btrim(p_version)
    )
  end;
$$;

comment on function public.has_accepted_terms(text) is
  'True only when the current user has accepted BOTH documents at p_version. False for anon. Read by src/features/legal/TermsGate.';

revoke all on function public.has_accepted_terms(text) from public;
