import {
  avgEffortValue,
  formatAvgEffort,
  leaderboardRowLabel,
  rankByEffort,
  withNames,
  type EffortRow,
  type EffortStat,
} from './effortRanking';

const stat = (id: string, avg: number | null): EffortStat => ({
  member_id: id,
  completed_count: 2,
  missed_count: 0,
  total_effort_score: 10,
  avg_effort_score: avg,
  current_streak: 1,
});

const row = (id: string, avg: number | null, name: string): EffortRow => ({
  ...stat(id, avg),
  fullName: name,
});

describe('formatAvgEffort', () => {
  it('rounds to one decimal and dashes an unscored member', () => {
    expect(formatAvgEffort(7.25)).toBe('7.3/10');
    expect(formatAvgEffort(9)).toBe('9/10');
    expect(formatAvgEffort(null)).toBe('—');
  });
});

describe('avgEffortValue', () => {
  it('rounds for the ring and treats "no score" as an empty ring', () => {
    expect(avgEffortValue(8.44)).toBe(8.4);
    expect(avgEffortValue(null)).toBe(0);
  });
});

describe('withNames', () => {
  it('joins names and names the gap when a profile is missing', () => {
    const joined = withNames([stat('a', 8), stat('b', 4)], new Map([['a', 'Alex']]));
    expect(joined.map((r) => r.fullName)).toEqual(['Alex', 'Unknown member']);
  });
});

describe('rankByEffort', () => {
  it('sorts highest first and puts unscored members last', () => {
    const ranked = rankByEffort([row('a', null, 'Alex'), row('b', 7.25, 'Bo'), row('c', 9, 'Cy')]);
    expect(ranked.map((r) => r.fullName)).toEqual(['Cy', 'Bo', 'Alex']);
  });

  it('does not mutate its input', () => {
    const input = [row('a', 1, 'Alex'), row('b', 9, 'Bo')];
    rankByEffort(input);
    expect(input.map((r) => r.fullName)).toEqual(['Alex', 'Bo']);
  });

  it('keeps two unscored members in a stable order', () => {
    const ranked = rankByEffort([row('a', null, 'Alex'), row('b', null, 'Bo')]);
    expect(ranked.map((r) => r.fullName)).toEqual(['Alex', 'Bo']);
  });
});

describe('leaderboardRowLabel', () => {
  it('says the rank as a number, not as a position', () => {
    expect(leaderboardRowLabel(2, row('b', 7.25, 'Bo'))).toBe(
      'Rank 2, Bo, 2 completed, average effort 7.3/10',
    );
    expect(leaderboardRowLabel(3, row('a', null, 'Alex'))).toBe(
      'Rank 3, Alex, 2 completed, average effort —',
    );
  });
});
