import {
  checkContent,
  fold,
  MAX_LENGTH,
  validateContent,
  type ContentField,
} from './contentFilter';
import { OBJECTIONABLE_WORDS } from './objectionableWords';

const ok = (value: string, field: ContentField = 'displayName') =>
  checkContent(value, field).ok;

describe('fold', () => {
  it('strips diacritics so an accented slur is still caught', () => {
    expect(fold('Fûck')).toBe('fuck');
  });

  it('maps leet digits back to letters', () => {
    expect(fold('sh1t')).toBe('shit');
    expect(fold('f4ggot')).toBe('faggot');
  });

  it('turns separators into spaces so f.u.c.k survives as tokens', () => {
    expect(fold('f.u.c.k')).toBe('f u c k');
  });

  it('collapses trebled letters but keeps ordinary doubles', () => {
    expect(fold('fuuuuck')).toBe('fuck');
    expect(fold('bball')).toBe('bball');
  });

  it('is locale-neutral: uppercase I folds the same way regardless of Turkish rules', () => {
    // toLocaleLowerCase('tr') would give 'ı' here and break matching on Turkish devices.
    expect(fold('SHIT')).toBe('shit');
  });
});

describe('checkContent — rejects objectionable text', () => {
  it('rejects a plain slur in a display name', () => {
    expect(ok('faggot')).toBe(false);
  });

  it('rejects a slur embedded in a longer name', () => {
    expect(ok('big fuck energy')).toBe(false);
  });

  it('rejects leet obfuscation', () => {
    expect(ok('sh1t coach')).toBe(false);
  });

  it('rejects a doubled-letter variant', () => {
    expect(ok('shiit')).toBe(false);
  });

  it('names the matched word so the error can quote it', () => {
    const result = checkContent('porn', 'classTitle');
    expect(result).toEqual({ ok: false, reason: 'objectionable', match: 'porn' });
  });

  it('rejects in every field, not just names', () => {
    expect(ok('cunt', 'bio')).toBe(false);
    expect(ok('cunt', 'classTitle')).toBe(false);
  });
});

describe('checkContent — false positives are the real risk', () => {
  // Every one of these is a legitimate value a member could enter. A filter that blocks a
  // person's actual name is worse than one that misses a slur, because the member cannot
  // sign up at all.
  const legitimate = [
    'Cassandra',
    'Scunthorpe',
    'Penistone',
    'Cumbria',
    'Cockburn',
    'Dana Ahmed',
    'Jordan',
    'Sam O’Neill',
    'Riley Park',
    'Mohammed Al-Rashid',
    'Anne-Marie',
    'José García',
    'Ahmed عوض',
    'Coach Bob — Morning Crew',
    'HIIT & Core 45',
    'Assisted pull-ups clinic',
    'Grass roots running club',
    'Shiatsu recovery session',
    'Class: Upper body, 6am',
  ];

  it.each(legitimate)('accepts %s', (value) => {
    expect(ok(value)).toBe(true);
    expect(ok(value, 'classTitle')).toBe(true);
  });

  it('accepts health and fitness vocabulary that a prudish list would block', () => {
    for (const value of ['Chest and breast cancer recovery', 'Sex-specific training', 'Analysis of your split']) {
      expect(ok(value, 'bio')).toBe(true);
    }
  });
});

describe('checkContent — length and emptiness', () => {
  it('rejects an empty or whitespace-only value', () => {
    expect(checkContent('   ', 'displayName')).toEqual({ ok: false, reason: 'empty' });
  });

  it('rejects a value over the field cap', () => {
    const long = 'a'.repeat(MAX_LENGTH.displayName + 1);
    expect(checkContent(long, 'displayName')).toEqual({
      ok: false,
      reason: 'too_long',
      max: MAX_LENGTH.displayName,
    });
  });

  it('accepts a value exactly at the cap', () => {
    expect(ok('a'.repeat(MAX_LENGTH.displayName))).toBe(true);
  });

  it('applies the right cap per field', () => {
    const value = 'a'.repeat(130);
    expect(ok(value, 'displayName')).toBe(false);
    expect(ok(value, 'classTitle')).toBe(false);
    expect(ok(value, 'bio')).toBe(true);
  });
});

describe('validateContent — the message shown inline', () => {
  it('returns null when the value is fine', () => {
    expect(validateContent('Dana', 'displayName')).toBeNull();
  });

  it('never returns an empty string for a rejected value (never silent)', () => {
    for (const [value, field] of [
      ['', 'displayName'],
      ['fuck', 'displayName'],
      ['a'.repeat(200), 'classTitle'],
    ] as [string, ContentField][]) {
      const message = validateContent(value, field);
      expect(typeof message).toBe('string');
      expect((message ?? '').length).toBeGreaterThan(10);
    }
  });

  it('names the field so the member knows which input to fix', () => {
    expect(validateContent('porn', 'classTitle')).toContain('class title');
    expect(validateContent('porn', 'bio')).toContain('bio');
  });
});

describe('the word list itself', () => {
  it('has no entry shorter than three characters (short tokens are all false positives)', () => {
    for (const word of OBJECTIONABLE_WORDS) {
      expect(word.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('is lowercase and free of separators, which is what fold() produces', () => {
    for (const word of OBJECTIONABLE_WORDS) {
      expect(word).toBe(word.toLowerCase());
      expect(word).toMatch(/^\p{L}+$/u);
    }
  });

  it('catches every listed word when entered on its own', () => {
    for (const word of OBJECTIONABLE_WORDS) {
      expect(checkContent(word, 'classTitle').ok).toBe(false);
    }
  });
});
