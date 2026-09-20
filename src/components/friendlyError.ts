// Turns raw errors (Postgres/PostgREST/fetch text) into copy safe to show a member.
// The raw text is only written to a dev log, never rendered.

export type ErrorKind = 'network' | 'auth' | 'forbidden' | 'generic';

const NETWORK = /network|failed to fetch|fetch failed|networkerror|timed? ?out|timeout|offline|econn|enotfound|load failed/i;
const AUTH = /jwt|not (signed|logged) in|not authenticated|unauthori[sz]ed|invalid (login|token)|session (expired|missing)|\b401\b/i;
const FORBIDDEN = /permission denied|row-level security|\brls\b|not allowed|forbidden|not_entitled|subscription_required|42501|\b403\b/i;

function rawText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const o = error as { message?: unknown; code?: unknown };
    return [o.message, o.code].filter((v) => typeof v === 'string').join(' ');
  }
  return '';
}

export function classifyError(error: unknown): ErrorKind {
  const text = rawText(error);
  if (NETWORK.test(text)) return 'network';
  if (AUTH.test(text)) return 'auth';
  if (FORBIDDEN.test(text)) return 'forbidden';
  return 'generic';
}

const logged = new WeakSet<object>();

function devLog(error: unknown): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') return;
  if (error && typeof error === 'object') {
    if (logged.has(error)) return;
    logged.add(error);
  }
  console.warn('[dev] request failed:', rawText(error) || error);
}

/** `fallback` is the screen-specific generic sentence, e.g. "Could not load your workout plan." */
export function friendlyErrorMessage(error: unknown, fallback: string): string {
  devLog(error);
  switch (classifyError(error)) {
    case 'network':
      return "Can't reach the server. Check your connection and try again.";
    case 'auth':
      return 'You are not signed in. Please sign in again.';
    case 'forbidden':
      return "You don't have access to this.";
    default:
      return fallback;
  }
}

/**
 * Message for a screen fed by several queries: prefers an auth/forbidden error over a network or
 * generic one (an expired session must not read as a transient failure), else the first error.
 */
export function friendlyErrorFromMany(errors: unknown[], fallback: string): string {
  const present = errors.filter((e) => e != null);
  const pick =
    present.find((e) => classifyError(e) === 'auth') ??
    present.find((e) => classifyError(e) === 'forbidden') ??
    present[0];
  return friendlyErrorMessage(pick, fallback);
}
