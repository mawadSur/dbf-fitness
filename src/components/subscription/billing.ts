import { Linking } from 'react-native';

// A deliberate small duplicate of src/features/liveClasses/billing.ts (owned elsewhere): the
// subscription panels are shared between features and must not depend on the live-class feature.

/** Where "Renew" / "Subscribe" goes. Unset in dev: callers show the contact-your-coach fallback. */
export function billingUrl(): string | null {
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

export const CONTACT_COACH_TO_RENEW = 'Contact your coach to renew.';
