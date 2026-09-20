import type { RealtimeChannel } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { supabase } from '../../services/supabase/client';
import { participantsFromPresenceState, type ClassPresenceEntry } from './presence';

const NO_ONE: ClassPresenceEntry[] = [];

export type LiveClassPresence = {
  participants: ClassPresenceEntry[];
  /**
   * True once the presence channel failed to subscribe — most likely Realtime Authorization
   * refusing this class topic. The screen keeps working (join, video tiles, leave); only the
   * "In this class" list is unavailable.
   */
  unavailable: boolean;
};

/**
 * While `enabled`, tracks the signed-in user as `{ user_id, full_name }` on Realtime channel
 * `live:<classId>` and returns everyone currently on it. The channel is removed (and the user
 * untracked) when `enabled` turns false or the screen unmounts.
 *
 * The channel is PRIVATE, so Realtime enforces the `realtime.messages` policies from
 * 20260919140000_realtime_presence_authorization.sql: only the class's coach and that coach's
 * members may join. Without this, any authenticated user could read the names of everyone in any
 * class — `live_classes` is readable by all authenticated users, so class ids are enumerable.
 */
export function useLiveClassPresence(
  classId: string,
  user: { id: string; fullName: string } | null,
  enabled: boolean
): LiveClassPresence {
  const [participants, setParticipants] = useState<ClassPresenceEntry[]>(NO_ONE);
  const [unavailable, setUnavailable] = useState(false);
  const userId = user?.id ?? null;
  const fullName = user?.fullName ?? null;

  useEffect(() => {
    if (!enabled || !userId || !fullName) return;

    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    const start = async () => {
      // supabase-js reuses a channel by topic, and a callback can't be added to one that already
      // subscribed. If a previous mount for this class is still tearing down, finish that first.
      const stale = supabase.getChannels().find((existing) => existing.topic === `realtime:live:${classId}`);
      if (stale) await supabase.removeChannel(stale);
      if (cancelled) return;

      const next = supabase.channel(`live:${classId}`, {
        config: { private: true, presence: { key: userId } },
      });
      channel = next;
      next
        .on('presence', { event: 'sync' }, () => {
          if (cancelled) return;
          setParticipants(participantsFromPresenceState(next.presenceState()));
        })
        .subscribe((status) => {
          if (cancelled) return;
          if (status === 'SUBSCRIBED') {
            setUnavailable(false);
            void next.track({ user_id: userId, full_name: fullName }).catch(() => undefined);
            return;
          }
          // CHANNEL_ERROR (authorization refused), TIMED_OUT or CLOSED: show the inline note
          // instead of a list that would otherwise silently claim the class is empty.
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            setParticipants(NO_ONE);
            setUnavailable(true);
          }
        });
    };
    void start();

    return () => {
      cancelled = true;
      setParticipants(NO_ONE);
      setUnavailable(false);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [classId, userId, fullName, enabled]);

  return { participants, unavailable };
}
