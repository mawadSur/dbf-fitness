import {
  DAY_STATUS_META,
  checklistProgress,
  dayRowLabel,
  dayStatus,
  durationCopy,
  nextDaySummary,
  planSnapshot,
  startDayLabel,
  type PlanDay,
} from './planSummary';

const day = (id: string, dayNumber: number, durationMinutes: number | null = 40): PlanDay => ({
  id,
  dayNumber,
  blockName: `Block ${dayNumber}`,
  durationMinutes,
});

describe('planSnapshot', () => {
  it('reports no-plan for an empty plan, NOT completion', () => {
    expect(planSnapshot([], [])).toEqual({ kind: 'no-plan' });
  });

  it('picks the first uncompleted day in order', () => {
    const days = [day('d1', 1), day('d2', 2), day('d3', 3)];
    expect(planSnapshot(days, ['d1'])).toEqual({
      kind: 'next-day',
      day: days[1],
      completedCount: 1,
      totalDays: 3,
    });
  });

  it('skips over a gap: completing day 2 but not day 1 still starts at day 1', () => {
    const days = [day('d1', 1), day('d2', 2)];
    const snapshot = planSnapshot(days, ['d2']);
    expect(snapshot).toMatchObject({ kind: 'next-day', completedCount: 1 });
    expect(snapshot.kind === 'next-day' && snapshot.day.id).toBe('d1');
  });

  it('reports completion once every day is done', () => {
    expect(planSnapshot([day('d1', 1), day('d2', 2)], ['d1', 'd2'])).toEqual({
      kind: 'complete',
      totalDays: 2,
    });
  });

  it('ignores completions for days outside this plan', () => {
    expect(planSnapshot([day('d1', 1)], ['other', 'd1'])).toEqual({ kind: 'complete', totalDays: 1 });
    expect(planSnapshot([day('d1', 1)], ['other'])).toMatchObject({ completedCount: 0 });
  });
});

describe('durationCopy', () => {
  it('hedges the coach estimate', () => {
    expect(durationCopy(40)).toBe('about 40 min');
  });

  it('is absent rather than wrong when there is no usable number', () => {
    expect(durationCopy(null)).toBeNull();
    expect(durationCopy(undefined)).toBeNull();
    expect(durationCopy(0)).toBeNull();
    expect(durationCopy(-5)).toBeNull();
    expect(durationCopy(Number.NaN)).toBeNull();
  });

  it('rounds a fractional duration', () => {
    expect(durationCopy(32.4)).toBe('about 32 min');
  });
});

describe('labels', () => {
  it('names the action', () => {
    expect(startDayLabel(3)).toBe('Start Day 3');
  });

  // The heading above this line is already the block name: repeating it there
  // stuttered on the real screen ("Cardio in Place" twice, two lines apart).
  it('summarises the next day with the estimate, not the block name again', () => {
    expect(nextDaySummary(day('d1', 1, 45))).toBe('about 45 min');
    expect(nextDaySummary(day('d1', 1, null))).toBe('Your next workout is ready.');
    expect(nextDaySummary(day('d1', 1, 45))).not.toContain('Block 1');
  });

  it('counts checklist progress', () => {
    expect(checklistProgress(3, 6)).toBe('3 of 6 done');
    expect(checklistProgress(0, 0)).toBe('0 of 0 done');
  });
});

describe('dayStatus', () => {
  it('prefers today over the completion flag', () => {
    expect(dayStatus({ isCompleted: false, isToday: true })).toBe('today');
    expect(dayStatus({ isCompleted: true, isToday: true })).toBe('today');
  });

  it('separates done from upcoming', () => {
    expect(dayStatus({ isCompleted: true, isToday: false })).toBe('done');
    expect(dayStatus({ isCompleted: false, isToday: false })).toBe('upcoming');
  });

  it('gives every status a word AND an icon, so colour is never the only cue', () => {
    for (const meta of Object.values(DAY_STATUS_META)) {
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.icon.length).toBeGreaterThan(0);
    }
    const labels = Object.values(DAY_STATUS_META).map((m) => m.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('dayRowLabel', () => {
  it('states exactly one status word', () => {
    expect(dayRowLabel(day('d1', 2, null), 'today')).toBe('Day 2, Block 2, Today');
  });

  it('includes the duration when there is one', () => {
    expect(dayRowLabel(day('d1', 1, 40), 'done')).toBe('Day 1, Block 1, Done, about 40 min');
  });
});
