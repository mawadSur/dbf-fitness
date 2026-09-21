/**
 * The token this device most recently registered, in memory only.
 *
 * Sign-out has to unregister BEFORE `auth.signOut()` (afterwards there is no
 * JWT left and the RPC would be rejected), and re-reading the token from
 * expo-notifications at that moment can block on native for seconds. So the
 * registrar remembers it and sign-out just reads it back.
 *
 * Deliberately not persisted: a token that survives a reinstall is a token that
 * outlives the permission that produced it.
 */

let registeredToken: string | null = null;

export function rememberPushToken(token: string | null): void {
  registeredToken = token;
}

export function getRememberedPushToken(): string | null {
  return registeredToken;
}

export function forgetPushToken(): void {
  registeredToken = null;
}
