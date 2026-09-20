import { brandFonts } from './fonts';
import {
  colors,
  darkTheme,
  fontFamily,
  layout,
  lightTheme,
  milestoneTiers,
  motion,
  radii,
  shadows,
  space,
  spacing,
  tokens,
  typeScale,
} from './tokens';

describe('typography tokens', () => {
  it('only names font families that the app actually loads', () => {
    const loaded = Object.keys(brandFonts);
    for (const family of Object.values(fontFamily)) {
      expect(loaded).toContain(family);
    }
    // No dead weight either: every loaded file is referenced by a token.
    expect(new Set(Object.values(fontFamily))).toEqual(new Set(loaded));
  });

  it('never goes below 12px, keeps body at 16px and leaves room for descenders', () => {
    for (const [role, style] of Object.entries(typeScale)) {
      expect({ role, size: style.fontSize >= 12 }).toEqual({ role, size: true });
      expect({ role, leading: style.lineHeight >= style.fontSize }).toEqual({
        role,
        leading: true,
      });
      expect(Object.values(fontFamily)).toContain(style.fontFamily);
    }
    expect(typeScale.body.fontSize).toBe(16);
    expect(typeScale.display.fontSize).toBe(40);
  });

  it('uses Manrope for headings and Inter for body roles', () => {
    for (const role of ['display', 'h1', 'h2', 'h3'] as const) {
      expect(typeScale[role].fontFamily).toMatch(/^Manrope_/);
    }
    for (const role of ['bodyLg', 'body', 'bodySm', 'label', 'eyebrow', 'caption'] as const) {
      expect(typeScale[role].fontFamily).toMatch(/^Inter_/);
    }
  });

  it('keeps the eyebrow uppercase and letter-spaced', () => {
    expect(typeScale.eyebrow.textTransform).toBe('uppercase');
    expect(typeScale.eyebrow.letterSpacing).toBeCloseTo(1.44, 5);
  });
});

describe('space, radius, elevation and motion tokens', () => {
  it('follows the 4/8 rhythm from the design system', () => {
    expect(Object.values(space)).toEqual([4, 8, 12, 16, 24, 32, 48]);
    for (const step of Object.values(space)) expect(step % 4).toBe(0);
  });

  it('keeps the layout constants the mobile rules depend on', () => {
    expect(layout).toEqual({
      gutter: 16,
      gutterWide: 24,
      wideBreakpoint: 600,
      maxContentWidth: 640,
      minTouchTarget: 44,
      minTouchTargetAndroid: 48,
    });
  });

  it('exposes one radius scale', () => {
    expect(radii).toEqual({ sm: 4, md: 8, lg: 12, xl: 16, pill: 999 });
  });

  it('exposes one elevation scale with an Android elevation for every step', () => {
    expect(Object.keys(shadows)).toEqual(['sm', 'md', 'lg']);
    let previousElevation = 0;
    for (const shadow of Object.values(shadows)) {
      expect(shadow.shadowColor).toBe('#111111');
      expect(shadow.shadowOpacity).toBeCloseTo(0.05, 5);
      expect(shadow.elevation).toBeGreaterThan(previousElevation - 1);
      previousElevation = shadow.elevation;
      expect(shadow.shadowOffset.width).toBe(0);
    }
    expect(shadows.lg.shadowRadius).toBeGreaterThan(shadows.sm.shadowRadius);
  });

  it('keeps motion durations ordered and presses subtle', () => {
    expect(motion.fast).toBeLessThan(motion.base);
    expect(motion.base).toBeLessThan(motion.slow);
    expect(motion.exitRatio).toBeLessThan(1);
    expect(motion.pressScale).toBeGreaterThan(0.9);
    expect(motion.pressOpacity).toBeLessThan(1);
  });

  it('bundles the non-colour tokens for useTheme()', () => {
    expect(Object.keys(tokens).sort()).toEqual(
      ['fontFamily', 'layout', 'motion', 'radii', 'shadows', 'space', 'typeScale'].sort(),
    );
  });
});

describe('theme palettes', () => {
  it('gives light and dark the same keys with different surfaces', () => {
    expect(Object.keys(lightTheme)).toEqual(Object.keys(darkTheme));
    expect(lightTheme.bg).not.toBe(darkTheme.bg);
    expect(lightTheme.text).not.toBe(darkTheme.text);
  });

  it('never uses pure black or pure white as a dark surface', () => {
    for (const surface of [darkTheme.bg, darkTheme.bgSoft, darkTheme.surface]) {
      expect(surface).not.toBe('#000000');
      expect(surface).not.toBe('#FFFFFF');
    }
  });
});

describe('legacy exports', () => {
  it('still exposes the pre-design-system palette unchanged', () => {
    expect(colors).toEqual({
      background: '#FFFFFF',
      surface: '#F8FAFC',
      border: '#E2E8F0',
      textPrimary: '#0F172A',
      textSecondary: '#64748B',
      primary: '#059669',
      primaryStrong: '#047857',
      primaryMuted: '#D1FAE5',
      danger: '#DC2626',
    });
  });

  it('still exposes milestone tiers and the legacy spacing names', () => {
    expect(Object.keys(milestoneTiers)).toEqual([
      'firstDay',
      'sevenDayStreak',
      'thirtyDayStreak',
    ]);
    expect(spacing).toEqual({ xs: 4, sm: 8, md: 16, lg: 24, xl: 32 });
  });
});
