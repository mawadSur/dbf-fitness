import type { Group } from './groups';
import { buildCommunityRows, communityRowKey } from './rows';
import { overflowToScroll } from './scrollIntoView';

const g = (id: string): Group => ({ id, name: `Group ${id}`, description: null });

describe('buildCommunityRows', () => {
  it('shows both empty messages when there are no groups at all', () => {
    const rows = buildCommunityRows([], []);
    expect(rows.map((r) => r.type)).toEqual(['rosterTitle', 'rosterEmpty', 'groupsTitle', 'groupsEmpty']);
  });

  it('offers only discover groups (no roster) when the member is in none', () => {
    const rows = buildCommunityRows([], [g('a')]);
    expect(rows.map((r) => r.type)).toEqual([
      'rosterTitle',
      'rosterEmpty',
      'groupsTitle',
      'discoverTitle',
      'group',
    ]);
    expect(rows[4]).toMatchObject({ type: 'group', isMember: false });
  });

  it('lists a roster and a group row for each of my groups, then discover groups', () => {
    const rows = buildCommunityRows([g('m1'), g('m2')], [g('d1')]);
    expect(rows.map((r) => r.type)).toEqual([
      'rosterTitle',
      'roster',
      'roster',
      'groupsTitle',
      'group',
      'group',
      'discoverTitle',
      'group',
    ]);
    expect(rows.filter((r) => r.type === 'group').map((r) => (r as { isMember: boolean }).isMember)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it('gives every row a unique key, including a group that is in both roster and list sections', () => {
    const rows = buildCommunityRows([g('m1')], [g('d1')]);
    const keys = rows.map(communityRowKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('roster:m1');
    expect(keys).toContain('group:mine:m1');
    expect(keys).toContain('group:discover:d1');
  });
});

describe('overflowToScroll', () => {
  it('is 0 when the field is already above the keyboard', () => {
    expect(overflowToScroll({ y: 100, height: 80, windowHeight: 844, keyboardHeight: 300 })).toBe(0);
  });

  it('scrolls by however far the bottom edge (plus margin) sits under the keyboard', () => {
    // visible bottom = 640 - 300 = 340; field bottom 400 + 16 margin -> 76
    expect(overflowToScroll({ y: 320, height: 80, windowHeight: 640, keyboardHeight: 300 })).toBe(76);
  });

  it('never scrolls when there is no keyboard (web) and ignores a negative height', () => {
    expect(overflowToScroll({ y: 320, height: 80, windowHeight: 640, keyboardHeight: 0 })).toBe(0);
    expect(overflowToScroll({ y: 320, height: 80, windowHeight: 640, keyboardHeight: -5 })).toBe(0);
  });
});
