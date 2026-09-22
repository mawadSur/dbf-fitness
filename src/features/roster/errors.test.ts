import { ROSTER_FALLBACK, isRosterGateError, rosterErrorMessage } from './errors';

describe('rosterErrorMessage', () => {
  it('maps each identifier the roster RPCs raise', () => {
    expect(rosterErrorMessage({ message: 'not_entitled' }, ROSTER_FALLBACK)).toMatch(
      /coach or an admin/,
    );
    expect(rosterErrorMessage({ message: 'member_not_found' }, ROSTER_FALLBACK)).toMatch(
      /no longer exists/,
    );
    expect(rosterErrorMessage({ message: 'snooze_too_long' }, ROSTER_FALLBACK)).toMatch(
      /at most 14 days/,
    );
  });

  it('prefers the longest match, so member_has_no_coach never reads as member_not_found', () => {
    expect(rosterErrorMessage({ message: 'member_has_no_coach' }, ROSTER_FALLBACK)).toMatch(
      /has no coach yet/,
    );
  });

  it('matches an identifier PostgREST wrapped in its own prose', () => {
    expect(
      rosterErrorMessage({ message: 'error returned from rpc: not_entitled' }, ROSTER_FALLBACK),
    ).toMatch(/coach or an admin/);
  });

  it('falls through to friendlyErrorMessage for anything unrecognised', () => {
    expect(rosterErrorMessage(new Error('Network request failed'), ROSTER_FALLBACK)).toMatch(
      /Can't reach the server/,
    );
    expect(rosterErrorMessage({ message: 'some new server error' }, ROSTER_FALLBACK)).toBe(
      ROSTER_FALLBACK,
    );
    expect(rosterErrorMessage(null, ROSTER_FALLBACK)).toBe(ROSTER_FALLBACK);
  });

  it('never renders raw SQL text at a coach', () => {
    const raw = 'duplicate key value violates unique constraint "attention_snoozes_pkey"';
    expect(rosterErrorMessage({ message: raw }, ROSTER_FALLBACK)).not.toContain('unique constraint');
  });
});

describe('isRosterGateError', () => {
  it('is true only for the authorization gate', () => {
    expect(isRosterGateError({ message: 'not_entitled' })).toBe(true);
    expect(isRosterGateError({ message: 'snooze_too_long' })).toBe(false);
    expect(isRosterGateError(new Error('Network request failed'))).toBe(false);
  });
});
