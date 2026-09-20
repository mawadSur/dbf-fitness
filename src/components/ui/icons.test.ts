import {
  ICON_NAMES,
  ICON_PATHS,
  ICON_SIZES,
  ICON_STROKE_WIDTH,
  ICON_VIEWBOX,
  isIconName,
  nearestIconSize,
} from './icons';

/** Every icon the app needs, per the ticket and design system §4. */
const REQUIRED = [
  'home',
  'workout',
  'food',
  'community',
  'profile',
  'calendar',
  'flame',
  'trophy',
  'check',
  'check-circle',
  'chevron-left',
  'chevron-right',
  'chevron-down',
  'chevron-up',
  'x',
  'plus',
  'minus',
  'search',
  'bell',
  'settings',
  'log-out',
  'video',
  'mic',
  'mic-off',
  'camera-off',
  'play',
  'pause',
  'upload',
  'file-text',
  'edit',
  'trash',
  'alert-triangle',
  'info',
  'lock',
  'crown',
  'heart',
  'clock',
  'moon',
  'sun',
  'eye',
  'eye-off',
  'refresh',
  'external-link',
  'shield',
  'arrow-right',
] as const;

describe('the DBF icon set', () => {
  it('has every icon the app needs', () => {
    for (const name of REQUIRED) expect(ICON_NAMES).toContain(name);
  });

  it('is a 24x24, 2px, round-cap outline set', () => {
    expect(ICON_VIEWBOX).toBe(24);
    expect(ICON_STROKE_WIDTH).toBe(2);
    expect(ICON_SIZES).toEqual([16, 20, 24, 28]);
  });

  it('gives every icon at least one non-empty path and no emoji or text glyphs', () => {
    for (const name of ICON_NAMES) {
      const paths = ICON_PATHS[name];
      expect(paths.length).toBeGreaterThan(0);
      for (const d of paths) {
        expect(d.trim().length).toBeGreaterThan(0);
        // SVG path data only: commands, numbers, separators.
        expect(d).toMatch(/^[MmLlHhVvCcSsQqTtAaZz0-9\s.,-]+$/);
      }
    }
  });

  it('narrows unknown strings', () => {
    expect(isIconName('flame')).toBe(true);
    expect(isIconName('not-an-icon')).toBe(false);
    expect(isIconName(42)).toBe(false);
    expect(isIconName('toString')).toBe(false);
  });

  it('snaps an arbitrary size onto the four drawn sizes', () => {
    expect(nearestIconSize(24)).toBe(24);
    expect(nearestIconSize(17)).toBe(16);
    expect(nearestIconSize(19)).toBe(20);
    expect(nearestIconSize(100)).toBe(28);
    expect(nearestIconSize(1)).toBe(16);
    expect(nearestIconSize(Number.NaN)).toBe(24);
  });
});
