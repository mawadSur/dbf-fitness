export type Group = {
  id: string;
  name: string;
  description: string | null;
};

export type GroupSplit = {
  mine: Group[];
  discover: Group[];
};

/** Splits all groups into the ones the member belongs to and the ones they can discover, each sorted by name. */
export function splitGroups(groups: readonly Group[], memberGroupIds: ReadonlySet<string>): GroupSplit {
  const byName = (a: Group, b: Group) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  const sorted = [...groups].sort(byName);
  return {
    mine: sorted.filter((group) => memberGroupIds.has(group.id)),
    discover: sorted.filter((group) => !memberGroupIds.has(group.id)),
  };
}
