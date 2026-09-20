import {
  generateChannelName,
  parseDateInput,
  parseTimeInput,
  quickPicks,
  toLocalDate,
  validateScheduleForm,
} from './scheduleForm';

const NOW = new Date(2026, 8, 19, 14, 30); // Sat 19 Sep 2026 14:30 local

describe('parsing', () => {
  it('accepts real dates only', () => {
    expect(parseDateInput('2026-10-03')).toEqual({ y: 2026, m: 10, d: 3 });
    expect(parseDateInput('2026-02-30')).toBeNull();
    expect(parseDateInput('10/03/2026')).toBeNull();
    expect(parseDateInput('')).toBeNull();
  });
  it('accepts 24h and am/pm times', () => {
    expect(parseTimeInput('18:00')).toEqual({ h: 18, min: 0 });
    expect(parseTimeInput('6:30 pm')).toEqual({ h: 18, min: 30 });
    expect(parseTimeInput('6pm')).toEqual({ h: 18, min: 0 });
    expect(parseTimeInput('12:15 AM')).toEqual({ h: 0, min: 15 });
    expect(parseTimeInput('12pm')).toEqual({ h: 12, min: 0 });
    expect(parseTimeInput('24:00')).toBeNull();
    expect(parseTimeInput('18:60')).toBeNull();
    expect(parseTimeInput('18')).toBeNull();
    expect(parseTimeInput('13pm')).toBeNull();
    expect(parseTimeInput('soon')).toBeNull();
  });
});

describe('validateScheduleForm', () => {
  it('produces a timestamp from the LOCAL wall-clock time', () => {
    const result = validateScheduleForm({ title: '  Yoga  ', date: '2026-10-03', time: '18:00' }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.title).toBe('Yoga');
    expect(result.startsAt.getTime()).toBe(new Date(2026, 9, 3, 18, 0).getTime());
    expect(result.startsAt.getHours()).toBe(18);
    expect(toLocalDate({ y: 2026, m: 10, d: 3 }, { h: 18, min: 0 }).getTime()).toBe(result.startsAt.getTime());
  });

  it('rejects an empty title, bad date/time and past times with inline errors', () => {
    const bad = validateScheduleForm({ title: ' ', date: 'x', time: 'y' }, NOW);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(['date', 'time', 'title']);

    const past = validateScheduleForm({ title: 'A', date: '2026-09-19', time: '14:00' }, NOW);
    expect(past.ok).toBe(false);
    if (!past.ok) expect(past.errors.when).toBe('Pick a time in the future.');

    const tooSoon = validateScheduleForm({ title: 'A', date: '2026-09-19', time: '14:30' }, NOW);
    expect(tooSoon.ok).toBe(false);
  });

  it('rejects an over-long title', () => {
    const r = validateScheduleForm({ title: 'x'.repeat(81), date: '2026-10-03', time: '18:00' }, NOW);
    expect(r.ok).toBe(false);
  });
});

describe('quickPicks', () => {
  it('lists future picks in date/time input format', () => {
    const picks = quickPicks(NOW);
    expect(picks.map((p) => p.label)).toEqual(['Tonight 6pm', 'Tomorrow 7am', 'Tomorrow 6pm', 'Saturday 9am']);
    expect(picks[0]).toMatchObject({ date: '2026-09-19', time: '18:00' });
    expect(picks[1]).toMatchObject({ date: '2026-09-20', time: '07:00' });
    // Today is Saturday, so "Saturday 9am" is next week.
    expect(picks[3]).toMatchObject({ date: '2026-09-26', time: '09:00' });
  });
  it('drops Tonight 6pm once it has passed', () => {
    const labels = quickPicks(new Date(2026, 8, 19, 19, 0)).map((p) => p.label);
    expect(labels).not.toContain('Tonight 6pm');
  });
  it('every pick validates', () => {
    for (const pick of quickPicks(NOW)) {
      expect(validateScheduleForm({ title: 'T', date: pick.date, time: pick.time }, NOW).ok).toBe(true);
    }
  });
});

describe('generateChannelName', () => {
  it('is dbf-<coach8>-<random8> and varies', () => {
    const a = generateChannelName('11111111-2222-3333-4444-555555555555');
    expect(a).toMatch(/^dbf-11111111-[a-z0-9]{8}$/);
    expect(generateChannelName('11111111-2222-3333-4444-555555555555')).not.toBe(a);
  });
});
