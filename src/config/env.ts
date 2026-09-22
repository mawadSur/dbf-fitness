/**
 * Production-configuration guards.
 *
 * A RELEASE build must never silently fall back to a local default or to a mock
 * adapter: a store reviewer (or a paying member) would see an app that looks
 * like it works and quietly talks to nothing. In `__DEV__` every fallback stays
 * exactly as it was — these checks only bite when `__DEV__` is false.
 *
 * Everything here is pure and takes its inputs as arguments so Jest can cover
 * each case without mutating `process.env` or redefining `__DEV__`.
 */

/** A value left as a template in eas.json / .env.example, e.g. `REPLACE_WITH_PROD_ANON_KEY`. */
export function isPlaceholder(value: string | undefined): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  return /REPLACE[_-]/i.test(trimmed) || trimmed.startsWith('TODO_OWNER');
}

/** A Supabase URL that points at the developer's own machine and cannot work on a device. */
export function isLocalUrl(value: string | undefined): boolean {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) return false;
  return (
    trimmed.includes('127.0.0.1') ||
    trimmed.includes('localhost') ||
    trimmed.includes('10.0.2.2') ||
    trimmed.includes('0.0.0.0')
  );
}

export type SupabaseConfigInput = {
  url: string | undefined;
  anonKey: string | undefined;
  isDev: boolean;
};

export type SupabaseConfigProblem =
  | 'missing_url'
  | 'missing_key'
  | 'local_url'
  | 'placeholder_url'
  | 'placeholder_key';

export type SupabaseConfigVerdict = {
  /** True when the app must refuse to run and show the blocking screen. */
  blocked: boolean;
  problems: readonly SupabaseConfigProblem[];
};

/**
 * Decides whether the backend configuration is fit to ship.
 *
 * In dev nothing is ever blocked (the local stack IS 127.0.0.1) — the problems
 * are still reported so a dev build can log them.
 */
export function checkSupabaseConfig(input: SupabaseConfigInput): SupabaseConfigVerdict {
  const problems: SupabaseConfigProblem[] = [];
  const url = input.url?.trim();
  const key = input.anonKey?.trim();

  if (!url) problems.push('missing_url');
  else if (isPlaceholder(url)) problems.push('placeholder_url');
  else if (isLocalUrl(url)) problems.push('local_url');

  if (!key) problems.push('missing_key');
  else if (isPlaceholder(key)) problems.push('placeholder_key');

  return { blocked: !input.isDev && problems.length > 0, problems };
}

export type LegalConfigProblem =
  | 'placeholder_privacy_url'
  | 'placeholder_terms_url'
  | 'placeholder_support_url'
  | 'missing_support_email';

export type ConfigProblem = SupabaseConfigProblem | LegalConfigProblem;

export type LegalConfigInput = {
  privacyUrl: string | undefined;
  termsUrl: string | undefined;
  supportUrl: string | undefined;
  supportEmail: string | undefined;
  isDev: boolean;
};

/**
 * Decides whether the USER-VISIBLE legal configuration is fit to ship.
 *
 * Distinct from {@link checkSupabaseConfig} because the failure is different in kind: the app
 * still works, it just points its Terms / Privacy / support affordances at a `REPLACE_…`
 * literal. Apple guideline 2.1 ("placeholder text, empty websites, and other temporary content
 * should be scrubbed before submission") and 1.2 ("published contact information so users can
 * easily reach you") both fail on exactly that, and nothing else in the app would notice.
 * https://developer.apple.com/app-store/review/guidelines/ (re-verify at submission)
 *
 * The URLs have sanctioned `https://dbf-fitness.com/*` defaults, so a placeholder there is
 * already neutralised by `envUrl` in src/config/legal.ts — this verdict is the second layer
 * that stops the build rather than quietly substituting a page that may not be hosted yet.
 *
 * The support MAILBOX has no default at all and never will: inventing an owner fact is the one
 * thing this lane must not do, so an unset address is a hard block rather than a guess.
 */
