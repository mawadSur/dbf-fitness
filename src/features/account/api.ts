import { supabase } from '../../services/supabase/client';

/**
 * Calling the `delete-account` Edge Function, which is the ONLY way an account is deleted.
 *
 * The account deleted is the owner of the JWT supabase-js attaches; nothing here names a user, and
 * the function ignores any identifier in the body. The password is sent once, over the same TLS
 * connection as every other request, and is never stored or logged on either side.
 */

export type DeleteAccountErrorCode =
  | 'invalid_password'
  | 'confirm_required'
  | 'admin_managed_by_operator'
  | 'unauthorized'
  // Both of these are returned by the Edge Function (see its logic.ts DeleteAccountErrorCode).
  // Without them a 413 and a storage failure fell through to 'unknown' — "Try again in a moment."
  // — which is wrong advice for either.
  | 'payload_too_large'
  | 'storage_cleanup_failed'
  | 'network'
  | 'unknown';

export class DeleteAccountError extends Error {
  readonly code: DeleteAccountErrorCode;

  constructor(code: DeleteAccountErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'DeleteAccountError';
    this.code = code;
  }
}

const KNOWN_CODES: readonly DeleteAccountErrorCode[] = [
  'invalid_password',
  'confirm_required',
  'admin_managed_by_operator',
  'unauthorized',
  'payload_too_large',
  'storage_cleanup_failed',
];

/**
 * The typed code for a refusal.
 *
 * The body's `error` wins when it is one the UI knows, because the function distinguishes cases the
 * status alone cannot (403 is both `invalid_password` and `admin_managed_by_operator`). A refusal
 * we have no wording for becomes `unknown` rather than being shown raw: server text is not UI copy
 * and may echo details that do not belong on screen.
 */
export function codeFromStatus(status: number | undefined, bodyError: unknown): DeleteAccountErrorCode {
  if (typeof bodyError === 'string' && (KNOWN_CODES as readonly string[]).includes(bodyError)) {
    return bodyError as DeleteAccountErrorCode;
  }
  if (status === undefined) return 'network';
  switch (status) {
    case 400:
      return 'confirm_required';
    case 401:
      return 'unauthorized';
    case 403:
      return 'invalid_password';
    case 413:
      return 'payload_too_large';
    default:
      // 500 stays 'unknown' unless the body named the case: server_misconfigured and
      // delete_failed have no user-actionable difference, while storage_cleanup_failed does and is
      // picked up by the KNOWN_CODES branch above.
      return 'unknown';
  }
}

/** supabase-js wraps a non-2xx in FunctionsHttpError whose `context` is the fetch Response. */
async function toTypedError(error: unknown): Promise<DeleteAccountError> {
  const context = (error as { context?: unknown } | null)?.context as
    | { status?: number; json?: () => Promise<unknown> }
    | undefined;
  const readBody = async (): Promise<{ error?: unknown } | null> => {
    try {
      return context?.json ? ((await context.json()) as { error?: unknown }) : null;
    } catch {
      return null;
    }
  };
  const body = await readBody();
  const code = codeFromStatus(context?.status, body?.error);
  return new DeleteAccountError(code, (error as Error | null)?.message);
}

/**
 * Deletes the signed-in user's account. Resolves only on a `{ ok: true }` 200; every other outcome
 * throws a DeleteAccountError the panel maps to copy.
 */
export async function deleteAccount(password: string): Promise<void> {
  let data: unknown;
  let error: unknown;
  try {
    ({ data, error } = await supabase.functions.invoke('delete-account', {
      body: { confirm: 'DELETE', password },
    }));
  } catch (thrown) {
    // invoke() rejects (rather than resolving with `error`) when the request never completed.
    throw new DeleteAccountError('network', (thrown as Error | null)?.message);
  }
  if (error) throw await toTypedError(error);
  if (!data || typeof data !== 'object' || (data as { ok?: unknown }).ok !== true) {
    throw new DeleteAccountError('unknown', 'Malformed delete-account response');
  }
}

/**
 * How many members currently have this coach — the "N members will lose access" number.
 *
 * Read through profiles_select_self_or_coach_or_admin (`coach_id = auth.uid()`), so a coach can
 * only ever count their OWN members and no other tenant's. Returns null when the count is
 * unavailable, and the panel falls back to a generic sentence rather than showing a wrong number.
 */
export async function fetchMyMemberCount(): Promise<number | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData?.session?.user?.id;
  if (!userId) return null;
  const { count, error } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('coach_id', userId);
  if (error) return null;
  return typeof count === 'number' ? count : null;
}
