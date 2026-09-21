// Allowlist for the `route` a push notification may navigate to when the user taps it.
//
// Why an allowlist and not a sanity check. The route arrives from OUTSIDE the app: it is stored in
// notification_outbox.payload, travels through the Expo push service and comes back in the
// notification response. Anything on that path that is compromised or simply buggy can hand the
// app an arbitrary string, and the tap handler feeds it straight to the router. An open router is
// a redirect primitive — `javascript:` / `http:` targets on web, and on native a link into a
// screen the user never asked for (a coach's profile, a prefilled form). So taps navigate ONLY to
// destinations enumerated here; everything else is dropped and the tap falls back to the default
// screen.
//
// The database writes these same values (see supabase/migrations/20260921141000_notification_
// outbox.sql), but the client MUST re-validate rather than trust the payload: a stored route is
// data, never a capability.
//
// Contract consumed by D4's useNotificationTaps(): `isAllowedRoute(route: unknown): route is string`.

/**
 * Exact routes a notification may open.
 *
 * Plain string hrefs, because typedRoutes is off in this project (see common conventions).
 * `/(tabs)` is the group root — Expo Router resolves it to the home tab.
 */
export const ALLOWED_STATIC_ROUTES = [
  '/(tabs)',
  '/(tabs)/index',
  '/(tabs)/workout',
  '/(tabs)/food',
  '/(tabs)/community',
  '/(tabs)/profile',
  '/community/live',
  '/calendar',
  '/effort',
  '/notes',
] as const;

const STATIC_ROUTES: ReadonlySet<string> = new Set(ALLOWED_STATIC_ROUTES);

/** RFC-4122-shaped id, the only dynamic segment any allowed route takes. */
const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

/**
 * Routes with a single id segment. Anchored, and the segment is a UUID rather than `[^/]+`: the
 * screens behind them look the id up directly, so accepting arbitrary text would let a payload
 * push junk into a query. This is also the exact bug class U2 is fixing in the screenshot
 * selectors (a name passed where a UUID belongs).
 */
export const ALLOWED_DYNAMIC_ROUTES: readonly RegExp[] = [
  new RegExp(`^/community/live/${UUID}$`),
  new RegExp(`^/notes/${UUID}$`),
  new RegExp(`^/\\(tabs\\)/workout/${UUID}$`),
];

/**
 * True when `route` is a destination a notification tap may navigate to.
 *
 * Rejects, in order: non-strings, anything with whitespace or control characters, absolute URLs
 * and scheme-ish strings (`http:`, `javascript:`, `dbf://`), protocol-relative `//host`, paths
 * carrying a query or fragment, `..` traversal, and finally anything not in the two lists above.
 *
 * Deliberately total and side-effect free: no navigation, no logging, no throwing — a caller can
 * use it as a guard in any context.
 */
export function isAllowedRoute(route: unknown): route is string {
  if (typeof route !== 'string') return false;

  // No trimming: a route that needs trimming did not come from us, and silently repairing input
  // is how an allowlist develops holes.
  if (route.length === 0 || route.length > 256) return false;
  if (/[\s\u0000-\u001f\u007f]/.test(route)) return false;

  // Must be an app-absolute path, and not protocol-relative (`//evil.example` is a URL to a
  // browser, and react-native-web's router would follow it).
  if (!route.startsWith('/') || route.startsWith('//')) return false;

  // A scheme can only appear before the first `/`, but check the whole string: `/x/javascript:y`
  // is not a route we issue, and a `:` in a path segment has no legitimate use here either.
  if (route.includes(':')) return false;
  if (route.includes('?') || route.includes('#')) return false;
  if (route.includes('..') || route.includes('\\')) return false;

  if (STATIC_ROUTES.has(route)) return true;
  return ALLOWED_DYNAMIC_ROUTES.some((pattern) => pattern.test(route));
}

/** The route a notification payload asks for, or null when it has none or asks for a rejected one. */
export function routeFromPayload(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const route = (payload as { route?: unknown }).route;
  return isAllowedRoute(route) ? route : null;
}

/**
 * Where a tap goes when the payload carries no usable route. Home rather than "do nothing": the
 * user tapped a notification and must land somewhere deliberate.
 */
export const FALLBACK_ROUTE = '/(tabs)';

/** The route to navigate to for this payload — always an allowed one. */
export function resolveTapRoute(payload: unknown): string {
  return routeFromPayload(payload) ?? FALLBACK_ROUTE;
}
