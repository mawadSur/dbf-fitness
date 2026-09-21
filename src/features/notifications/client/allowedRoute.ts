/**
 * TEMPORARY STUB — replace with D3's `src/features/notifications/routes.ts`.
 *
 * The D3 lane owns the canonical route allowlist; it lands in a parallel
 * branch. This file exists only so the tap handler can ship and be tested in
 * this branch, and it implements the agreed contract EXACTLY:
 *
 *   isAllowedRoute(route: unknown): route is string
 *
 * At merge time the integrator deletes this file and points
 * `useNotificationTaps` at `../routes`. Nothing else imports it.
 *
 * Why an allowlist at all: a push payload is attacker-influenced input by the
 * time it reaches the device. `router.push(payload.route)` with an arbitrary
 * string is an open redirect into any screen of the app (and on web, into
 * `javascript:`/`//host` targets). Only these shapes navigate.
 */

/** Exact routes that a notification may deep-link to. */
const EXACT_ROUTES = new Set([
  '/(tabs)',
  '/(tabs)/index',
  '/(tabs)/food',
  '/(tabs)/profile',
  '/(tabs)/community',
  '/(tabs)/workout',
  '/calendar',
  '/effort',
  '/effort-review',
  '/notes',
]);

/** Parameterised routes: one UUID segment, nothing else. */
const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const PARAMETERISED_ROUTES = [
  new RegExp(`^/community/live/${UUID}$`),
  new RegExp(`^/\\(tabs\\)/community/live/${UUID}$`),
  new RegExp(`^/\\(tabs\\)/workout/${UUID}$`),
  new RegExp(`^/notes/${UUID}$`),
];

export function isAllowedRoute(route: unknown): route is string {
  if (typeof route !== 'string' || route.length === 0 || route.length > 200) return false;
  // Reject anything that is not a plain in-app path before matching: no scheme,
  // no protocol-relative host, no query/fragment smuggling, no traversal.
  if (!route.startsWith('/')) return false;
  if (route.startsWith('//')) return false;
  if (route.includes('..') || route.includes('?') || route.includes('#') || route.includes('\\')) return false;

  if (EXACT_ROUTES.has(route)) return true;
  return PARAMETERISED_ROUTES.some((pattern) => pattern.test(route));
}
