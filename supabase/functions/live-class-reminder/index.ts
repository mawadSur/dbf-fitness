// live-class-reminder — sends the "Starting soon" push for live classes about to begin.
//
// Meant to be invoked EVERY MINUTE (Supabase scheduled invocation / pg_cron + pg_net). Scheduling
// is not configured in this repo. Each run:
//   1. finds live_classes with status = 'scheduled', reminder_sent_at is null and starts_at
//      between now and now + 15 minutes;
//   2. gathers Expo push tokens of the members whose profiles.coach_id is the class's coach AND
//      who currently have live-class access (active subscription, inside the 10-day grace period,
//      or staff). A member whose subscription lapsed is skipped: agora-rtc-token would refuse
//      them with 403 subscription_required, so the push would be an invitation to a locked door.
//      Entitlement mirrors public.subscription_state_row(); see _shared/subscriptionState.ts;
//   3. posts them to the Expo push API in batches of at most 100;
//   4. stamps live_classes.reminder_sent_at ONLY once every batch was accepted, so a failed send
//      is retried on the next tick. (A retry can re-notify devices whose batch already went out;
//      duplicates were judged better than a silently dropped reminder.) A class whose coach has
//      no member tokens yet is left unstamped so members who register later in the window still
//      get it. Overlapping invocations are not locked against each other.
//
// Uses the service-role client (bypasses RLS), which is the only reason it can read push_tokens
// across users. Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (both provided by the platform).
// Returns JSON { classes, sent, failed }.
//
// Callers must POST with `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`; anything else gets
// 405 or 401 and nothing is sent (see rejectInvocation in logic.ts). The scheduler is the only
// intended caller, and an unauthenticated invocation would otherwise fan out real pushes and
// stamp reminder_sent_at, suppressing the genuine reminder.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import {
  selectEntitledMemberIds,
  type MemberEntitlementInput,
} from '../_shared/subscriptionState.ts';
import {
  buildReminderMessages,
  chunk,
  EXPO_BATCH_SIZE,
  rejectInvocation,
  reminderWindow,
  selectClassesDueForReminder,
  tokensForMembers,
  type ExpoPushMessage,
  type LiveClassRow,
  type PushTokenRow,
} from './logic.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const TOKEN_PAGE_SIZE = 1000;

async function fetchDueClasses(supabase: SupabaseClient, now: Date): Promise<LiveClassRow[]> {
  const window = reminderWindow(now);
  const { data, error } = await supabase
    .from('live_classes')
    .select('id, coach_id, title, starts_at, status, reminder_sent_at')
    .eq('status', 'scheduled')
    .is('reminder_sent_at', null)
    .gte('starts_at', window.from)
    .lte('starts_at', window.to);
  if (error) throw error;
  // Defensive re-check with the same rule the query encodes.
  return selectClassesDueForReminder((data ?? []) as LiveClassRow[], now);
}

// Every member assigned to this coach, with the subscription row that decides their entitlement.
// Read with the service role (which bypasses RLS) — this is a server-side job, not a user session.
async function fetchCoachMembers(
  supabase: SupabaseClient,
  coachId: string
): Promise<MemberEntitlementInput[]> {
  const members: MemberEntitlementInput[] = [];
  for (let from = 0; ; from += TOKEN_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('coach_id', coachId)
      .order('id')
      .range(from, from + TOKEN_PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data ?? [];
    for (const row of rows) members.push({ member_id: row.id as string, role: row.role as string });
    if (rows.length < TOKEN_PAGE_SIZE) break;
  }
  if (members.length === 0) return members;

  const byId = new Map(members.map((member) => [member.member_id, member]));
  for (const ids of chunk([...byId.keys()], TOKEN_PAGE_SIZE)) {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('member_id, status, current_period_end')
      .in('member_id', ids);
    if (error) throw error;
    for (const row of data ?? []) {
      const member = byId.get(row.member_id as string);
      if (member) {
        member.subscription = {
          status: row.status as string,
          current_period_end: row.current_period_end as string,
        };
      }
    }
  }
  return members;
}

// Push tokens of the given members. Paged, because PostgREST caps a response.
async function fetchTokensFor(supabase: SupabaseClient, memberIds: string[]): Promise<PushTokenRow[]> {
  if (memberIds.length === 0) return [];
  const rows: PushTokenRow[] = [];
  for (const ids of chunk(memberIds, TOKEN_PAGE_SIZE)) {
    for (let from = 0; ; from += TOKEN_PAGE_SIZE) {
      const { data, error } = await supabase
        .from('push_tokens')
        .select('user_id, expo_push_token')
        .in('user_id', ids)
        .order('id')
        .range(from, from + TOKEN_PAGE_SIZE - 1);
      if (error) throw error;
      const page = data ?? [];
      for (const row of page) {
        rows.push({ user_id: row.user_id as string, expo_push_token: row.expo_push_token as string });
      }
      if (page.length < TOKEN_PAGE_SIZE) break;
    }
  }
  return rows;
}

// Throws unless Expo accepted the whole batch (HTTP 2xx with a parsable body). Per-token ticket
// errors (e.g. DeviceNotRegistered) are permanent for that token and do not block the reminder.
async function sendBatch(messages: ExpoPushMessage[]): Promise<void> {
  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
  });
  if (!response.ok) throw new Error(`Expo push API responded ${response.status}`);
  const body = await response.json();
  if (!Array.isArray(body?.data)) throw new Error('Expo push API returned an unexpected body');
}

Deno.serve(async (request: Request) => {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const rejection = rejectInvocation(request.method, request.headers.get('Authorization'), serviceRoleKey);
  if (rejection) {
    console.error(`[live-class-reminder] rejected ${request.method} with ${rejection.status}`);
    return Response.json({ error: rejection.error }, { status: rejection.status });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey!, {
    auth: { persistSession: false },
  });

  let classes: LiveClassRow[];
  try {
    classes = await fetchDueClasses(supabase, new Date());
  } catch (error) {
    console.error('[live-class-reminder] could not load due classes', error);
    return Response.json({ error: 'could not load due classes' }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;
  for (const liveClass of classes) {
    try {
      // Only members who could actually get in: no reminder for a lapsed subscription, since
      // agora-rtc-token would answer 403 subscription_required when they tapped it.
      const members = await fetchCoachMembers(supabase, liveClass.coach_id);
      const entitled = selectEntitledMemberIds(members, new Date());
      const tokenRows = await fetchTokensFor(supabase, entitled);
      const messages = buildReminderMessages(liveClass, tokensForMembers(tokenRows, entitled));
      if (messages.length === 0) continue;

      for (const batch of chunk(messages, EXPO_BATCH_SIZE)) {
        await sendBatch(batch);
        sent += batch.length;
      }

      const { error } = await supabase
        .from('live_classes')
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq('id', liveClass.id)
        .is('reminder_sent_at', null);
      if (error) throw error;
    } catch (error) {
      failed += 1;
      console.error(`[live-class-reminder] class ${liveClass.id} failed; will retry next run`, error);
    }
  }

  return Response.json({ classes: classes.length, sent, failed });
});
