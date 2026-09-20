import type { RealtimeChannel } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { supabase } from '../../services/supabase/client';
import { onlineIdsFromPresenceState } from './roster';

const EMPTY_SET: ReadonlySet<string> = new Set();

/**
 * Tracks the signed-in user on Realtime channel `group:<groupId>` and returns the user ids
 * currently present on it. The channel is removed (and the user untracked) on unmount.
 *
 * The channel is PRIVATE, so Realtime enforces the `realtime.messages` policies from
 * 20260919140000_realtime_presence_authorization.sql: only members of this group may join. A
 * refusal (or any other failed subscribe) is not fatal — the online set stays empty and the roster
 * simply renders everyone as Offline.
 */
export function useGroupPresence(groupId: string, userId: string | null): ReadonlySet<string> {
  const [onlineIds, setOnlineIds] = useState<ReadonlySet<string>>(EMPTY_SET);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    const start = async () => {
      // supabase-js reuses a channel by topic, and a callback can't be added to one that already
      // subscribed. If a previous mount for this group is still tearing down, finish that first.
      const stale = supabase.getChannels().find((existing) => existing.topic === `realtime:group:${groupId}`);
      if (stale) await supabase.removeChannel(stale);
      if (cancelled) return;

      const next = supabase.channel(`group:${groupId}`, {
        config: { private: true, presence: { key: userId } },
      });
      channel = next;
      next
        .on('presence', { event: 'sync' }, () => {
          if (cancelled) return;
          setOnlineIds(onlineIdsFromPresenceState(next.presenceState<{ user_id: string }>()));
        })
        .subscribe((status) => {
          if (cancelled) return;
          if (status === 'SUBSCRIBED') {
            void next.track({ user_id: userId }).catch(() => undefined);
            return;
          }
          // CHANNEL_ERROR (authorization refused), TIMED_OUT or CLOSED: drop back to "nobody is
          // online" rather than keeping a stale roster lit up.
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            setOnlineIds(EMPTY_SET);
          }
        });
    };
    void start();

    return () => {
      cancelled = true;
      setOnlineIds(EMPTY_SET);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [groupId, userId]);

  return onlineIds;
}
