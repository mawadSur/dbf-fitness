/**
 * DBF design tokens — the React Native / SVG side of the design system.
 *
 * The same colour values are declared as CSS variables in `global.css` and wired
 * into Tailwind in `tailwind.config.js`; use the Tailwind classes in JSX and these
 * objects only where a style prop or an SVG attribute needs a real colour string
 * (react-native-svg, `shadowColor`, gradient stops, StatusBar, …).
 *
 * `src/theme/contrast.test.ts` verifies every documented pair in BOTH themes,
 * so a token edit here fails the suite rather than shipping unreadable text.
 * See `docs/design-system.md`.
 */

export type ThemeName = 'light' | 'dark';

export type ThemeColors = {
  /** Page background. */
  bg: string;
  /** Tinted section background / hero gradient end. */
  bgSoft: string;
  /** Card background. */
  surface: string;
  /** Raised card / sheet background. */
  surfaceRaised: string;
  /** Primary text. */
  text: string;
  /** Supporting text (still AA on bg, bgSoft and surface). */
  textSecondary: string;
  /** De-emphasised text (timestamps, helper copy). */
  textMuted: string;
  /** Accent for icons, rings and large text only (3:1 class in light). */
  brand: string;
  /** Primary button fill. */
  cta: string;
  /** Text/icon on top of `cta`. */
  onCta: string;
  /** Decorative sage (dots, tints). */
  sage: string;
  /**
   * The filled part of a progress ring/bar. It is an ESSENTIAL UI graphic — the
   * only thing that says how far along you are — so it is kept at >= 3:1
   * against `progressTrack`, which `brand` alone could not do (light brand on
   * sage is 2.47:1, dark brand on sage is 1.26:1).
   */
  progressArc: string;
  /** The unfilled part of a progress ring/bar. */
  progressTrack: string;
  /** Decorative hairlines only — not an essential edge. */
  borderSoft: string;
  /** Essential edges: inputs, selected states, focus outline base. */
  borderStrong: string;
  /** Focus ring. */
  focus: string;
  success: string;
  successBg: string;
  warning: string;
  warningBg: string;
  danger: string;
  dangerBg: string;
  info: string;
  infoBg: string;
};

export const lightTheme: ThemeColors = {
  bg: '#FFFFFF',
  bgSoft: '#ECFDF5',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  text: '#022C22',
  textSecondary: '#047857',
  textMuted: '#4B5563',
  brand: '#059669',
  cta: '#022C22',
  onCta: '#FFFFFF',
  sage: '#6EE7B7',
  // emerald-700 arc on the sage track: 3.59:1, so the filled part of a ring is
  // a real UI graphic rather than two tints of the same green (brand would be
  // 2.47:1 here and would fail SC 1.4.11).
  progressArc: '#047857',
  progressTrack: '#6EE7B7',
  borderSoft: '#A7F3D0',
  borderStrong: '#6B7280',
  focus: '#059669',
  // #059669 is only 3.32:1 on #D1FAE5, so the success TEXT colour is emerald-700.
  success: '#047857',
  successBg: '#D1FAE5',
  warning: '#B45309',
  warningBg: '#FEF3C7',
  // #DC2626 is only 3.95:1 on #FEE2E2, so the danger TEXT colour is red-700.
  danger: '#B91C1C',
  dangerBg: '#FEE2E2',
  // #2563EB is only 4.24:1 on #DBEAFE, so the info TEXT colour is blue-700.
  info: '#1D4ED8',
  infoBg: '#DBEAFE',
};

export const darkTheme: ThemeColors = {
  bg: '#011A14',
  bgSoft: '#022C22',
  surface: '#0A3D30',
  surfaceRaised: '#0B4A3A',
  text: '#ECFDF5',
  textSecondary: '#A7F3D0',
  // #9CA3AF is only 4.03:1 on the raised surface, so muted text is one step lighter.
  textMuted: '#A8B3BE',
  brand: '#34D399',
  cta: '#34D399',
  onCta: '#022C22',
  sage: '#6EE7B7',
  // The dark track is emerald-800, not sage: sage would leave the brand arc at
  // 1.26:1 and the two rings in the gallery were indistinguishable. 3.99:1 now.
  progressArc: '#34D399',
  progressTrack: '#065F46',
  borderSoft: '#065F46',
  borderStrong: '#6EE7B7',
  focus: '#34D399',
  success: '#34D399',
  successBg: '#064E3B',
  warning: '#FCD34D',
  warningBg: '#422006',
  danger: '#FCA5A5',
  dangerBg: '#450A0A',
  info: '#93C5FD',
  infoBg: '#172554',
};

export const themes: Record<ThemeName, ThemeColors> = {
  light: lightTheme,
  dark: darkTheme,
};

/**
 * Translucent tab-bar fill (design system §5). It lives outside `ThemeColors`
 * on purpose: it is an alpha colour that is never used for text or for an
 * essential border, so the contrast suite — which only reasons about opaque
 * pairs — has nothing to say about it.
 */
export const tabBarBackground: Record<ThemeName, string> = {
  light: 'rgba(250, 250, 248, 0.9)',
  dark: 'rgba(1, 26, 20, 0.9)',
};

/**
 * The one dark scrim used by video surfaces — the only colours in the product
 * that deliberately ignore `useTheme()`.
 *
 * Camera output is photographic, so its container must NOT flip with the theme:
 * a white tile frame around a dark video feed glares in a dim gym and washes the
 * picture out in daylight. So these are FIXED (identical in light and dark)
 * rather than `ThemeColors` entries, and they are the only values any live-video
 * box may use.
 *
 * Contrast (WCAG 2.1, non-text and text):
 *   scrim  #04120E  vs  onScrim        #F5FFFB  → 17.4:1
 *   scrim  #04120E  vs  onScrimMuted   #9FD6C3  →  9.4:1
 *   tile   #0B241D  vs  onScrim        #F5FFFB  → 14.0:1
 * so overlay captions stay legible over any frame the camera happens to show.
 */
