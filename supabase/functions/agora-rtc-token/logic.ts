// Pure request/decision logic for the agora-rtc-token Edge Function.
//
// No imports and no Deno/Node globals, so Jest runs this file unchanged (see logic.test.ts) and
// index.ts stays a thin Deno/Supabase/Agora wiring layer. Everything that decides WHO gets a token
// lives here or in SQL — never in the client.
//
// This function is THE enforcement point for video: the participant-row policies and the Realtime
// presence policies are defence in depth, but without an Agora token there is no call to join.
// The entitlement answer itself comes from the database, evaluated as the CALLER
// (rpc can_join_live_class / get_subscription_state through a user-scoped client), never as the
// service role. The logic below only classifies a refusal into the right status code.

/** Agora tokens are short-lived; the client re-requests one on every join. */
export const TOKEN_TTL_SECONDS = 3600;

/**
 * The only legitimate body is `{"class_id": "<uuid>"}` — about 50 bytes. 4 KiB leaves room for
 * whitespace and a future field while refusing the "POST 8 MB of padding and make the function
 * parse it" shape (reproduced: an 8 MB body was read and JSON.parsed in full).
 */
export const MAX_BODY_BYTES = 4096;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EntitledState = 'active' | 'grace' | 'staff';

export type SubscriptionSnapshot = {
  state: string;
  days_overdue: number;
  grace_days_left: number;
};

export type LiveClassRow = {
  id: string;
  coach_id: string;
  agora_channel_name: string;
  status: string;
};

export type CallerProfile = {
  id: string;
  role: string;
  coach_id: string | null;
};

export type Rejection = { status: number; error: string };

export type SuccessBody = {
  mode: 'live' | 'mock';
  app_id: string | null;
  channel: string;
  uid: number;
  token: string | null;
  expires_at: string | null;
  subscription: { state: EntitledState; days_overdue: number; grace_days_left: number };
};

/**
 * Method/credential gate. POST only — a stray GET from a link preview must not mint a token.
 * A CORS preflight (OPTIONS carrying Access-Control-Request-Method) is not a call and is handled
 * by the caller before this runs.
 */
export function rejectRequest(method: string, authorizationHeader: string | null): Rejection | null {
  if (method !== 'POST') return { status: 405, error: 'method_not_allowed' };
  if (!authorizationHeader || !/^Bearer\s+\S+$/i.test(authorizationHeader)) {
    return { status: 401, error: 'unauthorized' };
  }
  return null;
}

/**
 * Body-size gate, applied BEFORE the body is read.
 *
 * `declared` is the Content-Length header (absent under chunked transfer-encoding, hence the
 * separate `observed` check the caller applies to the bytes it actually read). Anything that
 * cannot be parsed as a non-negative integer is treated as unknown, not as zero.
 */
export function isBodyTooLarge(declared: string | null, observed?: number): boolean {
  if (typeof observed === 'number' && observed > MAX_BODY_BYTES) return true;
  if (declared === null) return false;
  const length = Number(declared);
  if (!Number.isFinite(length) || length < 0) return false;
  return length > MAX_BODY_BYTES;
}

/**
 * Refusal for a class the caller could not load under their own RLS.
 *
 * The class row is fetched as the CALLER, so `live_classes_select_entitled_tenant` hides other
 * tenants' classes and decideAccess never sees them. Without this split every unaffiliated caller
 * got 404 class_not_found, but common.md's contract reserves 404 for a class that does not exist
 * and requires 403 not_entitled for "not that coach's member / not staff of it".
 *
 * `exists` comes from the SECURITY DEFINER rpc public.live_class_exists, which answers existence
 * only and grants nothing — can_join_live_class remains the entitlement authority.
 */
export function resolveInvisibleClass(exists: boolean): Rejection {
  return exists
    ? { status: 403, error: 'not_entitled' }
    : { status: 404, error: 'class_not_found' };
}

