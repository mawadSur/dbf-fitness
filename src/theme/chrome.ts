/**
 * Which palette the APP CHROME (status bar, tab bar) has to match.
 *
 * The chrome sits on top of whatever the screen paints, so it must follow the
 * SCREEN, not the member's theme preference. Every product screen — Home,
 * Workout, Food, Community, Profile and the stack screens — still paints a
 * hard-coded `#FFFFFF` page from the legacy palette (`tokens.colors`), so in
 * dark mode the chrome and the page disagree:
 *
 * - `<StatusBar style="light" />` draws WHITE clock/wifi/battery glyphs on the
 *   white page — measured on the dark-mode Android emulator as a 90px band of
 *   100% (255,255,255) pixels, i.e. the status bar simply disappears;
 * - the tab bar fills `rgba(1,26,20,0.9)` under a white page.
 *
 * This is the same mismatch the `ScoreRing` light-palette pin exists for. One
 * flag drives all three, and the day the screens consume `useTheme()` it flips
 * to `false` in a single place.
 */

import type { ThemeName } from './tokens';

/** True while any reachable screen still hard-codes the light legacy palette. */
export const LEGACY_SCREENS_ARE_LIGHT = true;

/**
 * The palette the chrome must use, given the theme the member resolved to.
 * `legacyScreensAreLight` is injectable so both branches stay testable (and so
 * flipping the flag is a one-line change with tests that already cover it).
 */
export function chromeScheme(
  scheme: ThemeName,
  legacyScreensAreLight: boolean = LEGACY_SCREENS_ARE_LIGHT,
): ThemeName {
  return legacyScreensAreLight ? 'light' : scheme;
}

/** expo-status-bar `style`: the glyph colour that contrasts with `scheme`. */
export function statusBarStyle(scheme: ThemeName): 'light' | 'dark' {
  return scheme === 'dark' ? 'light' : 'dark';
}
