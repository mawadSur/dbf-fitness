import type { AppStateStatus } from 'react-native';

type AuthLike = { startAutoRefresh: () => unknown; stopAutoRefresh: () => unknown };
type AppStateLike = {
  currentState: AppStateStatus;
  addEventListener: (type: 'change', handler: (state: AppStateStatus) => void) => { remove: () => void };
};

/**
 * Ties Supabase token auto-refresh to app foreground/background (Supabase's Expo guide): JS timers
 * are suspended in the background, so refresh must be stopped there and restarted on resume.
 * No-op on web (the browser keeps timers and handles visibility itself). Returns a cleanup.
 */
export function bindAuthAutoRefresh(auth: AuthLike, appState: AppStateLike, os: string): () => void {
  if (os === 'web') return () => undefined;
  const apply = (state: AppStateStatus) => {
    if (state === 'active') void auth.startAutoRefresh();
    else void auth.stopAutoRefresh();
  };
  apply(appState.currentState);
  const sub = appState.addEventListener('change', apply);
  return () => {
    sub.remove();
    void auth.stopAutoRefresh();
  };
}
