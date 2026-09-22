import { Linking } from 'react-native';

import { SUPPORT_EMAIL, supportMailto } from '../../config/legal';

// A deliberate small duplicate of src/features/liveClasses/billing.ts (owned elsewhere): the
// subscription panels are shared between features and must not depend on the live-class feature.

/**
 * STORE-COMPLIANCE FLAG — default FALSE, and it must stay false for store builds.
 *
 * Members pay DBF outside the app (an admin marks them paid). Access to live classes and
 * workout notes is therefore a DIGITAL SERVICE unlocked by an off-app payment. Both stores
 * restrict how such an app may talk about paying:
 *
 *  - Apple App Review Guideline 3.1.1 ("In-App Purchase") and the 3.1.3 PREAMBLE (the
 *    chapeau above 3.1.3(a)-(d), NOT 3.1.3(b), which is "Multiplatform Services"):
 *      "Apps in this section cannot, within the app, encourage users to use a purchasing
 *       method other than in-app purchase, except for apps on the United States storefront
 *       and as set forth in 3.1.1(a) and 3.1.3(a)."
 *    We have not applied for the US link-out entitlement (3.1.1(a)) and are not a reader or
 *    multiplatform-service app, so no exception applies to us.
 *    https://developer.apple.com/app-store/review/guidelines/#in-app-purchase
 *  - Google Play's Payments policy carries the same prohibition on steering for in-app
 *    digital purchases.
 *    https://support.google.com/googleplay/android-developer/answer/10281818
 *  (re-verify both pages at submission — these policies change often, and the US/EU
 *  link-out entitlements in particular have moved several times.)
 *
 * A "Renew now" button opening an external billing page is exactly the pattern reviewers
 * reject. So: when this flag is false the subscription surfaces state the FACT that the
 * membership is managed by DBF, with a support mailto for questions, and NO purchase link
 * and NO "Subscribe"/"Renew" call to action.
 *
 * ENTITLEMENT IS UNAFFECTED. This flag changes copy and affordances only; who may join a
 * live class or read notes is decided by `get_subscription_state` / `has_live_access` in SQL
 * and by the `agora-rtc-token` Edge Function, none of which read it.
 *
 * TODO_OWNER: leave `EXPO_PUBLIC_ALLOW_EXTERNAL_BILLING_LINK` unset (or 'false') for every
 * store profile. Set it to 'true' ONLY for internal/enterprise distribution that never goes
 * through review, or after Apple/Google have granted an explicit link-out entitlement.
 */
export function billingLinkAllowed(): boolean {
  return process.env.EXPO_PUBLIC_ALLOW_EXTERNAL_BILLING_LINK === 'true';
}

/**
 * Where "Renew" / "Subscribe" goes — `null` whenever a link must not be shown, which is
 * either because the flag is off (store build) or because no URL was configured.
 */
export function billingUrl(): string | null {
  if (!billingLinkAllowed()) return null;
  const url = process.env.EXPO_PUBLIC_BILLING_URL?.trim();
  return url ? url : null;
}

/** Opens the billing page; resolves false (never throws) when unset or the OS refuses the link. */
export async function openBilling(): Promise<boolean> {
  const url = billingUrl();
  if (!url) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Neutral, non-steering explanation shown when `billingLinkAllowed()` is false. It describes
 * how membership already works rather than inviting a purchase, so it is not a "call to
 * action" under either store's payments policy.
 */
export const MANAGED_BY_DBF =
  'Your membership is managed by DBF. Contact your coach or DBF to renew.';

/** The support address offered alongside the neutral copy, as plain text for the label. */
export const MANAGED_BY_DBF_EMAIL = SUPPORT_EMAIL;

/** `mailto:` for the membership question row. Not a purchase link — it opens the mail app. */
export function membershipMailto(): string {
  return supportMailto('DBF Fitness membership question');
}

/** @deprecated Kept for older call sites; prefer {@link MANAGED_BY_DBF}. */
export const CONTACT_COACH_TO_RENEW = MANAGED_BY_DBF;
