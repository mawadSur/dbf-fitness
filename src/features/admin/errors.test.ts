import { adminErrorMessage, isAdminGateError } from './errors';

describe('adminErrorMessage', () => {
  it.each([
    ['admin_required', 'Only an admin can do this.'],
    ['mfa_required', 'Confirm your authenticator code first, then try again.'],
    ['accused_cannot_review', 'You cannot resolve a report that was filed about you.'],
    ['subscription_not_found', 'That member has no subscription yet, so there is nothing to cancel.'],
  ])('maps %s to admin-facing copy', (code, expected) => {
    expect(adminErrorMessage({ code: '42501', message: code }, 'fallback')).toBe(expected);
  });

  it('recognises the identifier inside a longer transport message', () => {
    const error = { message: 'failed to execute rpc: period_backwards' };
    expect(adminErrorMessage(error, 'fallback')).toMatch(/earlier than the current period end/);
  });

  it('never leaks raw SQL text for an unknown server error', () => {
    const error = { code: 'XX000', message: 'relation "public.secret" does not exist' };
    expect(adminErrorMessage(error, 'Could not save the payment.')).toBe(
      'Could not save the payment.',
    );
  });

  it('still classifies transport failures through friendlyErrorMessage', () => {
    expect(adminErrorMessage(new Error('Failed to fetch'), 'fallback')).toMatch(
      /Check your connection/,
    );
  });

  it('falls back for a non-object error', () => {
    expect(adminErrorMessage(null, 'fallback')).toBe('fallback');
  });

  // Regression: several identifiers are substrings of others. Resolving by
  // insertion order returned the SHORTER, wrong code ('invalid_status' for an
  // 'invalid_status_filter' refusal), so the admin read moderation copy for a
  // bad filter argument.
  it('prefers the longest matching code when one identifier prefixes another', () => {
    expect(adminErrorMessage({ message: 'invalid_status_filter' }, 'fallback')).toBe(
      'That report filter is not valid.',
    );
    expect(adminErrorMessage({ message: 'invalid_status' }, 'fallback')).toBe(
      'Pick one of: reviewed, dismissed, actioned.',
    );
    expect(adminErrorMessage({ message: 'group_and_member_required' }, 'fallback')).toBe(
      'Choose a group and a member.',
    );
    expect(adminErrorMessage({ message: 'member_required' }, 'fallback')).toBe('Choose a member.');
  });

  it('still resolves a code the transport prefixed', () => {
    expect(
      adminErrorMessage({ message: 'error returned from database: invalid_status_filter' }, 'fb'),
    ).toBe('That report filter is not valid.');
  });
});

describe('isAdminGateError', () => {
  it('is true for the two gate refusals only', () => {
    expect(isAdminGateError({ message: 'admin_required' })).toBe(true);
    expect(isAdminGateError({ message: 'mfa_required' })).toBe(true);
    expect(isAdminGateError({ message: 'period_backwards' })).toBe(false);
    expect(isAdminGateError(new Error('boom'))).toBe(false);
  });
});
