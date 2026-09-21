import { ICON_NAMES } from '../../components/ui';
import { buildScheduleRows, SECTION_TITLE, sectionOf, STATUS_BADGE } from './schedule';
import type { LiveClassStatus } from './status';

const NOW = new Date('2026-09-20T12:00:00.000Z');

function cls(id: string, minutesFromNow: number, status: LiveClassStatus = 'scheduled') {
  return { id, status, starts_at: new Date(NOW.getTime() + minutesFromNow * 60_000).toISOString() };
}

describe('sectionOf', () => {
  it('maps every display state to exactly one section', () => {
    expect(sectionOf('live')).toBe('live');
    expect(sectionOf('starting-soon')).toBe('upcoming');
    expect(sectionOf('scheduled')).toBe('upcoming');
    expect(sectionOf('ended')).toBe('past');
    expect(sectionOf('cancelled')).toBe('past');
  });
});

describe('STATUS_BADGE', () => {
  it('gives every state an icon as well as a word, and every icon exists', () => {
    for (const [state, badge] of Object.entries(STATUS_BADGE)) {
      expect(ICON_NAMES).toContain(badge.icon);
      expect(SECTION_TITLE[sectionOf(state as never)]).toBeTruthy();
    }
  });
});

describe('buildScheduleRows', () => {
  it('groups into Live now / Upcoming / Past and skips empty sections', () => {
    const rows = buildScheduleRows(
      [cls('a', 60), cls('b', -30, 'live'), cls('c', -600, 'ended')],
      NOW,
    );
    expect(rows.filter((row) => row.kind === 'section').map((row) => row.key)).toEqual([
      'section:live',
      'section:upcoming',
      'section:past',
    ]);

    const onlyUpcoming = buildScheduleRows([cls('a', 60)], NOW);
    expect(onlyUpcoming).toHaveLength(2);
    expect(onlyUpcoming[0]).toMatchObject({ kind: 'section', title: 'Upcoming', count: 1 });
    expect(onlyUpcoming[1]).toMatchObject({ kind: 'class', state: 'scheduled' });
  });

  it('sorts upcoming soonest-first and past newest-first', () => {
    const rows = buildScheduleRows(
      [cls('later', 600), cls('soon', 30), cls('old', -6000, 'ended'), cls('recent', -60, 'ended')],
      NOW,
    );
    const ids = rows.filter((row) => row.kind === 'class').map((row) => (row.kind === 'class' ? row.item.id : ''));
    expect(ids).toEqual(['soon', 'later', 'recent', 'old']);
  });

  it('marks a class inside the reminder window as starting-soon but keeps it in Upcoming', () => {
    const rows = buildScheduleRows([cls('a', 10)], NOW);
    expect(rows[0]).toMatchObject({ kind: 'section', section: 'upcoming' });
    expect(rows[1]).toMatchObject({ kind: 'class', state: 'starting-soon' });
  });

  it('returns nothing for no classes and keys every row uniquely', () => {
    expect(buildScheduleRows([], NOW)).toEqual([]);
    const rows = buildScheduleRows([cls('a', 1), cls('b', 2), cls('c', -1, 'cancelled')], NOW);
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
  });
});
