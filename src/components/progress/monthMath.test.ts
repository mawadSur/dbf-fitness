import {
  addMonths,
  buildMonthCells,
  compareMonths,
  countCompletedInMonth,
  dayCellLabel,
  daysInMonth,
  effortLabel,
  firstWeekdayIndex,
  groupByUtcDay,
  monthKeyOf,
  monthRange,
  monthSummary,
  monthTitle,
  sameMonth,
  utcDateKey,
  utcDayKeyOf,
  type DayCell,
  type DayCompletion,
} from './monthMath';

const done = (id: string, completedAt: string, effortScore: number | null = null): DayCompletion => ({
  id,
  status: 'completed',
  effortScore,
  completedAt,
});

describe('utc day keys', () => {
  it('keys a timestamp by its UTC day, not the device day', () => {
    // 23:30Z on the 19th is already the 20th in +02:00; the DB says the 19th.
    expect(utcDayKeyOf('2026-09-19T23:30:00Z')).toBe('2026-09-19');
    expect(utcDayKeyOf('2026-09-20T00:10:00Z')).toBe('2026-09-20');
  });

  it('pads single-digit months and days', () => {
    expect(utcDateKey(new Date('2026-01-05T12:00:00Z'))).toBe('2026-01-05');
  });

  it('drops an unparseable timestamp instead of keying it NaN', () => {
    expect(utcDayKeyOf('not a date')).toBeNull();
    expect([...groupByUtcDay([done('a', 'not a date')]).keys()]).toEqual([]);
  });
});

describe('month arithmetic', () => {
  it('walks across a year boundary in both directions', () => {
    expect(addMonths({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
    expect(addMonths({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(addMonths({ year: 2026, month: 5 }, -18)).toEqual({ year: 2024, month: 11 });
  });

  it('orders months and titles them', () => {
    expect(compareMonths({ year: 2026, month: 0 }, { year: 2026, month: 3 })).toBeLessThan(0);
    expect(sameMonth({ year: 2026, month: 8 }, { year: 2026, month: 8 })).toBe(true);
    expect(monthTitle({ year: 2026, month: 8 })).toBe('September 2026');
  });

  it('knows month lengths, including a leap February', () => {
    expect(daysInMonth({ year: 2026, month: 1 })).toBe(28);
    expect(daysInMonth({ year: 2028, month: 1 })).toBe(29);
    expect(daysInMonth({ year: 2026, month: 8 })).toBe(30);
  });

  it('places the 1st in a Monday-first column', () => {
    // 1 September 2026 is a Tuesday -> column 1.
    expect(firstWeekdayIndex({ year: 2026, month: 8 })).toBe(1);
    // 1 November 2026 is a Sunday -> the last column, not the first.
    expect(firstWeekdayIndex({ year: 2026, month: 10 })).toBe(6);
  });

  it('reads a month key off a UTC date', () => {
    expect(monthKeyOf(new Date('2026-09-30T23:59:00Z'))).toEqual({ year: 2026, month: 8 });
  });
});

describe('buildMonthCells', () => {
  const september = { year: 2026, month: 8 };

  it('pads to whole weeks and marks today plus completions', () => {
    const byDay = groupByUtcDay([done('a', '2026-09-08T10:00:00Z', 8)]);
    const cells = buildMonthCells(september, byDay, '2026-09-20');

    expect(cells.length % 7).toBe(0);
    expect(cells.slice(0, 1)).toEqual([null]);
    const eighth = cells.find((cell) => cell?.day === 8) as DayCell;
    expect(eighth.isCompleted).toBe(true);
    expect(eighth.dateKey).toBe('2026-09-08');
    const twentieth = cells.find((cell) => cell?.day === 20) as DayCell;
    expect(twentieth.isToday).toBe(true);
    expect(twentieth.isCompleted).toBe(false);
    expect(cells.filter(Boolean)).toHaveLength(30);
  });

  it('does not treat a missed row as a completion', () => {
    const byDay = groupByUtcDay([
      { id: 'm', status: 'missed', effortScore: null, completedAt: '2026-09-08T10:00:00Z' },
    ]);
    const eighth = buildMonthCells(september, byDay, '2026-09-20').find(
      (cell) => cell?.day === 8,
    ) as DayCell;
    expect(eighth.isCompleted).toBe(false);
    expect(eighth.completions).toHaveLength(1);
  });

  it('starts a Sunday month with six blanks, not zero', () => {
    const cells = buildMonthCells({ year: 2026, month: 10 }, new Map(), '2026-11-02');
    expect(cells.slice(0, 6).every((cell) => cell === null)).toBe(true);
    expect(cells[6]?.day).toBe(1);
  });
});

describe('month range', () => {
  it('spans the data and always contains the month being viewed', () => {
    expect(monthRange(['2026-03-04', '2026-07-30'], { year: 2026, month: 8 })).toEqual({
      first: { year: 2026, month: 2 },
      last: { year: 2026, month: 8 },
    });
  });

  it('collapses to the current month when there is no data', () => {
    expect(monthRange([], { year: 2026, month: 8 })).toEqual({
      first: { year: 2026, month: 8 },
      last: { year: 2026, month: 8 },
    });
  });
});

describe('summaries', () => {
  it('counts one completed day per date, not one per row', () => {
    const byDay = groupByUtcDay([
      done('a', '2026-09-08T06:00:00Z'),
      done('b', '2026-09-08T18:00:00Z'),
      done('c', '2026-09-10T06:00:00Z'),
      done('d', '2026-08-31T06:00:00Z'),
    ]);
    expect(countCompletedInMonth(byDay, { year: 2026, month: 8 })).toBe(2);
    expect(countCompletedInMonth(byDay, { year: 2026, month: 7 })).toBe(1);
  });

  it('says the count in words, singular and plural', () => {
    const september = { year: 2026, month: 8 };
    expect(monthSummary(0, september)).toBe('No workouts in September');
    expect(monthSummary(1, september)).toBe('1 workout in September');
    expect(monthSummary(12, september)).toBe('12 workouts in September');
  });

  it('labels an effort score, or says there is none', () => {
    expect(effortLabel(8)).toBe('effort 8 out of 10');
    expect(effortLabel(null)).toBe('no effort score yet');
  });
});

describe('dayCellLabel', () => {
  const september = { year: 2026, month: 8 };
  const cells = buildMonthCells(
    september,
    groupByUtcDay([done('a', '2026-09-08T10:00:00Z', 8)]),
    '2026-09-20',
  );
  const indexOf = (day: number) => cells.findIndex((cell) => cell?.day === day);

  it('names the weekday, the date and the state', () => {
    expect(dayCellLabel(cells[indexOf(8)] as DayCell)).toBe(
      'Tuesday 8 September, workout completed, effort 8 out of 10',
    );
  });

  it('says today and says when nothing was logged', () => {
    expect(dayCellLabel(cells[indexOf(20)] as DayCell)).toBe(
      'Sunday 20 September, today, no workout logged',
    );
  });
});
