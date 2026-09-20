import {
  CONFIRM_WORD,
  DELETED_MESSAGE,
  STORE_SUBSCRIPTION_NOTE,
  canSubmit,
  deleteAccountErrorMessage,
  deletionConsequences,
  isConfirmed,
  isRetryable,
} from './deleteAccount';
import { CONFIRM_WORD as EDGE_CONFIRM_WORD } from '../../../supabase/functions/delete-account/logic';
import type { DeleteAccountErrorCode } from './api';

describe('isConfirmed', () => {
  it('accepts the exact word, with surrounding whitespace forgiven', () => {
    expect(isConfirmed('DELETE')).toBe(true);
    expect(isConfirmed('  DELETE ')).toBe(true);
    expect(isConfirmed('\nDELETE\t')).toBe(true);
  });

  it.each(['', ' ', 'delete', 'Delete', 'DELET', 'DELETEE', 'DEL ETE', 'REMOVE'])(
    'rejects %p',
    (typed) => {
      expect(isConfirmed(typed)).toBe(false);
    }
  );

  it('uses the same word the Edge Function enforces', () => {
    expect(CONFIRM_WORD).toBe(EDGE_CONFIRM_WORD);
  });
});

describe('canSubmit', () => {
  it('needs the confirmation AND a password AND no request in flight', () => {
    expect(canSubmit({ confirmText: 'DELETE', password: 'pw', busy: false })).toBe(true);
  });

  it.each([
    ['no confirmation', { confirmText: '', password: 'pw', busy: false }],
    ['a wrong confirmation', { confirmText: 'delete', password: 'pw', busy: false }],
    ['no password', { confirmText: 'DELETE', password: '', busy: false }],
    ['a request in flight', { confirmText: 'DELETE', password: 'pw', busy: true }],
  ])('refuses with %s', (_label, input) => {
    expect(canSubmit(input)).toBe(false);
  });
});

describe('deletionConsequences', () => {
  it('tells a member what of theirs is erased, and never mentions members of their own', () => {
    const lines = deletionConsequences('member', null).join(' ');
    expect(lines).toMatch(/progress/i);
    expect(lines).toMatch(/check-ins/i);
    expect(lines).toMatch(/notes progress/i);
    expect(lines).toMatch(/coach relationship is removed/i);
    expect(lines).not.toMatch(/will lose access to your classes/i);
  });

  it('gives a coach the exact member count', () => {
    expect(deletionConsequences('coach', 4)[0]).toMatch(/^4 members will lose access to your classes and notes/);
  });

  it('says "1 member" in the singular', () => {
    expect(deletionConsequences('coach', 1)[0]).toMatch(/^1 member will lose access/);
  });

  it('says "0 members" when the coach really has none', () => {
    expect(deletionConsequences('coach', 0)[0]).toMatch(/^0 members will lose access/);
  });

  it('falls back to a generic sentence rather than guessing a number', () => {
    expect(deletionConsequences('coach', null)[0]).toMatch(/^Your members will lose access/);
  });

  it('tells a coach their classes, recordings and notes go too', () => {
    const lines = deletionConsequences('coach', 2).join(' ');
    expect(lines).toMatch(/live classes/i);
    expect(lines).toMatch(/recordings/i);
    expect(lines).toMatch(/workout notes/i);
  });

  it('treats an admin like staff (the server still refuses the delete)', () => {
    expect(deletionConsequences('admin', 3)).toEqual(deletionConsequences('coach', 3));
  });

  // Regression (review 2026-09-20): the panel described the consequence for members as losing
  // "access", while workout_plans.coach_id / diet_plans.coach_id are ON DELETE CASCADE — the
  // members' own logged workouts and diet check-ins on this coach's plans are destroyed. The
  // undisclosed half of the delete is the half the coach cannot undo for anyone else.
  it('warns a coach that their members lose their OWN logged history, not just access', () => {
    const lines = deletionConsequences('coach', 4).join(' ');
    expect(lines).toMatch(/workout and diet plans you wrote for them/i);
    expect(lines).toMatch(/workouts they logged/i);
    expect(lines).toMatch(/diet check-ins/i);
    expect(lines).toMatch(/notes progress/i);
    expect(lines).toMatch(/cannot be recovered/i);
  });

  it('phrases the history warning for a single member in the singular', () => {
    expect(deletionConsequences('coach', 1)[1]).toMatch(/^That member also loses the workout and diet plans/);
  });

  it('still warns when the member count could not be read (null is not zero)', () => {
    expect(deletionConsequences('coach', null)[1]).toMatch(/^They also lose the workout and diet plans/);
  });

  it('drops the history warning only for a confirmed zero members', () => {
    const lines = deletionConsequences('coach', 0);
    expect(lines.join(' ')).not.toMatch(/workout and diet plans you wrote/i);
    expect(lines).toHaveLength(4);
  });

  it('says plainly that groups a coach created and their memberships are removed', () => {
    for (const count of [0, 1, 5, null]) {
      const lines = deletionConsequences('coach', count).join(' ');
      expect(lines).toMatch(/groups you created are deleted/i);
      expect(lines).toMatch(/every membership/i);
      expect(lines).toMatch(/other coaches/i);
    }
    expect(deletionConsequences('member', null).join(' ')).not.toMatch(/groups you created/i);
  });

  it('never tells a member that someone else loses history', () => {
    expect(deletionConsequences('member', null).join(' ')).not.toMatch(/you wrote for them/i);
  });
});

