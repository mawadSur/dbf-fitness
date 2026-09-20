import { utcDayRange } from './completionWindow';

describe('utcDayRange', () => {
  it('returns the UTC midnight boundaries around the given instant', () => {
    expect(utcDayRange(new Date('2026-09-19T13:45:12.345Z'))).toEqual({
      startInclusive: '2026-09-19T00:00:00.000Z',
      endExclusive: '2026-09-20T00:00:00.000Z',
    });
  });

  it('uses the UTC date, not the local one, at the edges of the day', () => {
    // 23:30Z on the 19th is already the 20th in UTC+2 — the server keys on UTC.
    expect(utcDayRange(new Date('2026-09-19T23:30:00.000Z')).startInclusive).toBe(
      '2026-09-19T00:00:00.000Z',
    );
    // 00:30Z on the 20th is still the 19th in UTC-2 — again, the server keys on UTC.
    expect(utcDayRange(new Date('2026-09-20T00:30:00.000Z')).startInclusive).toBe(
      '2026-09-20T00:00:00.000Z',
    );
  });

  it('is exactly 24 hours wide and half-open', () => {
    const { startInclusive, endExclusive } = utcDayRange(new Date('2026-02-28T05:00:00.000Z'));
    expect(Date.parse(endExclusive) - Date.parse(startInclusive)).toBe(24 * 60 * 60 * 1000);
    expect(endExclusive).toBe('2026-03-01T00:00:00.000Z');
  });

  it('handles an exact midnight instant without shifting a day', () => {
    expect(utcDayRange(new Date('2026-09-19T00:00:00.000Z'))).toEqual({
      startInclusive: '2026-09-19T00:00:00.000Z',
      endExclusive: '2026-09-20T00:00:00.000Z',
    });
  });
});
