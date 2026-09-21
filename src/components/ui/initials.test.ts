import { HONORIFICS, initialsOf } from './initials';

describe('initialsOf', () => {
  it('uses the first and last word', () => {
    expect(initialsOf('Jordan Lee')).toBe('JL');
    expect(initialsOf('Mary Jane Watson')).toBe('MW');
  });

  it('handles single names, lowercase and extra whitespace', () => {
    expect(initialsOf('sam')).toBe('S');
    expect(initialsOf('  alex   kim ')).toBe('AK');
  });

  it('falls back to a placeholder for an empty name', () => {
    expect(initialsOf('')).toBe('?');
    expect(initialsOf('   ')).toBe('?');
  });

  it('handles non-ASCII names one CODE POINT at a time', () => {
    expect(initialsOf('Émile Zola')).toBe('ÉZ');
    expect(initialsOf('  dana')).toBe('D');
  });

  /**
   * The defect this rule exists for: every seeded coach display name starts
   * with "Coach", so a first-letter avatar drew "C" for all of them.
   */
  it('drops a leading honorific so coaches do not all read "C"', () => {
    expect(initialsOf('Coach Dana Reyes')).toBe('DR');
    expect(initialsOf('Coach Marcus Bell')).toBe('MB');
    expect(initialsOf('Dr. Alex Kim')).toBe('AK');
    expect(initialsOf('coach sam')).toBe('S');
  });

  it('never strips the only word it has', () => {
    expect(initialsOf('Coach')).toBe('C');
    expect(initialsOf('  Dr.  ')).toBe('D');
  });

  it('only strips LEADING honorifics', () => {
    // A surname that happens to collide with a title stays part of the name.
    expect(initialsOf('Jordan Coach')).toBe('JC');
  });

  it('matches honorifics case-insensitively and without trailing punctuation', () => {
    for (const title of HONORIFICS) {
      expect(initialsOf(`${title.toUpperCase()}. Riley Park`)).toBe('RP');
    }
  });
});
