import { Linking } from 'react-native';

/**
 * Opens a URL in the system browser / mail app and NEVER throws.
 *
 * `Linking.openURL` rejects in three situations we actually hit on devices:
 *  - a `mailto:` on a phone with no mail account configured (common on review devices),
 *  - an Android build with no browser that claims the intent,
 *  - a malformed URL from a mis-set env var.
 *
 * Every caller renders a visible fallback on `false` rather than leaving a dead tap, which is
 * what the store-review "links must work" check looks for.
 */
export async function openExternal(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/** Fallback shown next to a link that would not open, so the address is still reachable. */
export function couldNotOpenMessage(target: string): string {
  return `Could not open ${target}. Copy it into your browser or mail app.`;
}

/** Fallback for a mailto that would not open: the address itself is the useful thing. */
export function couldNotOpenMailMessage(email: string): string {
  return `No mail app is set up on this device. Please email ${email}.`;
}
