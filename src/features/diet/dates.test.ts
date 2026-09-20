import { todayDateString } from './dates';

describe('todayDateString', () => {
  it('uses the UTC day by default, like the streak view', () => {
    expect(todayDateString(new Date('2026-09-19T23:59:59Z'))).toBe('2026-09-19');
    expect(todayDateString(new Date('2026-09-20T00:00:01Z'))).toBe('2026-09-20');
  });

  it('rolls over month and year boundaries', () => {
    expect(todayDateString(new Date('2026-01-31T23:59:59Z'))).toBe('2026-01-31');
    expect(todayDateString(new Date('2026-02-01T00:00:00Z'))).toBe('2026-02-01');
    expect(todayDateString(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12-31');
    expect(todayDateString(new Date('2027-01-01T00:00:00Z'))).toBe('2027-01-01');
  });

  it('handles leap days', () => {
    expect(todayDateString(new Date('2028-02-29T12:00:00Z'))).toBe('2028-02-29');
    expect(todayDateString(new Date('2028-03-01T00:00:00Z'))).toBe('2028-03-01');
  });

  it('defaults to the current instant (fake timers)', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-19T23:59:00Z'));
    try {
      expect(todayDateString()).toBe('2026-09-19');
      jest.setSystemTime(new Date('2026-09-20T00:01:00Z'));
      expect(todayDateString()).toBe('2026-09-20');
    } finally {
      jest.useRealTimers();
    }
  });

  it('local mode follows the device wall clock', () => {
    const local = new Date(2026, 8, 19, 23, 59, 0);
    expect(todayDateString(local, 'local')).toBe('2026-09-19');
    const justAfter = new Date(2026, 8, 20, 0, 1, 0);
    expect(todayDateString(justAfter, 'local')).toBe('2026-09-20');
  });

  it('pads single-digit months and days', () => {
    expect(todayDateString(new Date('2026-03-05T10:00:00Z'))).toBe('2026-03-05');
  });

  it('matches the ISO (UTC) date in any timezone', () => {
    for (const iso of ['2026-09-19T00:00:00Z', '2026-09-19T23:59:59Z', '2026-12-31T23:30:00Z']) {
      const d = new Date(iso);
      expect(todayDateString(d)).toBe(d.toISOString().slice(0, 10));
    }
  });

  it('local basis differs from UTC exactly when the offset crosses midnight', () => {
    // 00:10 UTC: a device west of UTC is still on the previous local day.
    const d = new Date('2026-09-20T00:10:00Z');
    const offsetMin = d.getTimezoneOffset();
    if (offsetMin > 10) {
      expect(todayDateString(d, 'local')).not.toBe(todayDateString(d, 'utc'));
    } else if (offsetMin === 0) {
      expect(todayDateString(d, 'local')).toBe(todayDateString(d, 'utc'));
    }
    expect(todayDateString(d, 'utc')).toBe('2026-09-20');
  });
});