export function checkLegalConfig(input: LegalConfigInput): {
  blocked: boolean;
  problems: readonly LegalConfigProblem[];
} {
  const problems: LegalConfigProblem[] = [];
  if (isPlaceholder(input.privacyUrl)) problems.push('placeholder_privacy_url');
  if (isPlaceholder(input.termsUrl)) problems.push('placeholder_terms_url');
  if (isPlaceholder(input.supportUrl)) problems.push('placeholder_support_url');

  const email = input.supportEmail?.trim();
  if (!email || isPlaceholder(email)) problems.push('missing_support_email');

  return { blocked: !input.isDev && problems.length > 0, problems };
}

/** Human-readable detail lines for the blocking screen; never leaks the key itself. */
export const CONFIG_PROBLEM_TEXT: Record<ConfigProblem, string> = {
  missing_url: 'The backend URL is missing from this build.',
  missing_key: 'The backend key is missing from this build.',
  local_url: 'This build points at a development server that phones cannot reach.',
  placeholder_url: 'The backend URL is still a placeholder.',
  placeholder_key: 'The backend key is still a placeholder.',
  placeholder_privacy_url: 'The privacy policy link is still a placeholder.',
  placeholder_terms_url: 'The terms of service link is still a placeholder.',
  placeholder_support_url: 'The support page link is still a placeholder.',
  missing_support_email: 'The support email address is missing from this build.',
};

export const NOT_CONFIGURED_TITLE = 'This build is not configured';
export const NOT_CONFIGURED_BODY =
  'DBF Fitness cannot reach its servers because this copy of the app was built without its ' +
  'settings. Please install the version from the App Store or Google Play, or contact DBF.';

export type VideoAvailabilityInput = {
  appId: string | undefined;
  isDev: boolean;
  /** `Platform.OS` — the mock is legitimate on web, which never ships to a store. */
  os: string;
};

export type VideoAvailability = 'live' | 'mock' | 'unavailable';

/**
 * What live video can actually do in this build.
 *
 * - `live`     — a real Agora app id is present.
 * - `mock`     — dev or web: the local-preview adapter is fine and expected.
 * - `unavailable` — a RELEASE native build with no app id. The UI must say
 *   "Live video is not available in this build" instead of placing a fake call
 *   that looks connected and never carries audio.
 */
export function videoAvailability(input: VideoAvailabilityInput): VideoAvailability {
  const appId = input.appId?.trim();
  const configured = Boolean(appId) && !isPlaceholder(appId);
  if (configured) return input.os === 'ios' || input.os === 'android' ? 'live' : 'mock';
  if (input.isDev || input.os === 'web') return 'mock';
  return 'unavailable';
}

export const VIDEO_UNAVAILABLE_TITLE = 'Live video is not available in this build';
export const VIDEO_UNAVAILABLE_BODY =
  'This copy of DBF Fitness was built without video credentials, so the class cannot be joined ' +
  'here. Please update to the latest version from the store.';

export type PushModeInput = {
  realPushFlag: string | undefined;
  isDev: boolean;
  os: string;
};

export type PushMode = 'real' | 'disabled';

/**
 * `disabled` means starting-soon alerts will not arrive. It is silent in dev and
 * on web; in a release build the live screen surfaces it, because a member who
 * believes they will be reminded and is not has lost their class.
 */
export function pushMode(input: PushModeInput): PushMode {
  return input.realPushFlag === 'true' && input.os !== 'web' ? 'real' : 'disabled';
}

/** Whether the "reminders are off in this build" notice should be shown to the user. */
export function shouldWarnPushDisabled(input: PushModeInput): boolean {
  if (input.isDev || input.os === 'web') return false;
  return pushMode(input) === 'disabled';
}

export const PUSH_DISABLED_NOTICE =
  'Class reminders are turned off in this build. Check the schedule so you do not miss a class.';
