-- ============================================================================
-- 20260919152100_profile_provisioning.sql
--
-- Server-side profile provisioning for GoTrue sign-ups.
--
-- WHY (security auditor, "auth" lens, medium):
--   Until now the ONLY thing that created a public.profiles row was a second,
--   separate request issued by the client right after supabase.auth.signUp()
--   (app/(auth)/sign-up.tsx). There was no trigger on auth.users. Two
--   consequences:
--
--     1. It is the structural root of T4 ("register as admin"). 20260919152000
--        closed the exploit by constraining the INSERT policy to
--        `role = 'member' and coach_id is null`, but the row is still authored
--        by the client. Provisioning it server-side means the client no longer
--        has any say in `role` / `coach_id` at creation time either — the
--        policy becomes a second line of defence rather than the only one.
--
--     2. It is an availability bug waiting to happen. With
--        [auth.email] enable_confirmations = true (the normal production
--        hardening), signUp() returns a user but NO session, so the follow-up
--        insert runs as `anon`, profiles_insert_self_member_only refuses it,
--        and the account is left with an auth.users row and no profile —
--        fetchCurrentMember() returns null and every role-aware screen
--        degrades. The same orphan state results from a dropped connection or
--        an app kill between the two requests.
--
-- WHY IT IS SAFE FOR seed.sql:
--   The trigger returns early when public.is_privileged_writer() is true
--   (postgres / supabase_admin / service_role). supabase/seed.sql runs as
--   `postgres` and inserts its auth.users rows and its own profiles rows with
--   deliberate roles ('coach', 'member') — the trigger never fires for it, so
--   the four demo profiles keep exactly the roles the seed states and a
--   from-scratch `supabase db reset` is unaffected. Only real GoTrue sign-ups
--   (written by supabase_auth_admin) are provisioned here.
--
-- DEVIATION NOTE: the T-S1 design spec chose the INSERT-policy route and left
-- provisioning client-side. This migration is additive on top of it — the
-- policy from 20260919152000 stays exactly as it is — and is justified by the
-- auditor finding above. `app/(auth)/sign-up.tsx` is switched from insert to
-- upsert so the client request remains correct whether or not the trigger
-- already ran.
-- ============================================================================

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  -- Seed, migrations and service-role tooling author their own profiles rows
  -- (with roles this trigger is deliberately not allowed to choose).
  if public.is_privileged_writer() then
    return new;
  end if;

  -- profiles.full_name is NOT NULL with a length CHECK, so a sign-up that sent
  -- no metadata must still produce a valid row rather than failing the whole
  -- registration.
  v_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  if v_name is null then
    v_name := nullif(btrim(split_part(coalesce(new.email, ''), '@', 1)), '');
  end if;
  if v_name is null then
    v_name := 'New member';
  end if;
  v_name := left(v_name, 120);

  -- role and coach_id are NOT taken from the client under any circumstances.
  insert into public.profiles (id, role, coach_id, full_name)
  values (new.id, 'member', null, v_name)
  on conflict (id) do nothing;

  return new;
exception
  when others then
    -- Never let profile provisioning break account creation: the client's
    -- upsert in app/(auth)/sign-up.tsx is still there as a fallback, and an
    -- auth account with no profile is recoverable while a failed signUp is
    -- confusing. Surfaced in the Postgres log for operators.
    raise warning 'handle_new_auth_user() could not provision a profile for %: %', new.id, sqlerrm;
    return new;
end;
$$;

comment on function public.handle_new_auth_user() is
  'AFTER INSERT ON auth.users: provisions public.profiles with role=''member'', coach_id=null and a name derived from raw_user_meta_data.full_name (falling back to the email local part). Skipped for privileged writers so supabase/seed.sql keeps authoring its own demo roles.';

revoke all on function public.handle_new_auth_user() from public;

drop trigger if exists handle_new_auth_user on auth.users;
create trigger handle_new_auth_user
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
