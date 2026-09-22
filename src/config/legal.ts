/**
 * Legal document versions, public URLs and the support contact.
 *
 * ONE source of truth: the sign-up checkbox, the TermsGate, the profile
 * LegalSection and the store listings all read from here, so a version bump is
 * a one-line change that automatically re-prompts every signed-in user.
 *
 * TODO_OWNER: the three URLs below MUST be live, publicly reachable pages before
 * submission — App Store Connect and Play Console both fetch them, and a 404
 * privacy-policy URL is an automatic rejection. The defaults point at
 * https://dbf-fitness.com/ paths that DO NOT EXIST YET. Drafts of the content
 * live in docs/legal/ (lane L1a). Either host those drafts at these paths or
 * override each URL per build profile in eas.json.
 */

import { isPlaceholder } from './env';

/**
 * Bump this whenever docs/legal/terms-of-service.md or privacy-policy.md change
 * materially. Every signed-in user is re-prompted by TermsGate on the next launch.
 * Format: ISO date of the document's effective date.
 */
export const TERMS_VERSION = '2026-09-21';

/** Marketing site root. TODO_OWNER: confirm this is the canonical domain. */
const SITE_ROOT = 'https://dbf-fitness.com';

/**
 * Reads a URL from the build environment, treating an UNFILLED TEMPLATE as absent.
 *
 * eas.json ships `https://REPLACE_WITH_PRIVACY_URL` in the preview and production profiles so
 * the owner can see which values they owe us. Without the `isPlaceholder` check that literal
 * is a perfectly good non-empty string, so it would sail through and become the Terms /
 * Privacy link a reviewer actually taps — which Apple guideline 2.1 rejects outright
 * ("placeholder text, empty websites, and other temporary content should be scrubbed before
 * submission", https://developer.apple.com/app-store/review/guidelines/ — re-verify at
 * submission).
 *
 * Falling back to the `dbf-fitness.com` default is the safe half of the fix; the other half is
 * `checkLegalConfig` in ./env, which stops a RELEASE build carrying such a placeholder from
 * running at all. Substituting quietly is not enough on its own, because the default pages are
 * not hosted yet either (see the TODO_OWNER at the top of this file).
 */
function envUrl(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  if (!trimmed || isPlaceholder(trimmed)) return fallback;
  return trimmed;
}

/**
 * Public URL of the privacy policy. Submitted to BOTH stores as the
 * "Privacy Policy URL" and linked from sign-up and Profile.
 */
export const PRIVACY_URL = envUrl(process.env.EXPO_PUBLIC_PRIVACY_URL, `${SITE_ROOT}/privacy`);

/** Public URL of the terms of service / EULA (Apple guideline 1.2 expects one for UGC apps). */
export const TERMS_URL = envUrl(process.env.EXPO_PUBLIC_TERMS_URL, `${SITE_ROOT}/terms`);

/** Public support page URL. Required by App Store Connect ("Support URL") and Play. */
export const SUPPORT_URL = envUrl(process.env.EXPO_PUBLIC_SUPPORT_URL, `${SITE_ROOT}/support`);

/**
 * Sentinel used when no support mailbox has been supplied.
 *
 * Deliberately NOT a plausible address. An earlier revision defaulted to
 * `support@dbf-fitness.com`, which is an INVENTED OWNER FACT: nobody has confirmed that
 * mailbox exists or is monitored, yet every abuse report, "Contact support" and "Report a
 * problem" tap would have been addressed to it — and Apple guideline 1.2 requires "published
 * contact information so users can easily reach you". A bounced abuse report is worse than a
 * visibly unfinished build, so the unset state is loud instead.
 */
export const SUPPORT_EMAIL_PLACEHOLDER = 'TODO_OWNER_SUPPORT_EMAIL_NOT_SET';

/**
 * Support mailbox. TODO_OWNER (REQUIRED, no default): must be a monitored inbox — the terms
 * promise a 24-hour response to abuse reports (Apple guideline 1.2) and both stores publish
 * this address on the listing. Set `EXPO_PUBLIC_SUPPORT_EMAIL` per build profile in eas.json.
 *
 * When unset this is {@link SUPPORT_EMAIL_PLACEHOLDER}, and `checkLegalConfig` (src/config/env.ts)
 * makes a non-`__DEV__` build refuse to run rather than ship it.
 */
export const SUPPORT_EMAIL = (() => {
  const configured = process.env.EXPO_PUBLIC_SUPPORT_EMAIL?.trim();
  if (!configured || isPlaceholder(configured)) return SUPPORT_EMAIL_PLACEHOLDER;
  return configured;
})();

/** False when the build is running on {@link SUPPORT_EMAIL_PLACEHOLDER}. */
export const SUPPORT_EMAIL_CONFIGURED = SUPPORT_EMAIL !== SUPPORT_EMAIL_PLACEHOLDER;

/** Product name as it appears in legal copy and store listings. */
export const PRODUCT_NAME = 'DBF Fitness';

/**
 * Builds a `mailto:` URL with an encoded subject and body. Returned as a string
 * so callers can hand it to `Linking.openURL` and handle the failure themselves
 * (a device with no mail client configured rejects the open).
 */
export function supportMailto(subject: string, body?: string): string {
  const params = [`subject=${encodeURIComponent(subject)}`];
  if (body) params.push(`body=${encodeURIComponent(body)}`);
  return `mailto:${SUPPORT_EMAIL}?${params.join('&')}`;
}

/** Subject line used by the "Contact support" row on Profile. */
export const SUPPORT_SUBJECT = `${PRODUCT_NAME} support request`;

/** Subject line used by the "Report a problem" row on Profile. */
export const PROBLEM_SUBJECT = `${PRODUCT_NAME} problem report`;

/**
 * Prefilled body for "Report a problem". Deliberately asks for the app version
 * and the device, because a bug report without them costs a round trip.
 */
export const PROBLEM_BODY =
  'Describe what happened (and what you expected instead):\n\n\n' +
  '--- please keep the lines below ---\n' +
  'App version:\nDevice:\n';
