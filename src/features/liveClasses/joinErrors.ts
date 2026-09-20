import { RtcCredentialsError } from '../../services/video/credentials';

export const NETWORK_ERROR_COPY = 'Could not reach the server. Check your connection and try again.';
export const JOIN_FAILED_COPY = 'Could not join the class. Please try again.';
export const CONNECTION_LOST_COPY = 'You lost connection to the class. Check your connection and try again.';

/** Raw provider/SDK text belongs in the dev log only, never on screen. */
export function logDiagnostic(tag: string, raw: unknown): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn(`[liveClasses] ${tag}`, raw);
}

/** Member-facing copy for a failed join. The raw error is logged (dev only), never returned. */
export function joinErrorMessage(error: unknown): string {
  // supabase-js reports a dropped connection as a FunctionsFetchError / FunctionsRelayError.
  const name = (error as { name?: string } | null)?.name;
  if (error instanceof RtcCredentialsError) {
    if (error.code === 'unknown') return NETWORK_ERROR_COPY;
    logDiagnostic('join failed', error);
    return JOIN_FAILED_COPY;
  }
  if (name === 'FunctionsFetchError' || name === 'FunctionsRelayError') return NETWORK_ERROR_COPY;
  logDiagnostic('join failed', error);
  return JOIN_FAILED_COPY;
}

/** Copy for the adapter's post-join failure callback (its `reason` is raw Agora diagnostics). */
export function connectionFailedMessage(reason: unknown): string {
  logDiagnostic('connection failed', reason);
  return CONNECTION_LOST_COPY;
}
