import { splitGroups, type Group } from './groups';

const group = (id: string, name: string): Group => ({ id, name, description: null });

describe('splitGroups', () => {
  it('separates joined groups from discoverable ones, each sorted by name', () => {
    const groups = [group('3', 'Yoga Flow'), group('1', 'morning crew'), group('2', 'Lifters')];

    const { mine, discover } = splitGroups(groups, new Set(['3', '1']));

    expect(mine.map((g) => g.name)).toEqual(['morning crew', 'Yoga Flow']);
    expect(discover.map((g) => g.name)).toEqual(['Lifters']);
  });

  it('returns two empty lists when there are no groups', () => {
    expect(splitGroups([], new Set())).toEqual({ mine: [], discover: [] });
  });

  it('puts everything in discover when the member has joined nothing', () => {
    const { mine, discover } = splitGroups([group('1', 'A'), group('2', 'B')], new Set());

    expect(mine).toEqual([]);
    expect(discover).toHaveLength(2);
  });

  it('ignores membership ids for groups that are not visible', () => {
    const { mine, discover } = splitGroups([group('1', 'A')], new Set(['gone']));

    expect(mine).toEqual([]);
    expect(discover.map((g) => g.id)).toEqual(['1']);
  });
});
