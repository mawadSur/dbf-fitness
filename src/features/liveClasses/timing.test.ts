import { formatCountdown, isStartingSoon } from './timing';

const NOW = new Date('2026-09-19T12:00:00.000Z');
const minutesFromNow = (minutes: number, extraMs = 0) => new Date(NOW.getTime() + minutes * 60_000 + extraMs);

describe('isStartingSoon', () => {
  it('is true for a class starting inside the window', () => {
    expect(isStartingSoon(minutesFromNow(10), NOW)).toBe(true);
  });

  it('is true exactly at the 15 minute boundary', () => {
    expect(isStartingSoon(minutesFromNow(15), NOW)).toBe(true);
  });

  it('is false one millisecond past the 15 minute boundary', () => {
    expect(isStartingSoon(minutesFromNow(15, 1), NOW)).toBe(false);
  });

  it('is true exactly at the start time', () => {
    expect(isStartingSoon(NOW, NOW)).toBe(true);
  });

  it('is false once the start time has passed (the class is live, not "starting soon")', () => {
    expect(isStartingSoon(minutesFromNow(0, -1), NOW)).toBe(false);
    expect(isStartingSoon(minutesFromNow(-30), NOW)).toBe(false);
  });

  it('is false for a class days away', () => {
    expect(isStartingSoon(minutesFromNow(2 * 24 * 60), NOW)).toBe(false);
  });

  it('honours a custom window', () => {
    expect(isStartingSoon(minutesFromNow(30), NOW, 30)).toBe(true);
    expect(isStartingSoon(minutesFromNow(30), NOW, 29)).toBe(false);
  });

  it('accepts ISO strings and epoch milliseconds', () => {
    expect(isStartingSoon('2026-09-19T12:05:00.000Z', NOW.toISOString())).toBe(true);
    expect(isStartingSoon(minutesFromNow(5).getTime(), NOW.getTime())).toBe(true);
  });

  it('is false for an unparseable start time', () => {
    expect(isStartingSoon('not a date', NOW)).toBe(false);
  });
});

describe('formatCountdown', () => {
  it('shows days and hours for a class days away', () => {
    expect(formatCountdown(minutesFromNow(2 * 24 * 60), NOW)).toBe('Starts in 2d');
    expect(formatCountdown(minutesFromNow(2 * 24 * 60 + 3 * 60), NOW)).toBe('Starts in 2d 3h');
  });

  it('shows hours and minutes under a day', () => {
    expect(formatCountdown(minutesFromNow(3 * 60 + 5), NOW)).toBe('Starts in 3h 5m');
    expect(formatCountdown(minutesFromNow(60), NOW)).toBe('Starts in 1h');
  });

  it('shows minutes under an hour and floors partial minutes', () => {
    expect(formatCountdown(minutesFromNow(14), NOW)).toBe('Starts in 14 min');
    expect(formatCountdown(minutesFromNow(14, 59_000), NOW)).toBe('Starts in 14 min');
    expect(formatCountdown(minutesFromNow(15), NOW)).toBe('Starts in 15 min');
  });

  it('says "Starting now" within a minute either side of the start', () => {
    expect(formatCountdown(NOW, NOW)).toBe('Starting now');
    expect(formatCountdown(minutesFromNow(0, 59_999), NOW)).toBe('Starting now');
    expect(formatCountdown(minutesFromNow(0, -59_999), NOW)).toBe('Starting now');
  });

  it('describes a class that already started', () => {
    expect(formatCountdown(minutesFromNow(-5), NOW)).toBe('Started 5 min ago');
    expect(formatCountdown(minutesFromNow(-90), NOW)).toBe('Started 1h 30m ago');
  });

  it('returns an empty string for an unparseable date', () => {
    expect(formatCountdown('nope', NOW)).toBe('');
  });
});
