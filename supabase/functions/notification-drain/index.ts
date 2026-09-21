// notification-drain — delivers public.notification_outbox rows to the Expo push service.
//
// This file is the ONLY Deno-aware part of the drain: it wires real implementations (the
// service-role Supabase client, fetch, the clock) into runDrain()/collectReceipts() from
// ../_shared/outbox.ts, which hold all the logic and are covered by Jest. Nothing decided here.
//
// Meant to be invoked EVERY MINUTE (pg_cron + pg_net; see
// supabase/migrations/20260921142000_notification_scheduling.sql). Each run:
//   1. claim_notifications() leases a batch of due rows (FOR UPDATE SKIP LOCKED), so two
//      overlapping invocations take disjoint work and a crashed run is recovered when its lease
//      expires;
//   2. the rows are expanded to one Expo message per registered device and POSTed in batches;
//   3. each row is completed / retried / dead-lettered from its ticket;
//   4. a second pass asks Expo for the RECEIPTS of previously sent rows and prunes the tokens
//      Expo reports as DeviceNotRegistered (tickets rarely carry that; receipts do).
//
// Auth: POST with `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`, compared in constant time
// (see rejectInvocation). A missing key fails CLOSED with 500. Tokens, keys and message bodies are
// never logged — only counts.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (both provided by the platform).
// Returns JSON { claimed, sent, retried, dead, prunedTokens, receiptsChecked }.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import {
  collectReceipts,
  rejectInvocation,
  runDrain,
  EXPO_PUSH_URL,
  EXPO_RECEIPT_URL,
  type ExpoPushMessage,
  type ExpoReceipt,
  type ExpoTicket,
  type OutboxRow,
  type PushTokenRow,
} from '../_shared/outbox.ts';

/** How many rows one invocation delivers, and how long it may hold them. */
const CLAIM_LIMIT = 100;
const LEASE_SECONDS = 120;
/** How many already-sent rows to check receipts for per run. Expo keeps receipts ~24 h. */
const RECEIPT_LOOKBACK_LIMIT = 200;
const TOKEN_PAGE_SIZE = 1000;

/** Carries the HTTP status so runDrain can tell a transient 429/5xx from a permanent 4xx. */
class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function pushToExpo(messages: readonly ExpoPushMessage[]): Promise<{ data?: ExpoTicket[] }> {
  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
  });
  if (!response.ok) throw new HttpError(response.status, `Expo push API responded ${response.status}`);
  return (await response.json()) as { data?: ExpoTicket[] };
}

async function fetchReceiptsFromExpo(
  ticketIds: readonly string[]
): Promise<Record<string, ExpoReceipt>> {
  const response = await fetch(EXPO_RECEIPT_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: ticketIds }),
  });
  if (!response.ok) {
    throw new HttpError(response.status, `Expo receipt API responded ${response.status}`);
  }
  const body = (await response.json()) as { data?: Record<string, ExpoReceipt> };
  return body?.data ?? {};
}

/** Push tokens of the given users, paged because PostgREST caps a response. */
async function fetchTokensFor(
  supabase: SupabaseClient,
  userIds: readonly string[]
): Promise<PushTokenRow[]> {
  if (userIds.length === 0) return [];
  const rows: PushTokenRow[] = [];
  for (let from = 0; ; from += TOKEN_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('push_tokens')
      .select('user_id, expo_push_token')
      .in('user_id', userIds as string[])
      .order('id')
      .range(from, from + TOKEN_PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    for (const row of page) {
      rows.push({
        user_id: row.user_id as string,
        expo_push_token: row.expo_push_token as string | null,
      });
    }
    if (page.length < TOKEN_PAGE_SIZE) break;
  }
  return rows;
}

/**
 * Rows already delivered whose Expo ticket id we recorded (complete_notification stores
 * `payload.ticket = { id, token }`). Only these can be looked up as receipts.
 */
async function fetchSentTickets(
  supabase: SupabaseClient
): Promise<{ ticketId: string; token: string }[]> {
  const { data, error } = await supabase
    .from('notification_outbox')
    .select('payload, sent_at')
    .eq('status', 'sent')
    .not('payload->ticket->>id', 'is', null)
    .order('sent_at', { ascending: false })
    .limit(RECEIPT_LOOKBACK_LIMIT);
  if (error) throw error;
  const out: { ticketId: string; token: string }[] = [];
  for (const row of data ?? []) {
    const ticket = (row.payload as { ticket?: { id?: unknown; token?: unknown } } | null)?.ticket;
    if (typeof ticket?.id === 'string' && typeof ticket?.token === 'string') {
      out.push({ ticketId: ticket.id, token: ticket.token });
    }
  }
  return out;
}

Deno.serve(async (request: Request) => {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const rejection = rejectInvocation(
    request.method,
    request.headers.get('Authorization'),
    serviceRoleKey
  );
  if (rejection) {
    console.error(`[notification-drain] rejected ${request.method} with ${rejection.status}`);
    return Response.json({ error: rejection.error }, { status: rejection.status });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey!, {
    auth: { persistSession: false },
  });

  const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) throw new Error(`${fn} failed: ${error.message}`);
    return data as T;
  };

  let result;
  try {
    result = await runDrain(
      {
        claim: (limit, leaseSeconds) =>
          rpc<OutboxRow[]>('claim_notifications', {
            p_limit: limit,
            p_lease_seconds: leaseSeconds,
          }).then((rows) => rows ?? []),
        tokensFor: (userIds) => fetchTokensFor(supabase, userIds),
        push: pushToExpo,
        complete: (id, ticket) =>
          rpc<void>('complete_notification', { p_id: id, p_ticket: ticket }).then(() => undefined),
        fail: (id, error, retry) =>
          rpc<string>('fail_notification', { p_id: id, p_error: error, p_retry: retry }).then(
            () => undefined
          ),
        prune: (tokens) =>
          rpc<number>('prune_push_tokens', { p_tokens: tokens }).then(() => undefined),
        log: (message) => console.error(message),
      },
      { limit: CLAIM_LIMIT, leaseSeconds: LEASE_SECONDS }
    );
  } catch (error) {
    // Claimed rows stay `sending` with a lease that expires: the next tick re-claims them.
    console.error('[notification-drain] drain pass failed', (error as Error).message);
    return Response.json({ error: 'drain failed' }, { status: 500 });
  }

  // Receipts are best effort: a failure here must never fail the delivery pass above.
  let receiptsChecked = 0;
  let receiptPrunedTokens = 0;
  try {
    const receipts = await collectReceipts(
      {
        fetchReceipts: fetchReceiptsFromExpo,
        prune: (tokens) =>
          rpc<number>('prune_push_tokens', { p_tokens: tokens }).then(() => undefined),
        log: (message) => console.error(message),
      },
      await fetchSentTickets(supabase)
    );
    receiptsChecked = receipts.checked;
    receiptPrunedTokens = receipts.prunedTokens;
  } catch (error) {
    console.error('[notification-drain] receipt pass failed', (error as Error).message);
  }

  return Response.json({ ...result, receiptsChecked, receiptPrunedTokens });
});
