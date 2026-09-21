import * as chrome from './chrome';
import { statusBarStyle } from './chrome';
import { themes } from './tokens';

describe('status bar style', () => {
  it('draws dark glyphs on a light page and light glyphs on a dark one', () => {
    expect(statusBarStyle('light')).toBe('dark');
    expect(statusBarStyle('dark')).toBe('light');
  });

  /*
   * The original bug: with the OS in night mode the resolved scheme was 'dark',
   * so the status bar drew WHITE glyphs — on a page that was still #FFFFFF. The
   * top band of the Android home screen measured 100% (255,255,255): clock, wifi
   * and battery were gone. Contrast is release-blocking (design-system.md).
   *
   * Now that the screens follow the theme, the guarantee is the general one:
   * whatever scheme the chrome resolves to, the glyphs contrast with THAT
   * scheme's page background.
   */
  it.each(['light', 'dark'] as const)('contrasts with the %s page it sits on', (scheme) => {
    const pageIsDark = themes[scheme].bg !== '#FFFFFF';
    expect(statusBarStyle(scheme)).toBe(pageIsDark ? 'light' : 'dark');
  });
});

describe('the legacy light pin', () => {
  /*
   * Stage 2 migrated every reachable screen onto `useTheme()`, so the chrome no
   * longer overrides the resolved scheme. These assert the concept is GONE, not
   * merely flipped to false: a re-introduced pin would silently make dark mode
   * light again for the status bar, tab bar and root spinner all at once.
   */
  it('no longer exists', () => {
    expect('LEGACY_SCREENS_ARE_LIGHT' in chrome).toBe(false);
    expect('chromeScheme' in chrome).toBe(false);
  });

  it('leaves the chrome following the theme', () => {
    expect(themes.dark.bg).not.toBe('#FFFFFF');
    expect(statusBarStyle('dark')).toBe('light');
  });
});
