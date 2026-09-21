import { dayHeading, dietProgress } from './dayLabel';

describe('dayHeading', () => {
  it('names the UTC day, not the device day', () => {
    expect(dayHeading('2026-09-20')).toBe('Sunday 20 September');
    expect(dayHeading('2026-01-01')).toBe('Thursday 1 January');
    expect(dayHeading('2026-12-31')).toBe('Thursday 31 December');
  });

  it('drops the leading zero on the day number', () => {
    expect(dayHeading('2026-03-05')).toBe('Thursday 5 March');
  });

  it('falls back to the raw value rather than printing "Invalid Date"', () => {
    expect(dayHeading('not-a-date')).toBe('not-a-date');
    expect(dayHeading('2026-13-01')).toBe('2026-13-01');
    expect(dayHeading('')).toBe('');
  });
});

describe('dietProgress', () => {
  it('reads as a count, including the empty and finished ends', () => {
    expect(dietProgress(0, 5)).toBe('0 of 5 ticked off');
    expect(dietProgress(2, 5)).toBe('2 of 5 ticked off');
    expect(dietProgress(5, 5)).toBe('5 of 5 ticked off');
  });
});
