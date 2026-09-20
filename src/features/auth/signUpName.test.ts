import {
  FULL_NAME_MAX_LENGTH,
  GENERIC_SIGN_UP_ERROR_MESSAGE,
  NAME_TOO_LONG_MESSAGE,
  describeSignUpError,
  isNameTooLongError,
  normalizeFullName,
} from './signUpName';

describe('normalizeFullName', () => {
  it('matches the profiles_text_bounds upper bound', () => {
    expect(FULL_NAME_MAX_LENGTH).toBe(120);
  });

  it('trims like btrim() and leaves a short name untouched', () => {
    expect(normalizeFullName('  Jordan Lee  ')).toBe('Jordan Lee');
    expect(normalizeFullName('Jordan Lee')).toBe('Jordan Lee');
  });

  it('truncates the 130-character name that used to 400 with 23514', () => {
    // The exact input from the reproduction: 'Alexandra ' x13 === 130 characters.
    const typed = 'Alexandra '.repeat(13);
    expect(typed.trim().length).toBe(129);

    const submitted = normalizeFullName(typed);
    expect(submitted.length).toBe(FULL_NAME_MAX_LENGTH);
    expect(typed.startsWith(submitted)).toBe(true);
  });

  it('never emits more characters than Postgres length() allows', () => {
    expect(normalizeFullName('x'.repeat(500)).length).toBe(FULL_NAME_MAX_LENGTH);
  });

  it('counts code points, so an emoji name is not cut into a lone surrogate', () => {
    // Each astral emoji is 2 UTF-16 code units but 1 Postgres character.
    const typed = '🏋'.repeat(200);
    const submitted = normalizeFullName(typed);

    expect(Array.from(submitted)).toHaveLength(FULL_NAME_MAX_LENGTH);
    // A split surrogate pair would leave an unpaired code unit here.
    expect(submitted).toBe('🏋'.repeat(FULL_NAME_MAX_LENGTH));
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(submitted)).toBe(false);
  });

  it('yields an empty string for a whitespace-only name (submit stays disabled)', () => {
    expect(normalizeFullName('   ')).toBe('');
  });
});

describe('isNameTooLongError', () => {
  it('recognises the PostgREST 23514 payload', () => {
    expect(
      isNameTooLongError({
        code: '23514',
        message: 'new row for relation "profiles" violates check constraint "profiles_text_bounds"',
      }),
    ).toBe(true);
  });

  it('recognises the constraint name without a machine code', () => {
    expect(isNameTooLongError(new Error('… constraint "profiles_text_bounds"'))).toBe(true);
  });

  it('is false for unrelated errors', () => {
    expect(isNameTooLongError({ code: '23505', message: 'duplicate key value' })).toBe(false);
    expect(isNameTooLongError(null)).toBe(false);
  });
});

describe('describeSignUpError', () => {
  it('maps the check violation to member-facing copy', () => {
    expect(
      describeSignUpError({
        code: '23514',
        message: 'new row for relation "profiles" violates check constraint "profiles_text_bounds"',
      }),
    ).toBe(NAME_TOO_LONG_MESSAGE);
  });

  it('never leaks raw Postgres text', () => {
    const leaky = [
      { code: '42501', message: 'new row violates row-level security policy for table "profiles"' },
      { code: '23505', message: 'duplicate key value violates unique constraint "profiles_pkey"' },
      { message: 'new row for relation "profiles" violates check constraint "whatever"' },
    ];

    for (const error of leaky) {
      const copy = describeSignUpError(error);
      expect(copy).toBe(GENERIC_SIGN_UP_ERROR_MESSAGE);
      expect(copy).not.toMatch(/relation|constraint|row-level/i);
    }
  });

  it('passes GoTrue’s own human-written messages through', () => {
    expect(describeSignUpError({ message: 'User already registered' })).toBe(
      'User already registered',
    );
    expect(describeSignUpError(new Error('Password should be at least 6 characters'))).toBe(
      'Password should be at least 6 characters',
    );
  });

  it('falls back to generic copy for null, empty and malformed errors', () => {
    expect(describeSignUpError(null)).toBe(GENERIC_SIGN_UP_ERROR_MESSAGE);
    expect(describeSignUpError(undefined)).toBe(GENERIC_SIGN_UP_ERROR_MESSAGE);
    expect(describeSignUpError({})).toBe(GENERIC_SIGN_UP_ERROR_MESSAGE);
    expect(describeSignUpError({ message: '' })).toBe(GENERIC_SIGN_UP_ERROR_MESSAGE);
  });
});
