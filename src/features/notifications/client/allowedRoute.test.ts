/**
 * A push payload is attacker-influenced by the time it reaches the device, so
 * this allowlist is a security boundary, not a convenience. These tests are the
 * contract D3's real `routes.ts` must also satisfy when it replaces the stub.
 */

import { isAllowedRoute } from './allowedRoute';

const UUID = '88888888-8888-8888-8888-888888888888';

describe('isAllowedRoute — accepts real in-app destinations', () => {
  it.each([
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
  ])('allows the exact route %s', (route) => {
    expect(isAllowedRoute(route)).toBe(true);
  });

  it.each([
    `/community/live/${UUID}`,
    `/(tabs)/community/live/${UUID}`,
    `/(tabs)/workout/${UUID}`,
    `/notes/${UUID}`,
  ])('allows the parameterised route %s', (route) => {
    expect(isAllowedRoute(route)).toBe(true);
  });

  it('accepts an upper-case UUID', () => {
    expect(isAllowedRoute(`/community/live/${UUID.toUpperCase()}`)).toBe(true);
  });
});

describe('isAllowedRoute — rejects everything else', () => {
  it.each([
    ['an absolute http URL', 'https://evil.example/steal'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a protocol-relative host', '//evil.example/(tabs)'],
    ['a custom scheme', 'dbf://(tabs)'],
    ['a relative path', '(tabs)'],
    ['path traversal', '/(tabs)/../../etc/passwd'],
    ['a query string', '/calendar?next=https://evil.example'],
    ['a fragment', '/calendar#/../admin'],
    ['a backslash', '\\\\evil.example'],
    ['an unknown screen', '/admin/secrets'],
    ['a near-miss on a known route', '/calendarx'],
    ['a trailing slash on a known route', '/calendar/'],
    ['the empty string', ''],
  ])('rejects %s', (_label, route) => {
    expect(isAllowedRoute(route)).toBe(false);
  });

  it('rejects a parameterised route whose argument is not a UUID', () => {
    // The exact bug class this guards: a NAME passed where a UUID belongs.
    expect(isAllowedRoute('/community/live/Dana Reyes')).toBe(false);
    expect(isAllowedRoute('/community/live/123')).toBe(false);
    expect(isAllowedRoute(`/notes/${UUID}x`)).toBe(false);
  });

  it('rejects extra path segments after a valid UUID', () => {
    expect(isAllowedRoute(`/community/live/${UUID}/admin`)).toBe(false);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['an object', { route: '/calendar' }],
    ['an array', ['/calendar']],
    ['a boolean', true],
  ])('rejects the non-string %s', (_label, value) => {
    expect(isAllowedRoute(value)).toBe(false);
  });

  it('rejects an absurdly long string instead of running the regexes on it', () => {
    expect(isAllowedRoute(`/notes/${'a'.repeat(5000)}`)).toBe(false);
  });
});
