import { canManageClass, coachActionsFor, isClassOwner, uploadRecordingHref } from './coachActions';

describe('coach actions', () => {
  it('offers the right controls per status', () => {
    expect(coachActionsFor('scheduled')).toEqual(['start', 'cancel']);
    expect(coachActionsFor('live')).toEqual(['end', 'cancel']);
    expect(coachActionsFor('ended')).toEqual([]);
    expect(coachActionsFor('cancelled')).toEqual([]);
  });
  it('recognises only the owning coach', () => {
    expect(isClassOwner('a', 'a')).toBe(true);
    expect(isClassOwner('a', 'b')).toBe(false);
    expect(isClassOwner(null, 'b')).toBe(false);
  });
  it('builds the upload link', () => {
    expect(uploadRecordingHref('abc')).toBe('/notes/upload?classId=abc');
  });
});

describe('canManageClass', () => {
  it('requires ownership and a staff role', () => {
    expect(canManageClass({ id: 'a', role: 'coach' }, 'a')).toBe(true);
    expect(canManageClass({ id: 'a', role: 'admin' }, 'a')).toBe(true);
    expect(canManageClass({ id: 'a', role: 'member' }, 'a')).toBe(false);
    expect(canManageClass({ id: 'a', role: 'coach' }, 'b')).toBe(false);
    expect(canManageClass(null, 'a')).toBe(false);
  });
});
