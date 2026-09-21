/**
 * TanStack's cache is process-wide, so it outlives the account that filled it.
 *
 * Without this, signing out of Jordan and into Dana on the same device served
 * Jordan's plan, stats and notes from cache for up to `staleTime` — real data
 * leakage between accounts, not just a stale screen. Every auth identity change
 * therefore drops the whole cache.
 *
 * `queryClient.ts` is owned by another lane, so the reset lives here and is
 * bound from the root layout.
 */

/** The slice of `QueryClient` this needs — keeps the unit tests free of TanStack. */
export type ClearableCache = { clear: () => void };

type AuthUser = { id?: string | null } | null | undefined;
type AuthSession = { user?: AuthUser } | null | undefined;

/** The slice of `supabase.auth` this needs. */
export type AuthStateSource = {
  onAuthStateChange: (
    callback: (event: string, session: AuthSession) => void,
  ) => { data: { subscription: { unsubscribe: () => void } } };
};

/**
 * Events that mean "the previous user's data must not be readable any more",
 * regardless of what the session says. `SIGNED_OUT` also arrives when a token
 * refresh fails hard, which is exactly when a stale cache would be worst.
 */
const ALWAYS_CLEAR_EVENTS = new Set(['SIGNED_OUT', 'USER_DELETED']);

/**
 * Stateful decision function: given the stream of auth events, returns true for
 * the ones that must wipe the cache. Exported for tests and reused by the binder.
 */
export function createAuthIdentityWatcher(): (event: string, session: AuthSession) => boolean {
  // `undefined` = no identity observed yet (app start). The very first event is
  // adoption, never a clear: clearing there would throw away the prefetch the
  // root layout just did for the user who is already signed in.
  let lastUserId: string | null | undefined;

  return (event, session) => {
    const nextUserId = session?.user?.id ?? null;

    if (ALWAYS_CLEAR_EVENTS.has(event)) {
      const changed = lastUserId !== null;
      lastUserId = null;
      return changed;
    }

    if (lastUserId === undefined) {
      lastUserId = nextUserId;
      return false;
    }

    if (nextUserId !== lastUserId) {
      lastUserId = nextUserId;
      return true;
    }

    // Same user: TOKEN_REFRESHED, USER_UPDATED, a repeated INITIAL_SESSION.
    return false;
  };
}

/**
 * Clears `cache` whenever the signed-in identity changes. Returns the unsubscribe
 * function, so the root layout can bind it like `bindAuthAutoRefresh`.
 */
export function bindAuthCacheReset(auth: AuthStateSource, cache: ClearableCache): () => void {
  const shouldClear = createAuthIdentityWatcher();
  const {
    data: { subscription },
  } = auth.onAuthStateChange((event, session) => {
    if (shouldClear(event, session)) cache.clear();
  });
  return () => subscription.unsubscribe();
}
