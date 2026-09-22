import { supabase } from '../../services/supabase/client';

/**
 * Terms-acceptance RPCs (migration 20260921150000).
 *
 * Apple guideline 1.2 requires an app with user-generated content to make every user agree to
 * terms that forbid objectionable content. A checkbox on sign-up covers NEW accounts; these
 * calls also let `TermsGate` re-prompt EXISTING accounts after a version bump, which is the
 * half that is normally missed.
 *
 * Both functions are SECURITY DEFINER and gate on `auth.uid()` in their body, so an
 * unauthenticated caller gets a silent no-op / `false` rather than an error (never a crash —
 * see the pgTAP 34 anon cases).
 */

/**
 * Records acceptance of BOTH documents at `version` for the caller. Idempotent: the
 * `unique(user_id, doc, version)` index makes a repeat call a no-op, so retrying after a
 * flaky network is always safe.
 */
export async function acceptTerms(version: string): Promise<void> {
  const { error } = await supabase.rpc('accept_terms', { p_version: version });
  if (error) throw error;
}

/**
 * Whether the caller has already accepted `version`. Returns false for a signed-out caller.
 */
export async function hasAcceptedTerms(version: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('has_accepted_terms', { p_version: version });
  if (error) throw error;
  return data === true;
}
