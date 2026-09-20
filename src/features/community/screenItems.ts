import type { Group } from './groups';

export type CommunityItem =
  | { key: string; type: 'heading'; text: string; variant: 'section' | 'sub' }
  | { key: string; type: 'empty'; text: string }
  | { key: string; type: 'roster'; group: Group }
  | { key: string; type: 'group'; group: Group; isMember: boolean };

export const NO_GROUPS_TEXT = 'You are not in a group yet. Join one below to see who you train with.';
export const NO_GROUPS_AT_ALL_TEXT = 'No groups yet.';

/**
 * Flattens the community screen into one list (so it can virtualise and pull-to-refresh):
 * the roster of every group the member is in, then the group list with "Discover" for the rest.
 */
export function buildCommunityItems(mine: readonly Group[], discover: readonly Group[]): CommunityItem[] {
  const items: CommunityItem[] = [
    { key: 'heading:people', type: 'heading', text: 'People you train with', variant: 'section' },
  ];

  if (mine.length === 0) items.push({ key: 'empty:people', type: 'empty', text: NO_GROUPS_TEXT });
  for (const group of mine) items.push({ key: `roster:${group.id}`, type: 'roster', group });

  items.push({ key: 'heading:groups', type: 'heading', text: 'Groups', variant: 'section' });
  if (mine.length === 0 && discover.length === 0) {
    items.push({ key: 'empty:groups', type: 'empty', text: NO_GROUPS_AT_ALL_TEXT });
  }
  for (const group of mine) items.push({ key: `group:${group.id}`, type: 'group', group, isMember: true });
  if (discover.length > 0) {
    items.push({ key: 'heading:discover', type: 'heading', text: 'Discover', variant: 'sub' });
    for (const group of discover) items.push({ key: `group:${group.id}`, type: 'group', group, isMember: false });
  }
  return items;
}
