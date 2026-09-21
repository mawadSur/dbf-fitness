export type RosterMember = {
  member_id: string;
  full_name: string;
};

export type RosterEntry = {
  memberId: string;
  fullName: string;
  online: boolean;
};

// Shape of supabase-js `channel.presenceState()`: presence key -> one meta per connected device.
type PresenceStateLike = Record<string, readonly { user_id?: unknown }[] | undefined>;

/**
 * Collects the `user_id` each connected client tracked on the channel. Anything that is not
 * a non-empty string is ignored, so a malformed meta from another client can't break the roster.
 */
export function onlineIdsFromPresenceState(state: PresenceStateLike): Set<string> {
  const ids = new Set<string>();
  for (const metas of Object.values(state)) {
    for (const meta of metas ?? []) {
      if (typeof meta?.user_id === 'string' && meta.user_id !== '') ids.add(meta.user_id);
    }
  }
  return ids;
}

/**
 * Joins the roster with the set of online user ids and sorts online people first, then by name.
 * Presence ids that are not on the roster (blocked people, the viewer, strangers on the channel)
 * are dropped: the roster is the source of truth for who may be shown.
 */
export function mergeRosterWithPresence(
  roster: readonly RosterMember[],
  onlineIds: ReadonlySet<string>
): RosterEntry[] {
  return roster
    .map((row) => ({
      memberId: row.member_id,
      fullName: row.full_name,
      online: onlineIds.has(row.member_id),
    }))
    .sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1;
      const byName = a.fullName.localeCompare(b.fullName, undefined, { sensitivity: 'base' });
      if (byName !== 0) return byName;
      return a.memberId.localeCompare(b.memberId);
    });
}
