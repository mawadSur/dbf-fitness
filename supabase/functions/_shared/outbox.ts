// Portable logic for the notification-drain Edge Function.
//
// No Deno globals, no `npm:`/`jsr:` specifiers and no I/O of its own: every dependency (the
// database calls, the Expo HTTP call, the clock) is injected, so the whole drain — including its
// error handling and its retry decisions — runs under Jest. index.ts is the only Deno-aware file
// and does nothing but wire real implementations into runDrain().
//
// Delivery model (see supabase/migrations/20260921141000_notification_outbox.sql):
//   claim (lease) -> expand rows to one Expo message per device -> POST to Expo
//     -> per-message TICKET decides complete / retry / dead
//   later: collectReceipts() asks Expo what actually happened and prunes dead devices.
// At-least-once: a drain that dies after Expo accepted a batch leaves a leased row that is
// re-claimed and re-sent. A duplicate reminder is better than a missing one.

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
export const EXPO_RECEIPT_URL = 'https://exp.host/--/api/v2/push/getReceipts';
/** Expo accepts at most 100 messages per request, and at most 1000 receipt ids. */
export const EXPO_BATCH_SIZE = 100;
export const EXPO_RECEIPT_BATCH_SIZE = 1000;

export type OutboxRow = {
  id: string;
  user_id: string;
  kind: string;
  dedupe_key: string;
  title: string;
  body: string;
  payload: Record<string, unknown> | null;
  attempts: number;
};

export type PushTokenRow = { user_id: string; expo_push_token: string | null };

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  data: Record<string, unknown>;
};

/** One planned delivery: which outbox row, to which device. */
export type PlannedMessage = { rowId: string; token: string; message: ExpoPushMessage };

export type ExpoTicket =
  | { status: 'ok'; id?: string }
  | { status: 'error'; message?: string; details?: { error?: string } };

export type ExpoReceipt = ExpoTicket;

/** What to do with one row after Expo answered about it. */
export type Outcome =
  // `token` is carried so complete_notification can record WHICH device the ticket belongs to;
  // without it the later receipt lookup knows a delivery failed but not what to prune.
  | { kind: 'sent'; ticketId: string | null; token: string }
  | { kind: 'retry'; error: string }
  | { kind: 'dead'; error: string; pruneToken: string | null };

/**
 * Timing-safe string comparison for the service-role bearer token.
 *
 * `===` on secrets leaks their length and their first differing byte through response timing.
 * The length is compared separately (it cannot be hidden) and the bytes are then XOR-folded over
 * a fixed number of iterations so the loop does not exit early.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type InvocationRejection = { status: number; error: string };

/**
 * Gate for an incoming drain invocation. Returns null to proceed.
 *
 * POST only (a crawler's GET must not fan out pushes) and the service-role key as a bearer token.
 * A missing key is a misconfigured deployment, so it fails CLOSED with 500 rather than allowing
 * the call. Neither credential is returned or logged.
 */
export function rejectInvocation(
  method: string,
  authorizationHeader: string | null,
  serviceRoleKey: string | undefined
): InvocationRejection | null {
  if (method !== 'POST') return { status: 405, error: 'method not allowed' };
  if (!serviceRoleKey) return { status: 500, error: 'server misconfigured' };
  const expected = `Bearer ${serviceRoleKey}`;
  if (!authorizationHeader || !constantTimeEquals(authorizationHeader, expected)) {
    return { status: 401, error: 'unauthorized' };
  }
  return null;
}

/** Splits `items` into consecutive chunks of at most `size` (size < 1 is treated as 1). */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunkSize = Math.max(1, Math.floor(size));
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) chunks.push(items.slice(i, i + chunkSize));
  return chunks;
}

/** Tokens per user, blanks and duplicates removed (one device can be registered twice). */
export function tokensByUser(rows: readonly PushTokenRow[]): Map<string, string[]> {
  const byUser = new Map<string, string[]>();
  for (const row of rows) {
    const token = typeof row.expo_push_token === 'string' ? row.expo_push_token.trim() : '';
    if (token === '') continue;
    const list = byUser.get(row.user_id) ?? [];
    if (!list.includes(token)) list.push(token);
    byUser.set(row.user_id, list);
  }
  return byUser;
}

/**
 * Expands claimed rows into one message per (row, device).
 *
 * A row whose user has no device cannot ever be delivered, so it is reported separately and
 * dead-lettered by the caller instead of being retried five times against nothing.
 */
