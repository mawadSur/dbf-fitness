/**
 * Mounts the timezone sync: once when a session appears, and again whenever the
 * app returns to the foreground (that is when a traveller's device has usually
 * picked up the new zone).
 */

import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { supabase } from '../../services/supabase/client';
import { syncProfileTimezone } from './timezoneSync';

export function useTimezoneSync(userId: string | null): void {
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const run = () => {
      if (cancelled) return;
      void syncProfileTimezone(userId).catch(() => undefined);
    };

    run();

    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') run();
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [userId]);
}

/** Convenience for callers that only have the supabase client at hand. */
export async function syncTimezoneForCurrentSession(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  await syncProfileTimezone(data.session?.user.id ?? null);
}
