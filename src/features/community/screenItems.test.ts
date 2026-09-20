import type { Group } from './groups';
import { buildCommunityItems } from './screenItems';

const g = (id: string): Group => ({ id, name: `Group ${id}`, description: null });

describe('buildCommunityItems', () => {
  it('lists rosters for my groups, then my groups, then a Discover section', () => {
    const items = buildCommunityItems([g('a'), g('b')], [g('c')]);
    expect(items.map((item) => item.key)).toEqual([
      'heading:people',
      'roster:a',
      'roster:b',
      'heading:groups',
      'group:a',
      'group:b',
      'heading:discover',
      'group:c',
    ]);
    expect(items.filter((item) => item.type === 'group').map((item) => item.type === 'group' && item.isMember)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it('explains when the member is in no group but others exist to join', () => {
    const items = buildCommunityItems([], [g('c')]);
    expect(items.find((item) => item.key === 'empty:people')).toBeTruthy();
    expect(items.find((item) => item.key === 'empty:groups')).toBeUndefined();
    expect(items.some((item) => item.type === 'roster')).toBe(false);
  });

  it('says there are no groups at all when both lists are empty', () => {
    const items = buildCommunityItems([], []);
    expect(items.find((item) => item.key === 'empty:groups')).toMatchObject({ text: 'No groups yet.' });
    expect(items.some((item) => item.key === 'heading:discover')).toBe(false);
  });

  it('gives every row a unique key', () => {
    const keys = buildCommunityItems([g('a')], [g('b'), g('c')]).map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
