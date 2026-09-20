// delete-account — lets a signed-in user permanently delete their own account and personal data
// from inside the app (Apple App Store guideline 5.1.1(v), product decision 2026-09-20).
//
// POST { "confirm": "DELETE", "password": "<current password>" } with the caller's user JWT.
//   200 { ok: true }
//   400 confirm_required            - the body did not carry confirm:"DELETE"
//   401 unauthorized                - no/!bearer header, or the JWT is not a live user
//                                     (this is also what a SECOND call gets: the user is gone)
//   403 invalid_password            - the password did not re-authenticate this account
//   403 admin_managed_by_operator   - admin accounts are removed out-of-band, never self-service
//   405 method_not_allowed          - anything but POST
//   413 payload_too_large           - body over MAX_BODY_BYTES
//   500 server_misconfigured / storage_cleanup_failed / delete_failed
//
// WHOSE account is deleted: the owner of the verified JWT, always. The body is parsed by
// logic.parseDeleteRequest, which returns nothing but a password — a forged `user_id` in the body
// is not read by anything in this file.
//
// Order of operations, and why:
//   1. re-authenticate the password on a SEPARATE anon client. A live JWT in a stolen phone is not
//      enough to erase an account.
//   2. ENUMERATE (read-only) the user's Storage objects under `<uid>/`. Nothing is destroyed yet:
//      this only proves the bucket is reachable and collects the paths. A failure here refuses the
//      whole request with storage_cleanup_failed while the account is still completely intact.
//   3. auth.admin.deleteUser(uid) — one `delete from auth.users`; everything in public.* follows
//      through the foreign keys audited in supabase/migrations/20260919154000_account_deletion.sql.
//   4. only NOW remove the objects listed in step 2. storage.objects has NO foreign key to
//      auth.users and a BEFORE DELETE trigger (storage.protect_delete) refuses direct SQL deletes,
//      so the Storage API is the only way those rows and bytes go away.
//
//      Why removal moved AFTER the delete (2026-09-20 review): it used to run before, so any
//      failure of step 3 — and step 3 DID fail for every coach who had scored a member's effort,
//      see the migration — left a live account whose recordings had already been destroyed.
//      Losing a live user's data is unrecoverable; leaving bytes behind for a moment after the
//      account is gone is not. If step 4 fails the account is already deleted, so the call still
//      answers 200 with `storage_cleanup_pending: true` (the user must not be told their deletion
//      failed when it did not) and logs an operator-visible error.
//
// Logging: this handler holds a password and an email on every call. Nothing identifying is ever
// logged — messages go through logic.safeErrorMessage, which masks emails and uuids.

import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  buildSuccessBody,
  collectUserObjectPaths,
  isBodyTooLarge,
  parseDeleteRequest,
  passwordProofMatches,
  rejectRequest,
  roleRejection,
  safeErrorMessage,
  storagePrefix,
  type StorageEntry,
} from './logic.ts';

const RECORDINGS_BUCKET = 'recordings';
const REMOVE_CHUNK = 100;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: CORS_HEADERS });
}

Deno.serve(async (request: Request) => {
  // A browser preflight is not a call; any other non-POST (including a bare OPTIONS probe) gets 405.
  if (request.method === 'OPTIONS' && request.headers.get('Access-Control-Request-Method')) {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const authorization = request.headers.get('Authorization');
  const rejection = rejectRequest(request.method, authorization);
  if (rejection) return json({ error: rejection.error }, rejection.status);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) {
    console.error('[delete-account] SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are not set');
    return json({ error: 'server_misconfigured' }, 500);
  }

  // User-scoped: identifies the caller and reads their own profile under their own RLS.
  const asCaller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization! } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await asCaller.auth.getUser();
  const user = userData?.user ?? null;
  if (userError || !user) return json({ error: 'unauthorized' }, 401);

  // Size gate BEFORE the body is touched; Content-Length is absent under chunked encoding, so the
  // bytes actually read are checked too.
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

  const parsed = parseDeleteRequest(body);
  if ('error' in parsed) return json({ error: parsed.error }, parsed.status);

  // profiles is self-or-coach under RLS, so this can only be the caller's own row. A missing row
  // (an account that was never provisioned) is treated as a member, i.e. deletable.
  const { data: profileRow, error: profileError } = await asCaller
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) {
    console.error('[delete-account] profile lookup failed', safeErrorMessage(profileError));
    return json({ error: 'delete_failed' }, 500);
  }
  const role = (profileRow as { role?: string } | null)?.role ?? 'member';
  const roleRejected = roleRejection(role);
  if (roleRejected) return json({ error: roleRejected.error }, roleRejected.status);

  // --- 1. re-authenticate ---------------------------------------------------
  // A fresh anon client with NO Authorization header and no persisted session: signing in here must
  // not disturb the caller's own session, and the password must never reach the service-role client.
  const email = user.email ?? '';
  if (!email) {
    // Email/password is the only credential this app issues; without one there is nothing to prove.
    console.error('[delete-account] account has no email; cannot re-authenticate');
    return json({ error: 'invalid_password' }, 403);
  }

  const asVerifier = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: signIn, error: signInError } = await asVerifier.auth.signInWithPassword({
    email,
    password: parsed.password,
  });
  if (signInError || !passwordProofMatches(user.id, signIn?.user?.id)) {
    // Never log the password, the email, or the GoTrue message (which echoes the email).
    console.warn('[delete-account] password re-authentication refused');
    return json({ error: 'invalid_password' }, 403);
  }
  // Drop the session this check just minted. `local` only: a `global` sign-out would revoke the
  // caller's other devices before we know the delete will succeed.
  await asVerifier.auth.signOut({ scope: 'local' }).catch(() => undefined);

  // --- 2. Storage, READ-ONLY -------------------------------------------------
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const bucket = admin.storage.from(RECORDINGS_BUCKET);

  let paths: string[];
  try {
    paths = await collectUserObjectPaths(async (prefix, offset, limit) => {
      const { data, error } = await bucket.list(prefix, { limit, offset });
      if (error) throw error;
      return (data ?? []) as StorageEntry[];
    }, user.id);
  } catch (error) {
    // Nothing has been touched: the account, its rows and its files are all still here.
    console.error('[delete-account] storage listing failed; nothing was deleted', safeErrorMessage(error));
    return json({ error: 'storage_cleanup_failed' }, 500);
  }

  // --- 3. the account --------------------------------------------------------
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    // Still nothing destroyed — in particular the recordings listed above are untouched.
    console.error('[delete-account] auth user delete failed', safeErrorMessage(deleteError));
    return json({ error: 'delete_failed' }, 500);
  }

  // --- 4. the files ----------------------------------------------------------
  // The account is gone; from here on a failure can only be reported, never undone.
  let storageCleanupPending = false;
  try {
    for (let i = 0; i < paths.length; i += REMOVE_CHUNK) {
      const { error } = await bucket.remove(paths.slice(i, i + REMOVE_CHUNK));
      if (error) throw error;
    }

    // Anything still under the prefix means the removal silently did not take.
    const { data: leftover, error: leftoverError } = await bucket.list(storagePrefix(user.id), {
      limit: 1,
      offset: 0,
    });
    if (leftoverError) throw leftoverError;
    if ((leftover ?? []).length > 0) throw new Error('storage prefix is not empty after remove');
  } catch (error) {
    storageCleanupPending = true;
    console.error(
      '[delete-account] storage cleanup failed AFTER the account was deleted; objects under the prefix need operator cleanup',
      safeErrorMessage(error),
    );
  }

  return json(buildSuccessBody(storageCleanupPending), 200);
});
