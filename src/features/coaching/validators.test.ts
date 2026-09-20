import {
  validateBio,
  validateCoachProfile,
  validateSpecialties,
} from './validators';

describe('validateBio', () => {
  it('accepts 500 and rejects 501 chars', () => {
    expect(validateBio('a'.repeat(500))).toBeNull();
    expect(validateBio('a'.repeat(501))).not.toBeNull();
  });
  it('ignores surrounding whitespace', () => {
    expect(validateBio(`  ${'a'.repeat(500)}  `)).toBeNull();
  });
  it('accepts empty', () => {
    expect(validateBio('')).toBeNull();
  });
  it('counts code points, not UTF-16 units', () => {
    expect(validateBio('😀'.repeat(500))).toBeNull();
    expect(validateBio('😀'.repeat(501))).not.toBeNull();
  });
});

describe('validateSpecialties', () => {
  it('trims, drops empties, dedupes case-insensitively', () => {
    const r = validateSpecialties(['  Yoga ', '', '   ', 'yoga', 'YOGA', 'HIIT']);
    expect(r.value).toEqual(['Yoga', 'HIIT']);
    expect(r.error).toBeNull();
  });
  it('allows 8 and rejects 9', () => {
    const eight = Array.from({ length: 8 }, (_, i) => `s${i}`);
    expect(validateSpecialties(eight).error).toBeNull();
    expect(validateSpecialties([...eight, 's8']).error).not.toBeNull();
  });
  it('duplicates do not count toward the max', () => {
    const items = [...Array.from({ length: 8 }, (_, i) => `s${i}`), 'S0', ' s1 '];
    expect(validateSpecialties(items).error).toBeNull();
  });
  it('allows 30 chars and rejects 31', () => {
    expect(validateSpecialties(['a'.repeat(30)]).error).toBeNull();
    expect(validateSpecialties(['a'.repeat(31)]).error).not.toBeNull();
  });
  it('measures length after trimming', () => {
    expect(validateSpecialties([` ${'a'.repeat(30)} `]).error).toBeNull();
  });
  it('handles unicode by code point', () => {
    expect(validateSpecialties(['😀'.repeat(30)]).error).toBeNull();
    expect(validateSpecialties(['😀'.repeat(31)]).error).not.toBeNull();
    expect(validateSpecialties(['Ünï', 'ünï']).value).toEqual(['Ünï']);
  });
});

describe('validateCoachProfile', () => {
  it('is ok for a valid profile and returns normalized values', () => {
    const r = validateCoachProfile({
      bio: '  hi  ',
      specialties: [' a ', 'A'],
      acceptingMembers: true,
    });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual({});
    expect(r.value).toEqual({ bio: 'hi', specialties: ['a'], acceptingMembers: true });
  });
  it('reports field errors', () => {
    const r = validateCoachProfile({
      bio: 'a'.repeat(501),
      specialties: Array.from({ length: 9 }, (_, i) => `s${i}`),
      acceptingMembers: false,
    });
    expect(r.ok).toBe(false);
    expect(r.errors.bio).toBeDefined();
    expect(r.errors.specialties).toBeDefined();
  });
});
