// agora-rtc-token — mints the Agora RTC token a client needs to join a live class, and is the
// point where "live classes are for subscribed members only" is actually enforced. Everything
// else (live_class_participants policies, Realtime presence policies, the UI) is defence in
// depth; without a token there is no video.
//
// POST { "class_id": "<uuid>" } with the caller's user JWT.
//   200 { mode, app_id, channel, uid, token, expires_at, subscription:{state,days_overdue,grace_days_left} }
//   401 unauthorized          - no/!bearer header, or the JWT is not a real user (e.g. the anon key)
//   403 subscription_required - the caller is one of the coach's members but has no live access
//   403 not_entitled          - the caller is neither the class's coach nor one of that coach's members
//   404 class_not_found       - unknown or malformed class id
//   409 class_not_joinable    - the class already ended or was cancelled
//   405 method_not_allowed    - anything but POST
//   413 payload_too_large     - body over MAX_BODY_BYTES (the only body is one uuid field)
//
// The entitlement decision is made by the DATABASE, evaluated as the caller through a user-scoped
// client (rpc can_join_live_class / get_subscription_state). The service role is never used here:
// a bug in this file must not be able to hand out a token the SQL would refuse.
//
// Token: real Agora AccessToken2 (publisher role, 1 hour) when AGORA_APP_ID and
// AGORA_APP_CERTIFICATE are both set; otherwise mode 'mock' with token null, which is what local
// development and the Expo Go mock video adapter use. Secrets are never logged or returned.

import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  buildSuccessBody,
  decideAccess,
  deriveAgoraUid,
  isBodyTooLarge,
  parseClassId,
  readSubscriptionRow,
  rejectRequest,
  resolveInvisibleClass,
  TOKEN_TTL_SECONDS,
  type CallerProfile,
  type IssuedToken,
  type LiveClassRow,
} from './logic.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: CORS_HEADERS });
}

// Real token, or null when the app is not configured for live Agora (local dev / Expo Go).
// Imported lazily so a missing/renamed npm specifier degrades to mock mode instead of 500ing the
// whole function.
async function issueToken(channel: string, uid: number, now: Date): Promise<IssuedToken | null> {
  const appId = Deno.env.get('AGORA_APP_ID');
  const appCertificate = Deno.env.get('AGORA_APP_CERTIFICATE');
  if (!appId || !appCertificate) return null;

  try {
    const { RtcTokenBuilder, RtcRole } = await import('npm:agora-token@2');
    const expiresAt = new Date(now.getTime() + TOKEN_TTL_SECONDS * 1000);
    const privilegeExpire = Math.floor(expiresAt.getTime() / 1000);
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channel,
      uid,
      RtcRole.PUBLISHER,
      privilegeExpire,
      privilegeExpire
    );
    return { token, expiresAt };
  } catch (error) {
    console.error('[agora-rtc-token] token builder unavailable; falling back to mock mode', error);
    return null;
  }
}

Deno.serve(async (request: Request) => {
  // A browser preflight is not a call: answer it so the web build can reach the function at all.
  // Any other non-POST (including a bare OPTIONS probe) still gets 405.
  if (request.method === 'OPTIONS' && request.headers.get('Access-Control-Request-Method')) {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const authorization = request.headers.get('Authorization');
  const rejection = rejectRequest(request.method, authorization);
  if (rejection) return json({ error: rejection.error }, rejection.status);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) {
    console.error('[agora-rtc-token] SUPABASE_URL / SUPABASE_ANON_KEY are not set');
    return json({ error: 'server_misconfigured' }, 500);
  }

  // User-scoped: every query and RPC below runs under the caller's RLS, as the caller.
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization! } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData?.user ?? null;
  if (userError || !user) return json({ error: 'unauthorized' }, 401);

  // Size gate BEFORE the body is touched: the only legitimate body is a single uuid field, and an
  // 8 MB pad used to be read and JSON.parsed in full. Content-Length is absent under chunked
  // encoding, so the bytes actually read are checked as well.
  if (isBodyTooLarge(request.headers.get('Content-Length'))) {
    return json({ error: 'payload_too_large' }, 413);
  }

  let body: unknown = null;
  try {
    const raw = await request.text();
    if (isBodyTooLarge(null, raw.length)) return json({ error: 'payload_too_large' }, 413);
    body = raw.length > 0 ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  const classId = parseClassId(body);
  if (!classId) return json({ error: 'class_not_found' }, 404);

  const [classResult, profileResult, canJoinResult, stateResult, existsResult] = await Promise.all([
    supabase
      .from('live_classes')
      .select('id, coach_id, agora_channel_name, status')
      .eq('id', classId)
      .maybeSingle(),
    supabase.from('profiles').select('id, role, coach_id').eq('id', user.id).maybeSingle(),
    supabase.rpc('can_join_live_class', { p_class: classId }),
    supabase.rpc('get_subscription_state'),
    supabase.rpc('live_class_exists', { p_class: classId }),
  ]);

  if (
    classResult.error ||
    profileResult.error ||
    canJoinResult.error ||
    stateResult.error ||
    existsResult.error
  ) {
    console.error(
      '[agora-rtc-token] entitlement lookup failed',
      classResult.error ??
        profileResult.error ??
        canJoinResult.error ??
        stateResult.error ??
        existsResult.error
    );
    return json({ error: 'entitlement_lookup_failed' }, 500);
  }

  const liveClass = classResult.data as LiveClassRow | null;
  if (!liveClass) {
    // The row is hidden by live_classes_select_entitled_tenant, not necessarily absent. Ask the
    // existence rpc which refusal the contract calls for (403 not_entitled vs 404 class_not_found).
    const rejected = resolveInvisibleClass(existsResult.data === true);
    return json({ error: rejected.error }, rejected.status);
  }

  // profiles is self-or-coach, so this is always the caller's own row; a missing row means the
  // account was never onboarded and is treated as an unaffiliated member.
  const profile = (profileResult.data as CallerProfile | null) ?? {
    id: user.id,
    role: 'member',
    coach_id: null,
  };
  const subscription = readSubscriptionRow(stateResult.data);

  const denial = decideAccess({
    caller: profile,
    liveClass,
    canJoin: canJoinResult.data === true,
    subscription,
  });
  if (denial) return json({ error: denial.error }, denial.status);

  const now = new Date();
  const uid = deriveAgoraUid(user.id);
  const issued = await issueToken(liveClass.agora_channel_name, uid, now);

  return json(
    buildSuccessBody({
      channel: liveClass.agora_channel_name,
      uid,
      appId: Deno.env.get('AGORA_APP_ID') ?? null,
      issued,
      subscription,
    }),
    200
  );
});