export function planDelivery(
  rows: readonly OutboxRow[],
  tokens: Map<string, string[]>
): { messages: PlannedMessage[]; undeliverable: OutboxRow[] } {
  const messages: PlannedMessage[] = [];
  const undeliverable: OutboxRow[] = [];
  for (const row of rows) {
    const deviceTokens = tokens.get(row.user_id) ?? [];
    if (deviceTokens.length === 0) {
      undeliverable.push(row);
      continue;
    }
    for (const token of deviceTokens) {
      messages.push({
        rowId: row.id,
        token,
        message: {
          to: token,
          title: row.title,
          body: row.body,
          sound: 'default',
          data: { ...(row.payload ?? {}), outboxId: row.id, kind: row.kind },
        },
      });
    }
  }
  return { messages, undeliverable };
}

/**
 * Expo error codes that are permanent for a given device or message. Retrying them burns quota
 * and will never succeed, so the row is dead-lettered immediately.
 *   DeviceNotRegistered — the app was uninstalled or the token rotated; the token must be pruned.
 *   MessageTooBig / InvalidCredentials / MismatchSenderId — our bug or our configuration.
 */
const PERMANENT_EXPO_ERRORS = new Set([
  'DeviceNotRegistered',
  'MessageTooBig',
  'InvalidCredentials',
  'MismatchSenderId',
]);

/** MessageRateExceeded is Expo telling us to slow down — the only ticket error worth a retry. */
export function classifyTicket(ticket: ExpoTicket | undefined, token: string): Outcome {
  if (!ticket) return { kind: 'retry', error: 'no ticket returned for this message' };
  if (ticket.status === 'ok') return { kind: 'sent', ticketId: ticket.id ?? null, token };

  const code = ticket.details?.error ?? '';
  const message = ticket.message ?? code ?? 'Expo rejected the message';
  if (PERMANENT_EXPO_ERRORS.has(code)) {
    return { kind: 'dead', error: message, pruneToken: code === 'DeviceNotRegistered' ? token : null };
  }
  return { kind: 'retry', error: message };
}

/** 429 and 5xx are transient; every other non-2xx is a bug on our side. */
export function isRetryableHttpStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

/**
 * One row can produce several messages (several devices). The row's fate is the WORST outcome:
 * dead only when nothing is deliverable, retry if any device deserves another go, sent otherwise.
 * Prune tokens are collected across all of them.
 */
export function reduceOutcomes(outcomes: readonly Outcome[]): Outcome {
  if (outcomes.length === 0) return { kind: 'retry', error: 'no outcome recorded' };
  const retry = outcomes.find((o): o is Extract<Outcome, { kind: 'retry' }> => o.kind === 'retry');
  if (retry) return retry;
  const sent = outcomes.find((o): o is Extract<Outcome, { kind: 'sent' }> => o.kind === 'sent');
  if (sent) return sent;
  return outcomes[0];
}

export type DrainDeps = {
  /** public.claim_notifications(p_limit, p_lease_seconds) */
  claim: (limit: number, leaseSeconds: number) => Promise<OutboxRow[]>;
  /** push_tokens rows for the given users (service role read). */
  tokensFor: (userIds: readonly string[]) => Promise<PushTokenRow[]>;
  /** POST a batch to Expo. Rejects with an HttpError for a non-2xx response. */
  push: (messages: readonly ExpoPushMessage[]) => Promise<{ data?: ExpoTicket[] }>;
  /** public.complete_notification(p_id, p_ticket) */
  complete: (id: string, ticket: unknown) => Promise<void>;
  /** public.fail_notification(p_id, p_error, p_retry) */
  fail: (id: string, error: string, retry: boolean) => Promise<void>;
  /** public.prune_push_tokens(p_tokens) */
  prune: (tokens: readonly string[]) => Promise<void>;
  log?: (message: string) => void;
};

export type DrainResult = {
  claimed: number;
  sent: number;
  retried: number;
  dead: number;
  prunedTokens: number;
};

/**
 * One drain pass: claim a lease-bounded batch, deliver it, record every outcome.
 *
 * A failure of the Expo call itself is attributed to every row in that batch (retry for 429/5xx,
 * dead otherwise) rather than being thrown away — leaving rows `sending` would work too, because
 * the lease expires, but that wastes a whole lease period and hides the error.
 */