export const videoSurface = {
  /** Background of the whole video stage. */
  scrim: '#04120E',
  /** One participant tile, one step lighter so tile edges read against the stage. */
  tile: '#0B241D',
  /** Hairline between touching tiles. */
  tileBorder: '#123A2E',
  /** Primary text/icon colour on the scrim. */
  onScrim: '#F5FFFB',
  /** Secondary text on the scrim (captions, "waiting…"). */
  onScrimMuted: '#9FD6C3',
  /** Gradient-free caption plate so a name stays readable over a bright frame. */
  captionPlate: 'rgba(4, 18, 14, 0.72)',
} as const;

export type VideoSurfaceToken = keyof typeof videoSurface;

/** One family name per weight: React Native does not synthesise bold. */
export const fontFamily = {
  heading: 'Manrope_800ExtraBold',
  headingBold: 'Manrope_700Bold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemibold: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
} as const;

export type TypeStyle = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  textTransform?: 'uppercase';
};

/** Design system §2. Sizes are unscaled: never disable system font scaling. */
export const typeScale = {
  display: { fontFamily: fontFamily.heading, fontSize: 40, lineHeight: 44, letterSpacing: -0.8 },
  h1: { fontFamily: fontFamily.heading, fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  h2: { fontFamily: fontFamily.heading, fontSize: 24, lineHeight: 30, letterSpacing: -0.24 },
  h3: { fontFamily: fontFamily.headingBold, fontSize: 19, lineHeight: 26, letterSpacing: 0 },
  bodyLg: { fontFamily: fontFamily.body, fontSize: 17, lineHeight: 26, letterSpacing: 0 },
  body: { fontFamily: fontFamily.body, fontSize: 16, lineHeight: 24, letterSpacing: 0 },
  bodySm: { fontFamily: fontFamily.body, fontSize: 14, lineHeight: 20, letterSpacing: 0 },
  bodySmMedium: { fontFamily: fontFamily.bodyMedium, fontSize: 14, lineHeight: 20, letterSpacing: 0 },
  label: { fontFamily: fontFamily.bodySemibold, fontSize: 16, lineHeight: 20, letterSpacing: 0 },
  labelSm: { fontFamily: fontFamily.bodySemibold, fontSize: 15, lineHeight: 20, letterSpacing: 0 },
  eyebrow: {
    fontFamily: fontFamily.bodySemibold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1.44,
    textTransform: 'uppercase',
  },
  caption: { fontFamily: fontFamily.body, fontSize: 12, lineHeight: 16, letterSpacing: 0 },
} as const satisfies Record<string, TypeStyle>;

/** Design system §3 — 4/8 rhythm. Mirrors `theme.extend.spacing` in Tailwind. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

/** Screen gutter: 16, or 24 from 600dp wide. */
export const layout = {
  gutter: 16,
  gutterWide: 24,
  wideBreakpoint: 600,
  maxContentWidth: 640,
  minTouchTarget: 44,
  minTouchTargetAndroid: 48,
} as const;

export const radii = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 999,
} as const;

export type ShadowStyle = {
  shadowColor: string;
  shadowOpacity: number;
  shadowOffset: { width: number; height: number };
  shadowRadius: number;
  elevation: number;
};

/** Light theme only — dark mode separates surfaces with borders, not shadows. */
export const shadows = {
  sm: {
    shadowColor: '#111111',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#111111',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 6,
    elevation: 2,
  },
  lg: {
    shadowColor: '#111111',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 15,
    elevation: 4,
  },
} as const satisfies Record<string, ShadowStyle>;

/** Durations in ms. Everything here collapses to 0 under reduced motion. */
export const motion = {
  fast: 150,
  base: 250,
  slow: 350,
  /** Exit transitions run at ~65% of the enter duration. */
  exitRatio: 0.65,
  progressRing: 600,
  pressScale: 0.98,
  pressOpacity: 0.92,
} as const;

export const tokens = {
  fontFamily,
  typeScale,
  space,
  layout,
  radii,
  shadows,
  motion,
} as const;

export type Tokens = typeof tokens;

/**
 * @deprecated Legacy palette from before the design system. Values are frozen so
 * screens that have not been migrated keep rendering exactly as they did; use
 * `lightTheme`/`darkTheme` (or the Tailwind semantic classes) in new code.
 */
export const colors = {
  background: '#FFFFFF',
  surface: '#F8FAFC',
  border: '#E2E8F0',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  primary: '#059669',
  /** Green for TEXT and filled-button backgrounds on white: 5.5:1 (primary is only 3.77:1). */
  primaryStrong: '#047857',
  primaryMuted: '#D1FAE5',
  danger: '#DC2626',
} as const;

/**
 * @deprecated Milestone tiers keep their own hues (colour is never the only
 * signal: each tier also has an icon and a label).
 */
export const milestoneTiers = {
  // All tier colors are used as TEXT (toast label) as well as border: each must be >= 4.5:1 on white.
  firstDay: { label: 'First Day', color: '#047857' },
  sevenDayStreak: { label: '7-Day Streak', color: '#2563EB' },
  thirtyDayStreak: { label: '30-Day Streak', color: '#B45309' },
} as const;

export type MilestoneTier = keyof typeof milestoneTiers;

/**
 * @deprecated Legacy spacing names (md = 16). New code uses `space`, which
 * matches the 4/8 rhythm in design system §3 (md = 12, lg = 16).
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;