/**
 * `class_id` out of an untrusted JSON body. Returns null for anything that is not a well-formed
 * uuid, which the caller maps to 404 class_not_found: a malformed id is indistinguishable from a
 * guessed one, and answering differently would tell an attacker their guess had the right shape.
 */
export function parseClassId(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const raw = (body as Record<string, unknown>).class_id;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return UUID_RE.test(trimmed) ? trimmed.toLowerCase() : null;
}

/**
 * A stable, positive 32-bit Agora uid for a user uuid (FNV-1a). Agora uids are numeric, so the
 * uuid cannot be used directly; the same user must get the same uid across joins so the client can
 * match remote uids to people. Range is 1..2147483647 — never 0, which Agora reads as
 * "assign me one".
 */
export function deriveAgoraUid(userId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < userId.length; i += 1) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash % 2147483647) + 1;
}

export type AccessInput = {
  caller: CallerProfile;
  liveClass: LiveClassRow;
  /** public.can_join_live_class(class), evaluated by the DB as the caller. Authoritative. */
  canJoin: boolean;
  subscription: SubscriptionSnapshot;
};

/**
 * Turns the database's verdict into an HTTP outcome.
 *
 * Allowing is driven ONLY by `canJoin` (SQL). The extra checks pick the right refusal so the app
 * can tell "you need to pay" from "this is not your class":
 *   not_entitled         - the caller is neither the class's coach nor one of that coach's members
 *                          (checked first, so an outsider is never told a subscription would help)
 *   subscription_required- affiliated, but state is none/expired
 *   class_not_joinable   - entitled, but the class already ended or was cancelled
 */
export function decideAccess(input: AccessInput): Rejection | null {
  const { caller, liveClass, canJoin, subscription } = input;

  if (canJoin) {
    if (liveClass.status === 'ended' || liveClass.status === 'cancelled') {
      return { status: 409, error: 'class_not_joinable' };
    }
    return null;
  }

  const affiliated = caller.id === liveClass.coach_id || caller.coach_id === liveClass.coach_id;
  if (!affiliated) return { status: 403, error: 'not_entitled' };
  if (subscription.state === 'none' || subscription.state === 'expired') {
    return { status: 403, error: 'subscription_required' };
  }
  return { status: 403, error: 'not_entitled' };
}

/** Narrows the DB state to the three values the success body may carry. */
export function entitledState(state: string): EntitledState {
  if (state === 'grace') return 'grace';
  if (state === 'staff') return 'staff';
  return 'active';
}

export type IssuedToken = { token: string; expiresAt: Date };

export function buildSuccessBody(params: {
  channel: string;
  uid: number;
  appId: string | null;
  issued: IssuedToken | null;
  subscription: SubscriptionSnapshot;
}): SuccessBody {
  const { channel, uid, appId, issued, subscription } = params;
  return {
    mode: issued ? 'live' : 'mock',
    app_id: appId ?? null,
    channel,
    uid,
    token: issued ? issued.token : null,
    expires_at: issued ? issued.expiresAt.toISOString() : null,
    subscription: {
      state: entitledState(subscription.state),
      days_overdue: subscription.days_overdue,
      grace_days_left: subscription.grace_days_left,
    },
  };
}

/** Normalises the single row `get_subscription_state()` returns (PostgREST hands back an array). */
export function readSubscriptionRow(data: unknown): SubscriptionSnapshot {
  const row = Array.isArray(data) ? data[0] : data;
  if (typeof row !== 'object' || row === null) {
    return { state: 'none', days_overdue: 0, grace_days_left: 0 };
  }
  const record = row as Record<string, unknown>;
  return {
    state: typeof record.state === 'string' ? record.state : 'none',
    days_overdue: typeof record.days_overdue === 'number' ? record.days_overdue : 0,
    grace_days_left: typeof record.grace_days_left === 'number' ? record.grace_days_left : 0,
  };
}
