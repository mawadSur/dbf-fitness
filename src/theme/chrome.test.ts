import { LEGACY_SCREENS_ARE_LIGHT, chromeScheme, statusBarStyle } from './chrome';
import { themes } from './tokens';

describe('chrome scheme', () => {
  it('keeps the chrome on the light palette while the screens hard-code white', () => {
    expect(LEGACY_SCREENS_ARE_LIGHT).toBe(true);
    expect(chromeScheme('dark')).toBe('light');
    expect(chromeScheme('light')).toBe('light');
  });

  it('follows the theme again the day the screens are migrated', () => {
    expect(chromeScheme('dark', false)).toBe('dark');
    expect(chromeScheme('light', false)).toBe('light');
  });
});

describe('status bar style', () => {
  it('draws dark glyphs on a light page and light glyphs on a dark one', () => {
    expect(statusBarStyle('light')).toBe('dark');
    expect(statusBarStyle('dark')).toBe('light');
  });

  /*
   * The bug: with the OS in night mode the resolved scheme was 'dark', so the
   * status bar drew WHITE glyphs — on a page that is still #FFFFFF. The top
   * band of the Android home screen measured 100% (255,255,255): clock, wifi
   * and battery were gone. Contrast is release-blocking (DESIGN-SYSTEM.md §66).
   */
  it('never puts white glyphs over the white legacy page', () => {
    expect(themes[chromeScheme('dark')].bg).toBe('#FFFFFF');
    expect(statusBarStyle(chromeScheme('dark'))).toBe('dark');
  });
});
