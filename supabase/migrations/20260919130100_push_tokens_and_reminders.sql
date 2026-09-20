-- Live-class "starting soon" reminders: per-user Expo push tokens, plus an
-- idempotency marker on live_classes so the scheduled Edge Function
-- (supabase/functions/live-class-reminder) never notifies for the same class twice.

-- push_tokens: one row per (user, device token). Members register their own
-- token on the live schedule screen; the Edge Function reads them with the
-- service role (which bypasses RLS), so no cross-user read policy is needed.
create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  expo_push_token text not null,
  platform text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, expo_push_token)
);

comment on table public.push_tokens is 'Expo push tokens per user; read across users only by the service-role reminder Edge Function.';

alter table public.push_tokens enable row level security;

create policy "push_tokens_select_self"
  on public.push_tokens for select
  using (user_id = auth.uid());

create policy "push_tokens_insert_self"
  on public.push_tokens for insert
  with check (user_id = auth.uid());

create policy "push_tokens_update_self"
  on public.push_tokens for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "push_tokens_delete_self"
  on public.push_tokens for delete
  using (user_id = auth.uid());

-- Keep updated_at fresh when an existing token is re-registered via upsert.
-- Plain trigger function (not SECURITY DEFINER), so no EXECUTE-grant
-- special-casing is needed.
create function public.push_tokens_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger push_tokens_touch_updated_at
  before update on public.push_tokens
  for each row execute function public.push_tokens_touch_updated_at();

-- Set by the Edge Function only after a successful push send.
alter table public.live_classes add column reminder_sent_at timestamptz;

comment on column public.live_classes.reminder_sent_at is 'Stamped once the "starting soon" push has been sent; null means not yet reminded.';
