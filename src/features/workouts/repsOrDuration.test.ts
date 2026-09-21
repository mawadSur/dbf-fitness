import { isDuration, repsOrDurationIcon } from './repsOrDuration';

describe('repsOrDurationIcon', () => {
  it.each([
    '30s',
    '45 sec',
    '45 secs',
    '60 seconds',
    '2 min',
    '2 mins',
    '90 minutes',
    '1 h',
    '1 hr',
    '1 hour',
    '1:30',
    'Hold 30s each side',
    'AMRAP 10 min',
  ])('reads %p as a duration', (value) => {
    expect(isDuration(value)).toBe(true);
    expect(repsOrDurationIcon(value)).toBe('clock');
  });

  it.each([
    '12 reps',
    '10 reps each side',
    '5x5',
    '3 x 12',
    '3 sets of 8',
    '12 sets',
    '20',
    'To failure',
    '',
  ])('reads %p as a rep count, not a duration', (value) => {
    expect(isDuration(value)).toBe(false);
    expect(repsOrDurationIcon(value)).toBe('workout');
  });

  it('never calls a distance a duration', () => {
    // "400m" is metres. A bare `m` is ambiguous, so it is not a time unit.
    expect(repsOrDurationIcon('400m')).toBe('workout');
    expect(repsOrDurationIcon('5km')).toBe('workout');
  });

  it('does not mistake a score or a ratio for a clock time', () => {
    expect(isDuration('8/10')).toBe(false);
    expect(isDuration('3:7')).toBe(false);
  });
});
