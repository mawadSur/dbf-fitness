// Pure request/decision logic for the delete-account Edge Function.
//
// No imports and no Deno/Node globals, so Jest runs this file unchanged (see logic.test.ts) and
// index.ts stays a thin Deno/Supabase wiring layer. Everything that decides WHETHER an account may
// be deleted, and WHAT has to be removed, lives here; index.ts only performs the effects.
//
// The one rule that outranks everything else in this file: the account being deleted is ALWAYS the
// owner of the verified JWT. Nothing in the request body can name a user — `parseDeleteRequest`
// reads exactly two fields and a forged `user_id` / `id` / `email` is dropped on the floor.

/**
 * The only legitimate body is `{"confirm":"DELETE","password":"…"}`. 4 KiB leaves generous room for
 * a long passphrase while refusing the "POST megabytes of padding and make the function parse it"
 * shape that agora-rtc-token was hardened against.
 */
export const MAX_BODY_BYTES = 4096;

/** The exact word the user must type. Case-sensitive on purpose: "delete" is too easy to hit. */
export const CONFIRM_WORD = 'DELETE';

/** Storage list() page size and how deep the recording prefix tree is walked (`<uid>/<rec>/<file>`). */
export const STORAGE_PAGE_SIZE = 100;
export const MAX_STORAGE_DEPTH = 4;

export type Rejection = { status: number; error: string };

export type DeleteAccountErrorCode =
  | 'method_not_allowed'
  | 'unauthorized'
  | 'payload_too_large'
  | 'confirm_required'
  | 'invalid_password'
  | 'admin_managed_by_operator'
  | 'storage_cleanup_failed'
  | 'delete_failed'
  | 'server_misconfigured';

/**
 * Method/credential gate. POST only — a GET from a link preview, a crawler or a mistyped `curl`
 * must never be able to start a destructive flow.
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
 * `declared` is Content-Length (absent under chunked transfer-encoding, hence the separate
 * `observed` check the caller applies to the bytes it actually read). Anything unparseable is
 * treated as unknown rather than as zero.
 */
export function isBodyTooLarge(declared: string | null, observed?: number): boolean {
  if (typeof observed === 'number' && observed > MAX_BODY_BYTES) return true;
  if (declared === null) return false;
  const length = Number(declared);
  if (!Number.isFinite(length) || length < 0) return false;
  return length > MAX_BODY_BYTES;
}

export type ParsedDeleteRequest = { password: string };

/**
 * The untrusted body, reduced to the only thing index.ts is allowed to act on: the password to
 * re-authenticate with.
 *
 * Deliberately NOT returned: any user identifier. The uid comes from the verified JWT, so a body
 * like `{"confirm":"DELETE","password":"…","user_id":"<someone else>"}` deletes the CALLER and
 * nobody else. Order of refusals matters — a caller who never typed DELETE is told
 * `confirm_required` and their password is not even looked at.
 *
 * A missing/blank password is `invalid_password` (403) rather than a 400: the client treats both
 * the same ("that password is not right"), and the two cases are indistinguishable to an attacker.
 */
export function parseDeleteRequest(body: unknown): ParsedDeleteRequest | Rejection {
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};

  const confirm = typeof record.confirm === 'string' ? record.confirm.trim() : '';
  if (confirm !== CONFIRM_WORD) return { status: 400, error: 'confirm_required' };

  const password = typeof record.password === 'string' ? record.password : '';
  if (password.length === 0) return { status: 403, error: 'invalid_password' };

  return { password };
}

/**
 * Admin accounts are provisioned and removed by an operator, never self-service: an admin deleting
 * themselves in the app could leave the deployment with nobody who can moderate. Coaches and
 * members may always delete themselves.
 */
export function roleRejection(role: string | null | undefined): Rejection | null {
  return role === 'admin' ? { status: 403, error: 'admin_managed_by_operator' } : null;
}

/** Everything the user owns in the recordings bucket lives under `<uid>/` (see upload.ts). */
export function storagePrefix(userId: string): string {
  return `${userId}/`;
}

/**
 * True when the sign-in used to re-authenticate really belongs to the JWT's owner.
 *
 * Guards the case where the email on the body/session and the signed-in user diverge: the password
 * check only counts if it proved possession of THIS account's credentials.
 */
export function passwordProofMatches(callerId: string, signedInUserId: string | null | undefined): boolean {
  return typeof signedInUserId === 'string' && signedInUserId === callerId;
}

export type StorageEntry = {
  name: string;
  /** Supabase Storage returns `id: null` for a synthetic folder entry and a uuid for a real object. */
  id?: string | null;
};

export type StorageLister = (prefix: string, offset: number, limit: number) => Promise<StorageEntry[]>;

/**
 * Every object path under `<uid>/`, found by walking the prefix tree.
 *
 * Storage's list() is NOT recursive and pages at `limit`, so both have to be driven by hand. Folder
 * entries come back with a null id; real objects carry one. Depth is capped so a pathological or
 * hostile listing cannot spin forever, and an empty `name` (which would produce a path ending in
 * '/') is skipped.
 *
 * The returned paths are what the caller hands to Storage `remove()`.
 */
export async function collectUserObjectPaths(list: StorageLister, userId: string): Promise<string[]> {
  const found: string[] = [];
  const seen = new Set<string>();

  const walk = async (prefix: string, depth: number): Promise<void> => {
    if (depth > MAX_STORAGE_DEPTH) return;
    let offset = 0;
    for (;;) {
      const page = await list(prefix, offset, STORAGE_PAGE_SIZE);
      if (!Array.isArray(page) || page.length === 0) return;
      for (const entry of page) {
        const name = typeof entry?.name === 'string' ? entry.name : '';
        if (!name || name === '.' || name === '..' || name.includes('/')) continue;
        const path = `${prefix}${name}`;
        if (entry.id) {
          if (!seen.has(path)) {
            seen.add(path);
            found.push(path);
          }
        } else {
          await walk(`${path}/`, depth + 1);
        }
      }
      if (page.length < STORAGE_PAGE_SIZE) return;
      offset += page.length;
    }
  };

  await walk(storagePrefix(userId), 1);
  return found;
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * An error message safe to put in the function log.
 *
 * This function handles a password and an email on every call and runs in a shared log stream, so
 * nothing that identifies the account may be written. Emails and uuids are masked, the result is
 * truncated, and the password is never passed to this (or any) logger in the first place.
 */
export function safeErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string'
          ? ((error as { message: string }).message)
          : 'unknown error';
  return raw.replace(EMAIL_RE, '[email]').replace(UUID_RE, '[uid]').slice(0, 200);
}

export type SuccessBody = { ok: true; storage_cleanup_pending?: true };

/**
 * The 200 body.
 *
 * `ok: true` means the ACCOUNT is gone, which is the only thing the client acts on. Storage
 * removal happens after the account delete (see index.ts step 4) and can only fail once the
 * account is already irrecoverable, so a failure there is reported as an extra flag rather than as
 * an error status: telling the user "deletion failed" when their account no longer exists would
 * leave them retrying against a dead session. The flag exists so an operator (and any future
 * client) can see the bucket still needs sweeping.
 */
export function buildSuccessBody(storageCleanupPending = false): SuccessBody {
  return storageCleanupPending ? { ok: true, storage_cleanup_pending: true } : { ok: true };
}
