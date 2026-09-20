import type { Group } from './groups';

/** One FlatList row on the community screen (sections are flattened so the list can virtualise). */
export type CommunityRow =
  | { type: 'rosterTitle' }
  | { type: 'rosterEmpty' }
  | { type: 'roster'; group: Group }
  | { type: 'groupsTitle' }
  | { type: 'groupsEmpty' }
  | { type: 'group'; group: Group; isMember: boolean }
  | { type: 'discoverTitle' };

export function buildCommunityRows(mine: Group[], discover: Group[]): CommunityRow[] {
  const rows: CommunityRow[] = [{ type: 'rosterTitle' }];
  if (mine.length === 0) rows.push({ type: 'rosterEmpty' });
  for (const group of mine) rows.push({ type: 'roster', group });

  rows.push({ type: 'groupsTitle' });
  if (mine.length === 0 && discover.length === 0) rows.push({ type: 'groupsEmpty' });
  for (const group of mine) rows.push({ type: 'group', group, isMember: true });
  if (discover.length > 0) {
    rows.push({ type: 'discoverTitle' });
    for (const group of discover) rows.push({ type: 'group', group, isMember: false });
  }
  return rows;
}

export function communityRowKey(row: CommunityRow): string {
  switch (row.type) {
    case 'roster':
      return `roster:${row.group.id}`;
    case 'group':
      return `group:${row.isMember ? 'mine' : 'discover'}:${row.group.id}`;
    default:
      return row.type;
  }
}
