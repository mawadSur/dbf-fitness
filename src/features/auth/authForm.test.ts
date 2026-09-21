import {
  PASSWORD_MIN_LENGTH,
  SIGN_IN_GENERIC_ERROR,
  describeSignInError,
  errorBannerTitle,
  isFormValid,
  touchedAfterSubmit,
  validateCurrentPassword,
  validateEmail,
  validateFullName,
  validateNewPassword,
} from './authForm';

describe('validateEmail', () => {
  it('asks for the field when it is empty or blank', () => {
    expect(validateEmail('')).toBe('Enter your email address.');
    expect(validateEmail('   ')).toBe('Enter your email address.');
  });

  it.each(['nope', 'a@b', 'a b@c.co', '@b.co', 'a@.co'])('rejects %s', (value) => {
    expect(validateEmail(value)).toBe('Enter a valid email address, like you@example.com.');
  });

  it.each(['a@b.co', 'JORDAN.doe+tag@example.test', '  sam@dbf-fitness.com  '])(
    'accepts %s',
    (value) => {
      expect(validateEmail(value)).toBeNull();
    }
  );
});

describe('password validation', () => {
  it('only asks sign-in for something, since the server decides', () => {
    expect(validateCurrentPassword('')).toBe('Enter your password.');
    expect(validateCurrentPassword('x')).toBeNull();
  });

  it('mirrors the server minimum on sign-up', () => {
    expect(validateNewPassword('')).toBe('Choose a password.');
    expect(validateNewPassword('a'.repeat(PASSWORD_MIN_LENGTH - 1))).toBe(
      `Use at least ${PASSWORD_MIN_LENGTH} characters.`
    );
    expect(validateNewPassword('a'.repeat(PASSWORD_MIN_LENGTH))).toBeNull();
  });
});

describe('validateFullName', () => {
  it('treats whitespace as empty', () => {
    expect(validateFullName('  ')).toBe('Enter your name.');
    expect(validateFullName('Ada')).toBeNull();
  });
});

describe('form gating helpers', () => {
  it('is valid only when every field is clean', () => {
    expect(isFormValid({ email: null, password: null })).toBe(true);
    expect(isFormValid({ email: 'bad', password: null })).toBe(false);
  });

  it('touches every field after a submit attempt, so all errors show at once', () => {
    expect(touchedAfterSubmit({ email: 'bad', password: null })).toEqual({
      email: true,
      password: true,
    });
  });
});

describe('describeSignInError', () => {
  it('never tells the member to sign in while they are on the sign-in screen', () => {
    expect(describeSignInError(new Error('Invalid login credentials'))).toBe(
      'That email and password do not match. Check them and try again.'
    );
    expect(describeSignInError({ message: 'invalid grant' })).toContain('do not match');
  });

  it('names the confirmation and rate-limit cases', () => {
    expect(describeSignInError(new Error('Email not confirmed'))).toBe(
      'Confirm your email address first, then sign in.'
    );
    expect(describeSignInError(new Error('Request rate limit reached'))).toBe(
      'Too many attempts. Wait a minute and try again.'
    );
  });

  it('uses the shared offline copy for a network failure', () => {
    const offline = describeSignInError(new TypeError('Network request failed'));
    expect(offline).not.toBe(SIGN_IN_GENERIC_ERROR);
    expect(offline.toLowerCase()).toMatch(/connection|offline|internet/);
  });

  it('falls back to generic copy for anything unexpected, including null', () => {
    expect(describeSignInError(null)).toBe(SIGN_IN_GENERIC_ERROR);
    expect(describeSignInError({ weird: true })).toBe(SIGN_IN_GENERIC_ERROR);
    expect(describeSignInError(new Error('boom 500'))).toBe(SIGN_IN_GENERIC_ERROR);
  });
});

describe('errorBannerTitle', () => {
  it('separates offline from everything else', () => {
    expect(errorBannerTitle(new TypeError('Network request failed'))).toBe(
      'You appear to be offline'
    );
    expect(errorBannerTitle(new Error('Invalid login credentials'))).toBe('That did not work');
  });
});
