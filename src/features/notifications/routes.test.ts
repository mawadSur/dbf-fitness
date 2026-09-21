import {
  ALLOWED_STATIC_ROUTES,
  FALLBACK_ROUTE,
  isAllowedRoute,
  resolveTapRoute,
  routeFromPayload,
} from './routes';

const CLASS_ID = '88888888-8888-4888-8888-888888888888';

describe('isAllowedRoute', () => {
  it.each(ALLOWED_STATIC_ROUTES)('accepts the static route %s', (route) => {
    expect(isAllowedRoute(route)).toBe(true);
  });

  it('accepts the dynamic routes the database enqueues', () => {
    expect(isAllowedRoute(`/community/live/${CLASS_ID}`)).toBe(true);
    expect(isAllowedRoute(`/notes/${CLASS_ID}`)).toBe(true);
    expect(isAllowedRoute(`/(tabs)/workout/${CLASS_ID}`)).toBe(true);
  });

  it('requires a UUID in the dynamic segment, not arbitrary text', () => {
    // The exact shape of the bug that shipped elsewhere: a name where an id belongs.
    expect(isAllowedRoute('/community/live/dana-reyes')).toBe(false);
    expect(isAllowedRoute('/community/live/1')).toBe(false);
    expect(isAllowedRoute(`/community/live/${CLASS_ID}extra`)).toBe(false);
    expect(isAllowedRoute(`/community/live/${CLASS_ID}/join`)).toBe(false);
  });

  it.each([
    ['a non-string', 42],
    ['null', null],
    ['undefined', undefined],
    ['an object', { route: '/calendar' }],
    ['an array', ['/calendar']],
  ])('rejects %s', (_label, value) => {
    expect(isAllowedRoute(value)).toBe(false);
  });

  it.each([
    ['an absolute http URL', 'http://evil.example/steal'],
    ['an https URL', 'https://evil.example/steal'],
    ['a javascript: payload', 'javascript:alert(1)'],
    ['a path-embedded scheme', '/(tabs)/javascript:alert(1)'],
    ['a custom app scheme', 'dbf://community/live'],
    ['a protocol-relative URL', '//evil.example/calendar'],
    ['a relative path', 'calendar'],
    ['traversal', '/(tabs)/../../etc/passwd'],
    ['a backslash path', '\\(tabs)'],
    ['a query string', '/calendar?next=http://evil.example'],
    ['a fragment', '/calendar#/evil'],
    ['the empty string', ''],
    ['whitespace padding', ' /calendar '],
    ['an embedded newline', '/calendar\n/effort'],
    ['a NUL byte', '/calendar\u0000'],
  ])('rejects %s', (_label, value) => {
    expect(isAllowedRoute(value)).toBe(false);
  });

  it('rejects an unlisted app route', () => {
    // A real screen in the app that notifications have no business deep-linking into.
    expect(isAllowedRoute('/dev/gallery')).toBe(false);
    expect(isAllowedRoute('/coach/pick')).toBe(false);
    expect(isAllowedRoute('/(auth)/sign-in')).toBe(false);
  });

  it('rejects an over-long route', () => {
    expect(isAllowedRoute(`/community/live/${'a'.repeat(300)}`)).toBe(false);
  });
});

describe('routeFromPayload', () => {
  it('returns the route the outbox stored for a nudge', () => {
    expect(routeFromPayload({ route: '/(tabs)', nudgeId: CLASS_ID })).toBe('/(tabs)');
  });

  it('returns the live-class route the reminder enqueues', () => {
    expect(routeFromPayload({ route: `/community/live/${CLASS_ID}`, liveClassId: CLASS_ID })).toBe(
      `/community/live/${CLASS_ID}`
    );
  });

  it('returns null for a payload with no route, a bad route, or no payload', () => {
    expect(routeFromPayload({ liveClassId: CLASS_ID })).toBeNull();
    expect(routeFromPayload({ route: 'https://evil.example' })).toBeNull();
    expect(routeFromPayload(null)).toBeNull();
    expect(routeFromPayload(undefined)).toBeNull();
    expect(routeFromPayload('/calendar')).toBeNull();
  });
});

describe('resolveTapRoute', () => {
  it('falls back to home rather than refusing to navigate', () => {
    expect(resolveTapRoute({ route: 'javascript:alert(1)' })).toBe(FALLBACK_ROUTE);
    expect(resolveTapRoute({})).toBe(FALLBACK_ROUTE);
    expect(isAllowedRoute(resolveTapRoute({ route: '//evil.example' }))).toBe(true);
  });

  it('uses the payload route when it is allowed', () => {
    expect(resolveTapRoute({ route: '/effort' })).toBe('/effort');
  });
});
