// Pure helpers for the live-class-reminder Edge Function. No imports and no Deno/Node globals, so
// the same file runs in the Edge runtime and under Jest (see
// src/features/liveClasses/reminders.test.ts).

export const REMINDER_WINDOW_MINUTES = 15;
/** Expo's push API accepts at most 100 messages per request. */
export const EXPO_BATCH_SIZE = 100;

const MS_PER_MINUTE = 60_000;

export type LiveClassRow = {
  id: string;
  coach_id: string;
  title: string;
  starts_at: string;
  status: string;
  reminder_sent_at: string | null;
};

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  data: { liveClassId: string };
};

export type InvocationRejection = { status: number; error: string };

/**
 * Gate for an incoming invocation, kept pure so it is unit-testable without the Edge runtime.
 * Returns null when the request may proceed, otherwise the status/body to reply with.
 *
 * The function sends real pushes and reads every member's token with the service-role client, so
 * it must only ever run for the scheduler. It requires POST (a stray GET from a crawler or a
 * link preview must not fan out notifications) and the service-role key as a bearer token.
 * A missing key is a misconfigured deployment, not an open door, so it fails closed with 500.
 * Neither the expected nor the supplied credential is ever returned or logged.
 */
export function rejectInvocation(
  method: string,
  authorizationHeader: string | null,
  serviceRoleKey: string | undefined
): InvocationRejection | null {
  if (method !== 'POST') return { status: 405, error: 'method not allowed' };
  if (!serviceRoleKey) return { status: 500, error: 'server misconfigured' };
  if (authorizationHeader !== `Bearer ${serviceRoleKey}`) return { status: 401, error: 'unauthorized' };
  return null;
}

/** ISO bounds of the reminder window: [now, now + windowMinutes]. */
export function reminderWindow(
  now: Date,
  windowMinutes = REMINDER_WINDOW_MINUTES
): { from: string; to: string } {
  return {
    from: now.toISOString(),
    to: new Date(now.getTime() + windowMinutes * MS_PER_MINUTE).toISOString(),
  };
}

/**
 * A class is due when it is still scheduled, has not been reminded yet, and starts between now
 * and now + windowMinutes (inclusive). Mirrors the SQL filter the function runs, so the two can
 * be cross-checked and the rule is unit-testable without a database.
 */
export function isDueForReminder(
  liveClass: Pick<LiveClassRow, 'status' | 'starts_at' | 'reminder_sent_at'>,
  now: Date,
  windowMinutes = REMINDER_WINDOW_MINUTES
): boolean {
  if (liveClass.status !== 'scheduled' || liveClass.reminder_sent_at !== null) return false;
  const diffMs = new Date(liveClass.starts_at).getTime() - now.getTime();
  return diffMs >= 0 && diffMs <= windowMinutes * MS_PER_MINUTE;
}

export function selectClassesDueForReminder<T extends LiveClassRow>(
  classes: readonly T[],
  now: Date,
  windowMinutes = REMINDER_WINDOW_MINUTES
): T[] {
  return classes.filter((liveClass) => isDueForReminder(liveClass, now, windowMinutes));
}

/** Splits `items` into consecutive chunks of at most `size` (size < 1 is treated as 1). */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunkSize = Math.max(1, Math.floor(size));
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) chunks.push(items.slice(i, i + chunkSize));
  return chunks;
}

/** Drops blank and repeated tokens, keeping first-seen order (one device may be registered twice). */
export function uniqueTokens(tokens: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  for (const token of tokens) {
    if (typeof token === 'string' && token.trim() !== '') seen.add(token.trim());
  }
  return [...seen];
}

export type PushTokenRow = { user_id: string; expo_push_token: string | null };

/**
 * Tokens belonging to members who currently have live-class access.
 *
 * A "starting soon" push must not be sent to someone the join flow would turn away — it would be
 * an invitation to a door that is locked (agora-rtc-token answers 403 subscription_required). The
 * entitlement itself is decided by selectEntitledMemberIds in
 * supabase/functions/_shared/subscriptionState.ts, which mirrors public.subscription_state_row();
 * this function only does the set intersection, so it stays trivially testable.
 */
export function tokensForMembers(
  rows: readonly PushTokenRow[],
  entitledMemberIds: readonly string[]
): string[] {
  const entitled = new Set(entitledMemberIds);
  return uniqueTokens(rows.filter((row) => entitled.has(row.user_id)).map((row) => row.expo_push_token));
}

export function buildReminderMessages(
  liveClass: Pick<LiveClassRow, 'id' | 'title'>,
  tokens: readonly string[]
): ExpoPushMessage[] {
  return uniqueTokens(tokens).map((to) => ({
    to,
    title: 'Starting soon',
    body: `${liveClass.title} is about to start. Tap to join.`,
    sound: 'default',
    data: { liveClassId: liveClass.id },
  }));
}
