import { summarizeProgress, toggleKey } from './progress';

const items = [
  { key: 'a', text: 'A', kind: 'note' as const },
  { key: 'b', text: 'B', kind: 'exercise' as const },
  { key: 'c', text: 'C', kind: 'exercise' as const },
];

describe('summarizeProgress', () => {
  it('reads "3 of 8 done" style labels', () => {
    expect(summarizeProgress(items, new Set(['a', 'c'])).label).toBe('2 of 3 done');
    expect(summarizeProgress(items, new Set()).label).toBe('0 of 3 done');
  });

  it('ignores keys that no longer exist in the checklist', () => {
    const summary = summarizeProgress(items, new Set(['a', 'gone']));
    expect(summary.done).toBe(1);
    expect(summary.fraction).toBeCloseTo(1 / 3);
  });

  it('handles an empty checklist', () => {
    expect(summarizeProgress([], new Set())).toMatchObject({ done: 0, total: 0, fraction: 0 });
  });
});

describe('toggleKey', () => {
  it('adds and removes without mutating the input', () => {
    const start = new Set(['a']);
    const added = toggleKey(start, 'b');
    expect([...added].sort()).toEqual(['a', 'b']);
    expect([...start]).toEqual(['a']);
    expect([...toggleKey(added, 'a')]).toEqual(['b']);
  });
});
