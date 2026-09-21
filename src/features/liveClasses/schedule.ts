import type { BadgeTone, IconName } from '../../components/ui';
import { displayStateOf, type LiveClassDisplayState, type LiveClassStatus } from './status';

export type ScheduleSectionId = 'live' | 'upcoming' | 'past';

export const SECTION_TITLE: Record<ScheduleSectionId, string> = {
  live: 'Live now',
  upcoming: 'Upcoming',
  past: 'Past',
};

/** Status is never signalled by colour alone: every state ships an icon AND a word. */
export const STATUS_BADGE: Record<LiveClassDisplayState, { tone: BadgeTone; icon: IconName }> = {
  live: { tone: 'danger', icon: 'video' },
  'starting-soon': { tone: 'warning', icon: 'clock' },
  scheduled: { tone: 'neutral', icon: 'calendar' },
  ended: { tone: 'neutral', icon: 'check-circle' },
  cancelled: { tone: 'neutral', icon: 'x' },
};

export function sectionOf(state: LiveClassDisplayState): ScheduleSectionId {
  if (state === 'live') return 'live';
  if (state === 'ended' || state === 'cancelled') return 'past';
  return 'upcoming';
}

type SchedulableClass = { id: string; status: LiveClassStatus; starts_at: string };

export type ScheduleRow<T extends SchedulableClass> =
  | { key: string; kind: 'section'; section: ScheduleSectionId; title: string; count: number }
  | { key: string; kind: 'class'; item: T; state: LiveClassDisplayState };

const ORDER: readonly ScheduleSectionId[] = ['live', 'upcoming', 'past'];

/**
 * One flat, stable-keyed array for the schedule `FlatList`: a `SectionHeader` row
 * followed by its class rows, and nothing at all for an empty section.
 *
 * Live and upcoming classes read soonest-first (what you act on next); past
 * classes read newest-first (what you just did).
 */
export function buildScheduleRows<T extends SchedulableClass>(
  classes: readonly T[],
  now: Date | string | number,
): ScheduleRow<T>[] {
  const states = new Map<string, LiveClassDisplayState>();
  for (const item of classes) states.set(item.id, displayStateOf(item.status, item.starts_at, now));

  const rows: ScheduleRow<T>[] = [];
  for (const section of ORDER) {
    const items = classes
      .filter((item) => sectionOf(states.get(item.id) as LiveClassDisplayState) === section)
      .sort((a, b) => {
        const delta = Date.parse(a.starts_at) - Date.parse(b.starts_at);
        return section === 'past' ? -delta : delta;
      });
    if (items.length === 0) continue;
    rows.push({
      key: `section:${section}`,
      kind: 'section',
      section,
      title: SECTION_TITLE[section],
      count: items.length,
    });
    for (const item of items) {
      rows.push({
        key: `class:${item.id}`,
        kind: 'class',
        item,
        state: states.get(item.id) as LiveClassDisplayState,
      });
    }
  }
  return rows;
}