describe('STORE_SUBSCRIPTION_NOTE', () => {
  it('says plainly that deletion does not cancel store billing', () => {
    expect(STORE_SUBSCRIPTION_NOTE).toMatch(/does not cancel/i);
    expect(STORE_SUBSCRIPTION_NOTE).toMatch(/App Store/);
    expect(STORE_SUBSCRIPTION_NOTE).toMatch(/Google Play/);
  });
});

describe('deleteAccountErrorMessage', () => {
  const codes: DeleteAccountErrorCode[] = [
    'invalid_password',
    'confirm_required',
    'admin_managed_by_operator',
    'unauthorized',
    'payload_too_large',
    'storage_cleanup_failed',
    'network',
    'unknown',
  ];

  it('has distinct, non-empty, code-free copy for every code', () => {
    const messages = codes.map(deleteAccountErrorMessage);
    expect(new Set(messages).size).toBe(codes.length);
    for (const message of messages) {
      expect(message.length).toBeGreaterThan(10);
      expect(message).not.toMatch(/_/);
    }
  });

  it('maps each code to the right explanation', () => {
    expect(deleteAccountErrorMessage('invalid_password')).toMatch(/password is not right/i);
    expect(deleteAccountErrorMessage('confirm_required')).toMatch(/Type DELETE/);
    expect(deleteAccountErrorMessage('admin_managed_by_operator')).toMatch(/operator/i);
    expect(deleteAccountErrorMessage('unauthorized')).toMatch(/session expired/i);
    expect(deleteAccountErrorMessage('network')).toMatch(/connection/i);
  });

  // Regression (review 2026-09-20): both of these used to fall through to the generic
  // "Try again in a moment", which is wrong advice for either one.
  it('does not fall back to the generic retry copy for the other Edge Function refusals', () => {
    const generic = deleteAccountErrorMessage('unknown');
    expect(deleteAccountErrorMessage('payload_too_large')).not.toBe(generic);
    expect(deleteAccountErrorMessage('storage_cleanup_failed')).not.toBe(generic);
  });

  it('tells the user what to do about a too-large body and a storage failure', () => {
    expect(deleteAccountErrorMessage('payload_too_large')).toMatch(/too long/i);
    expect(deleteAccountErrorMessage('storage_cleanup_failed')).toMatch(/not deleted/i);
    expect(deleteAccountErrorMessage('storage_cleanup_failed')).toMatch(/support/i);
  });
});

describe('isRetryable', () => {
  it('lets the user retry a wrong password or a flaky network', () => {
    expect(isRetryable('invalid_password')).toBe(true);
    expect(isRetryable('network')).toBe(true);
    expect(isRetryable('confirm_required')).toBe(true);
    expect(isRetryable('unknown')).toBe(true);
  });

  it('does not offer a retry that can never succeed', () => {
    expect(isRetryable('admin_managed_by_operator')).toBe(false);
    expect(isRetryable('unauthorized')).toBe(false);
    // The body is rebuilt from the same password, so a retry produces the same 413.
    expect(isRetryable('payload_too_large')).toBe(false);
  });

  it('keeps the storage failure retryable: it is transient and the account still exists', () => {
    expect(isRetryable('storage_cleanup_failed')).toBe(true);
  });
});

describe('DELETED_MESSAGE', () => {
  it('is the confirmation the user sees after a successful delete', () => {
    expect(DELETED_MESSAGE).toBe('Your account was deleted');
  });
});
