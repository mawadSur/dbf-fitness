/**
 * The one definition of "what is the signed-in user allowed to see".
 *
 * Before this, every screen that needed the role ran its own
 * `profiles.select('role')` on mount (Home, effort-review, the notes checks),
 * so a coach paid three round trips for one fact and each screen flashed member
 * UI until its own request landed. `RoleProvider` fetches it once per session;
 * these helpers are the pure part so they can be tested without React.
 *
 * Trust boundary: this is UI shaping ONLY. The real authorization lives in RLS
 * policies and in the SECURITY DEFINER bodies of the RPCs — a client that lies
 * about its role gets nothing extra.
 */

import { supabase } from '../../services/supabase/client';

export type AppRole = 'member' | 'coach' | 'admin';

export const ROLE_QUERY_KEY = ['auth', 'role'] as const;

/** Unknown/missing/garbage role text degrades to the LEAST privileged answer. */
export function normalizeRole(value: unknown): AppRole {
  return value === 'coach' || value === 'admin' ? value : 'member';
}

export function isStaff(role: AppRole | null): boolean {
  return role === 'coach' || role === 'admin';
}

export function isCoach(role: AppRole | null): boolean {
  return role === 'coach';
}

export function isAdmin(role: AppRole | null): boolean {
  return role === 'admin';
}

/**
 * The caller's own profile role, or null when nobody is signed in.
 *
 * `maybeSingle` (not `single`): a signed-in user whose profile row has not been
 * created yet is a legitimate state during sign-up, not an error to throw at
 * the root layout.
 */
export async function fetchRole(): Promise<AppRole | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return normalizeRole((data as { role?: unknown }).role);
}