export async function runDrain(
  deps: DrainDeps,
  options: { limit?: number; leaseSeconds?: number } = {}
): Promise<DrainResult> {
  const limit = options.limit ?? 50;
  const rows = await deps.claim(limit, options.leaseSeconds ?? 120);
  const result: DrainResult = { claimed: rows.length, sent: 0, retried: 0, dead: 0, prunedTokens: 0 };
  if (rows.length === 0) return result;

  const tokenRows = await deps.tokensFor([...new Set(rows.map((row) => row.user_id))]);
  const { messages, undeliverable } = planDelivery(rows, tokensByUser(tokenRows));

  // Collect per-row outcomes, then apply each row once.
  const perRow = new Map<string, Outcome[]>();
  const record = (rowId: string, outcome: Outcome) => {
    const list = perRow.get(rowId) ?? [];
    list.push(outcome);
    perRow.set(rowId, list);
  };

  for (const row of undeliverable) {
    record(row.id, { kind: 'dead', error: 'no registered device for this user', pruneToken: null });
  }

  const tokensToPrune = new Set<string>();

  for (const batch of chunk(messages, EXPO_BATCH_SIZE)) {
    let tickets: ExpoTicket[] | undefined;
    try {
      const response = await deps.push(batch.map((planned) => planned.message));
      tickets = Array.isArray(response?.data) ? response.data : undefined;
      if (!tickets) throw new Error('Expo returned an unexpected body');
    } catch (error) {
      const status = (error as { status?: number }).status ?? 0;
      const retryable = status === 0 || isRetryableHttpStatus(status);
      const message = `Expo push failed: ${(error as Error).message ?? 'unknown'}`;
      // Never log the batch: it contains device tokens.
      deps.log?.(`[notification-drain] batch of ${batch.length} failed (status ${status})`);
      for (const planned of batch) {
        record(
          planned.rowId,
          retryable ? { kind: 'retry', error: message } : { kind: 'dead', error: message, pruneToken: null }
        );
      }
      continue;
    }

    batch.forEach((planned, index) => {
      const outcome = classifyTicket(tickets?.[index], planned.token);
      if (outcome.kind === 'dead' && outcome.pruneToken) tokensToPrune.add(outcome.pruneToken);
      record(planned.rowId, outcome);
    });
  }

  for (const [rowId, outcomes] of perRow) {
    const outcome = reduceOutcomes(outcomes);
    if (outcome.kind === 'sent') {
      await deps.complete(
        rowId,
        outcome.ticketId ? { id: outcome.ticketId, token: outcome.token } : null
      );
      result.sent += 1;
    } else if (outcome.kind === 'retry') {
      await deps.fail(rowId, outcome.error, true);
      result.retried += 1;
    } else {
      await deps.fail(rowId, outcome.error, false);
      result.dead += 1;
    }
  }

  if (tokensToPrune.size > 0) {
    await deps.prune([...tokensToPrune]);
    result.prunedTokens = tokensToPrune.size;
  }

  return result;
}

/**
 * Second phase: Expo tickets only say "accepted". The RECEIPT says whether the device got it, and
 * it is the receipt — not the ticket — that reports most DeviceNotRegistered cases. Pruning on
 * receipts is what actually keeps push_tokens clean.
 *
 * `sentRows` are rows already marked sent, carrying the ticket id recorded by
 * complete_notification() and the token they went to.
 */
export async function collectReceipts(
  deps: {
    fetchReceipts: (ticketIds: readonly string[]) => Promise<Record<string, ExpoReceipt>>;
    prune: (tokens: readonly string[]) => Promise<void>;
    log?: (message: string) => void;
  },
  sentRows: readonly { ticketId: string; token: string }[]
): Promise<{ checked: number; prunedTokens: number }> {
  const byTicket = new Map(sentRows.map((row) => [row.ticketId, row.token]));
  const ids = [...byTicket.keys()].filter((id) => id !== '');
  if (ids.length === 0) return { checked: 0, prunedTokens: 0 };

  const tokensToPrune = new Set<string>();
  let checked = 0;
  for (const batch of chunk(ids, EXPO_RECEIPT_BATCH_SIZE)) {
    let receipts: Record<string, ExpoReceipt>;
    try {
      receipts = await deps.fetchReceipts(batch);
    } catch {
      // A receipt lookup that fails is retried on the next pass; it must never fail the drain.
      deps.log?.(`[notification-drain] receipt lookup failed for ${batch.length} tickets`);
      continue;
    }
    for (const [ticketId, receipt] of Object.entries(receipts ?? {})) {
      checked += 1;
      if (receipt?.status !== 'error') continue;
      if (receipt.details?.error === 'DeviceNotRegistered') {
        const token = byTicket.get(ticketId);
        if (token) tokensToPrune.add(token);
      }
    }
  }

  if (tokensToPrune.size > 0) await deps.prune([...tokensToPrune]);
  return { checked, prunedTokens: tokensToPrune.size };
}
