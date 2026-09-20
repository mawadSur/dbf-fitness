import { classifyError, friendlyErrorFromMany, friendlyErrorMessage } from './friendlyError';

describe('friendlyErrorMessage', () => {
  it.each([
    [new TypeError('Network request failed'), /can't reach the server/i],
    [new Error('Failed to fetch'), /can't reach the server/i],
    [new Error('JWT expired'), /not signed in/i],
    [{ message: 'permission denied for table x', code: '42501' }, /don't have access/i],
    [new Error('new row violates row-level security policy'), /don't have access/i],
  ])('maps %p', (err, re) => {
    expect(friendlyErrorMessage(err, 'Generic.')).toMatch(re);
  });

  it('uses the fallback for unknown errors and never leaks raw text', () => {
    const raw = 'relation "public.secret_table" does not exist';
    const out = friendlyErrorMessage(new Error(raw), 'Could not load this.');
    expect(out).toBe('Could not load this.');
    expect(out).not.toContain('secret_table');
    expect(friendlyErrorMessage(undefined, 'Fallback.')).toBe('Fallback.');
  });

  it('classifies plain objects and strings', () => {
    expect(classifyError('timeout')).toBe('network');
    expect(classifyError({ code: '42501' })).toBe('forbidden');
    expect(classifyError(null)).toBe('generic');
  });

  it('does not treat "rls" inside another word as forbidden', () => {
    expect(classifyError(new Error('could not parse urls'))).toBe('generic');
    expect(classifyError(new Error('invalid urls in response'))).toBe('generic');
    expect(classifyError(new Error('new row violates RLS policy'))).toBe('forbidden');
  });
});

describe('friendlyErrorFromMany', () => {
  const NETWORK = new TypeError('Network request failed');
  const AUTH = new Error('JWT expired');
  const FORBIDDEN = { message: 'permission denied for table x', code: '42501' };
  const OTHER = new Error('relation "public.secret" does not exist');

  it('returns the fallback when there are no errors (mutant: pick[0] of empty crashes / returns a fixed string)', () => {
    expect(friendlyErrorFromMany([], 'Fallback.')).toBe('Fallback.');
    expect(friendlyErrorFromMany([null, undefined], 'Fallback.')).toBe('Fallback.');
  });

  it('prefers an auth error over network and forbidden ones (mutant: drop the auth find)', () => {
    expect(friendlyErrorFromMany([NETWORK, FORBIDDEN, AUTH], 'F.')).toMatch(/not signed in/i);
  });

  it('prefers forbidden over network and generic when there is no auth error (mutant: drop the forbidden find)', () => {
    expect(friendlyErrorFromMany([NETWORK, OTHER, FORBIDDEN], 'F.')).toMatch(/don't have access/i);
  });

  it('otherwise uses the FIRST present error, skipping nulls (mutant: take the last / do not filter nulls)', () => {
    expect(friendlyErrorFromMany([null, NETWORK, OTHER], 'F.')).toMatch(/can't reach the server/i);
    expect(friendlyErrorFromMany([undefined, OTHER, NETWORK], 'F.')).toBe('F.');
  });

  it('never leaks raw text', () => {
    expect(friendlyErrorFromMany([OTHER], 'Could not load.')).not.toContain('secret');
  });
});
