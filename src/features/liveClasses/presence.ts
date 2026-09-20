export type ClassPresenceMeta = { user_id?: unknown; full_name?: unknown };

export type ClassPresenceEntry = { userId: string; fullName: string };

// Shape of supabase-js `channel.presenceState()`: presence key -> one meta per connected device.
type PresenceStateLike = Record<string, readonly ClassPresenceMeta[] | undefined>;

/**
 * Flattens Realtime Presence state into a de-duplicated, name-sorted list of people in the class.
 * One person on two devices appears once; metas without a string user_id are ignored so a
 * malformed payload from another client can't break the list; a missing name shows as "Member".
 */
export function participantsFromPresenceState(state: PresenceStateLike): ClassPresenceEntry[] {
  const namesByUserId = new Map<string, string>();
  for (const metas of Object.values(state)) {
    for (const meta of metas ?? []) {
      if (typeof meta?.user_id !== 'string' || meta.user_id === '') continue;
      const name = typeof meta.full_name === 'string' ? meta.full_name.trim() : '';
      // First non-empty name wins when the same person is connected from several devices.
      if (!namesByUserId.get(meta.user_id)) namesByUserId.set(meta.user_id, name);
    }
  }
  return [...namesByUserId.entries()]
    .map(([userId, name]) => ({ userId, fullName: name === '' ? 'Member' : name }))
    .sort((a, b) => {
      const byName = a.fullName.localeCompare(b.fullName, undefined, { sensitivity: 'base' });
      return byName !== 0 ? byName : a.userId.localeCompare(b.userId);
    });
}
