/**
 * One role fetch per session, shared by every screen.
 *
 * Mounted in the root layout INSIDE the session gate so it only ever fetches
 * for a signed-in user, and it holds a loading gate of its own: staff must
 * never see a frame of member UI while their role is in flight.
 *
 * `Stack.Protected` and everything built on `useRole()` are UI only. RLS and
 * the SECURITY DEFINER RPC bodies are the actual boundary.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase } from '../../services/supabase/client';
import { fetchRole, isAdmin, isCoach, isStaff, ROLE_QUERY_KEY, type AppRole } from './role';

export type RoleContextValue = {
  role: AppRole | null;
  isLoading: boolean;
  /**
   * The fetch failed. Callers that gate a whole screen on the role need this to
   * tell "you are not a coach" apart from "we could not ask" — otherwise a
   * flaky network locks a coach out of their own screen with a wrong message.
   */
  isError: boolean;
  /** The failure itself, for `friendlyErrorMessage`. */
  error: unknown;
  isStaff: boolean;
  isCoach: boolean;
  isAdmin: boolean;
  refresh: () => void;
};

const SIGNED_OUT: RoleContextValue = {
  role: null,
  isLoading: false,
  isError: false,
  error: null,
  isStaff: false,
  isCoach: false,
  isAdmin: false,
  refresh: () => undefined,
};

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [isSessionKnown, setIsSessionKnown] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const apply = (id: string | null) => {
      if (cancelled) return;
      setUserId(id);
      setIsSessionKnown(true);
    };

    supabase.auth
      .getSession()
      .then(({ data }) => apply(data.session?.user.id ?? null))
      .catch(() => apply(null));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => apply(session?.user.id ?? null));

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // Keyed by user id so account B never reads account A's cached role, even in
  // the window before `resetAuthCache` clears the client.
  const query = useQuery({
    queryKey: [...ROLE_QUERY_KEY, userId],
    queryFn: fetchRole,
    enabled: isSessionKnown && !!userId,
    staleTime: Infinity,
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ROLE_QUERY_KEY });
  }, [queryClient]);

  const value = useMemo<RoleContextValue>(() => {
    if (isSessionKnown && !userId) return { ...SIGNED_OUT, refresh };
    // A failed fetch must not wedge the app on a spinner: treat it as "role not
    // known yet, render the least-privileged UI" and let `refresh` retry.
    const role = query.isError ? null : (query.data ?? null);
    return {
      role,
      isLoading: !isSessionKnown || (!!userId && query.isPending),
      isError: query.isError,
      error: query.error ?? null,
      isStaff: isStaff(role),
      isCoach: isCoach(role),
      isAdmin: isAdmin(role),
      refresh,
    };
  }, [isSessionKnown, userId, query.isError, query.error, query.data, query.isPending, refresh]);

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

/**
 * The signed-in user's role.
 *
 * Normally this is the one value `RoleProvider` fetched for the whole session.
 * Without a provider above it (a screen mounted on its own — a test harness, a
 * storybook-style route) it falls back to fetching the role itself, under the
 * SAME query key, so a screen is never silently downgraded to "not staff"
 * just because of where it was mounted. TanStack dedupes the request either
 * way; the provider's value is preferred because it is keyed by user id.
 */
export function useRole(): RoleContextValue {
  const provided = useContext(RoleContext);
  const hasProvider = provided !== null;

  // Hooks must be unconditional, so the fallback query is always declared and
  // only ENABLED when there is no provider.
  const fallback = useQuery({
    queryKey: ROLE_QUERY_KEY,
    queryFn: fetchRole,
    enabled: !hasProvider,
    staleTime: Infinity,
  });
  const queryClient = useQueryClient();
  const refreshFallback = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ROLE_QUERY_KEY });
  }, [queryClient]);

  return useMemo<RoleContextValue>(() => {
    if (provided) return provided;
    const role = fallback.isError ? null : (fallback.data ?? null);
    return {
      role,
      isLoading: fallback.isPending,
      isError: fallback.isError,
      error: fallback.error ?? null,
      isStaff: isStaff(role),
      isCoach: isCoach(role),
      isAdmin: isAdmin(role),
      refresh: refreshFallback,
    };
  }, [provided, fallback.isError, fallback.error, fallback.data, fallback.isPending, refreshFallback]);
}
