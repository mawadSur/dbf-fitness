/**
 * Which palette the APP CHROME (status bar, tab bar, root session gate) uses.
 *
 * The chrome sits on top of whatever the screen paints, so it has to agree with
 * the screen. Historically it could not: every product screen hard-coded a
 * `#FFFFFF` legacy page, so in dark mode `<StatusBar style="light" />` drew
 * white glyphs on a white page (measured on the dark-mode Android emulator as a
 * 90px band of 100% (255,255,255) pixels — the status bar simply disappeared)
 * and the tab bar filled `rgba(1,26,20,0.9)` under a white page. A
 * `LEGACY_SCREENS_ARE_LIGHT` flag pinned the chrome to the light palette for
 * exactly as long as that was true.
 *
 * Stage 2 migrated every reachable screen onto `useTheme()`, so the premise is
 * gone and so is the flag: the chrome now simply follows the resolved theme,
 * which is the same thing the screens do. What remains here is the one rule
 * that never depended on the flag — the glyph colour has to contrast with the
 * surface behind it.
 */

import type { ThemeName } from './tokens';

/** expo-status-bar `style`: the glyph colour that contrasts with `scheme`. */
export function statusBarStyle(scheme: ThemeName): 'light' | 'dark' {
  return scheme === 'dark' ? 'light' : 'dark';
}
