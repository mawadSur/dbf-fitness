import {
  ALREADY_LOGGED_TODAY_MESSAGE,
  GENERIC_FINISH_ERROR_MESSAGE,
  describeFinishWorkoutError,
  isAlreadyLoggedTodayError,
} from './finishWorkoutErrors';

describe('isAlreadyLoggedTodayError', () => {
  it('recognises a PostgREST unique_violation by code', () => {
    expect(
      isAlreadyLoggedTodayError({
        code: '23505',
        message:
          'duplicate key value violates unique constraint "workout_completions_member_day_date_key"',
      }),
    ).toBe(true);
  });

  it('recognises the constraint name when no code is present', () => {
    expect(
      isAlreadyLoggedTodayError(
        new Error(
          'duplicate key value violates unique constraint "workout_completions_member_day_date_key"',
        ),
      ),
    ).toBe(true);
  });

  it('does not treat other Postgres errors as duplicates', () => {
    expect(isAlreadyLoggedTodayError({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(isAlreadyLoggedTodayError(new Error('Network request failed'))).toBe(false);
    expect(isAlreadyLoggedTodayError(null)).toBe(false);
    expect(isAlreadyLoggedTodayError(undefined)).toBe(false);
    expect(isAlreadyLoggedTodayError('boom')).toBe(false);
  });
});

describe('describeFinishWorkoutError', () => {
  it('maps the duplicate to friendly copy and never leaks the raw constraint text', () => {
    const copy = describeFinishWorkoutError({
      code: '23505',
      message:
        'duplicate key value violates unique constraint "workout_completions_member_day_date_key"',
    });
    expect(copy).toBe(ALREADY_LOGGED_TODAY_MESSAGE);
    expect(copy).not.toMatch(/duplicate key|constraint|workout_completions/i);
  });

  it('keeps the actionable not-signed-in message', () => {
    expect(describeFinishWorkoutError(new Error('Not signed in.'))).toBe('Not signed in.');
  });

  it('falls back to a stable sentence for raw server errors', () => {
    expect(
      describeFinishWorkoutError({
        code: '42501',
        message: 'new row violates row-level security policy for table "workout_completions"',
      }),
    ).toBe(GENERIC_FINISH_ERROR_MESSAGE);
    expect(describeFinishWorkoutError(null)).toBe(GENERIC_FINISH_ERROR_MESSAGE);
  });

  it('never returns an empty string', () => {
    for (const input of [null, undefined, 0, '', {}, new Error('')]) {
      expect(describeFinishWorkoutError(input).length).toBeGreaterThan(0);
    }
  });
});
