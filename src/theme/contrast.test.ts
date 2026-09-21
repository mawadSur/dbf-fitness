import {
  contrastRatio,
  MINIMUM_BY_ROLE,
  parseHex,
  relativeLuminance,
  roundRatio,
  type ContrastRole,
} from './contrast';
import { darkTheme, lightTheme, themes, type ThemeColors, type ThemeName } from './tokens';

type ColorKey = keyof ThemeColors;
type Pair = { fg: ColorKey; bg: ColorKey; role: ContrastRole; why: string };

const SURFACES: ColorKey[] = ['bg', 'bgSoft', 'surface', 'surfaceRaised'];

function onEverySurface(fg: ColorKey, role: ContrastRole, why: string): Pair[] {
  return SURFACES.map((bg) => ({ fg, bg, role, why }));
}

/**
 * Every documented text / background and UI / border pair from the design system.
 * Both themes are checked against the same table: a token that only works in one
 * theme is a failure.
 */
const PAIRS: Pair[] = [
  ...onEverySurface('text', 'text', 'primary body text'),
  ...onEverySurface('textSecondary', 'text', 'supporting body text'),
  ...onEverySurface('textMuted', 'text', 'muted body text (helper, timestamps)'),
  // The light brand green is 3.77:1 on white: accent, icons and large headings only.
  ...onEverySurface('brand', 'large-text', 'accent / icons / large text only'),
  ...onEverySurface('borderStrong', 'ui', 'inputs, selected states, essential edges'),
  ...onEverySurface('focus', 'ui', 'focus ring'),
  ...onEverySurface('cta', 'ui', 'primary button fill against the page'),
  // The arc/track pair is the ONLY thing that says how far along a ring is, so
  // it is an essential UI graphic (SC 1.4.11), not decoration.
  { fg: 'progressArc', bg: 'progressTrack', role: 'ui', why: 'progress ring arc against its track' },
  // Same rule for the LINEAR track: the filled part still has to be the thing
  // that says how far along you are.
  {
    fg: 'progressArc',
    bg: 'progressTrackLinear',
    role: 'ui',
    why: 'linear progress fill against its track',
  },
  ...onEverySurface('progressArc', 'ui', 'progress ring arc against the page'),
  // A disabled label is INERT, so SC 1.4.3 does not apply to it — but it still
  // has to be readable enough to tell you what the button would do, which is
  // why it is asserted as a `ui` pair (>= 3:1) rather than dropped.
  { fg: 'disabledFg', bg: 'disabledBg', role: 'ui', why: 'disabled control label on its fill' },
  // An OUTLINED disabled control keeps no fill, so its label and its edge sit
  // straight on the page.
  ...onEverySurface('disabledFg', 'ui', 'disabled outline label / edge on the page'),
  { fg: 'onCta', bg: 'cta', role: 'text', why: 'primary button label' },
  { fg: 'success', bg: 'successBg', role: 'text', why: 'success banner text' },
  { fg: 'success', bg: 'bg', role: 'text', why: 'success text inline on the page' },
  { fg: 'success', bg: 'surface', role: 'text', why: 'success text inside a card' },
  { fg: 'warning', bg: 'warningBg', role: 'text', why: 'warning banner text' },
  { fg: 'warning', bg: 'bg', role: 'text', why: 'warning text inline on the page' },
  { fg: 'warning', bg: 'surface', role: 'text', why: 'warning text inside a card' },
  { fg: 'danger', bg: 'dangerBg', role: 'text', why: 'error banner and field error text' },
  { fg: 'danger', bg: 'bg', role: 'text', why: 'error text inline on the page' },
  { fg: 'danger', bg: 'surface', role: 'text', why: 'error text inside a card' },
  { fg: 'info', bg: 'infoBg', role: 'text', why: 'info banner text' },
  { fg: 'info', bg: 'bg', role: 'text', why: 'info text inline on the page' },
  { fg: 'info', bg: 'surface', role: 'text', why: 'info text inside a card' },
  { fg: 'text', bg: 'successBg', role: 'text', why: 'banner body text on a success tint' },
  { fg: 'text', bg: 'warningBg', role: 'text', why: 'banner body text on a warning tint' },
  { fg: 'text', bg: 'dangerBg', role: 'text', why: 'banner body text on a danger tint' },
  { fg: 'text', bg: 'infoBg', role: 'text', why: 'banner body text on an info tint' },
];

/**
 * Deliberately below 3:1. These carry no information — they must never be the
 * only thing that separates two regions, which is why `borderStrong` exists.
 */
const DECORATIVE_PAIRS: Pair[] = [
  { fg: 'borderSoft', bg: 'bg', role: 'decorative', why: 'decorative hairline' },
  { fg: 'borderSoft', bg: 'surface', role: 'decorative', why: 'decorative card hairline' },
  { fg: 'sage', bg: 'bg', role: 'decorative', why: 'dot texture / tint' },
  { fg: 'sage', bg: 'surface', role: 'decorative', why: 'dot texture inside a card' },
  // The track only has to be VISIBLE against the page; what has to be readable
  // is the arc against the track, which is asserted as a `ui` pair above.
  ...onEverySurface('progressTrack', 'decorative', 'progress track against the page'),
  // The linear track must READ AS EMPTY: visible, but nowhere near the arc's
  // weight. (The light ring track, #6EE7B7, is 1.6:1 on white and at 6-8px
  // looked like a finished bar — that is the bug this token exists for.)
  ...onEverySurface('progressTrackLinear', 'decorative', 'linear progress track against the page'),
  // A disabled control must not vanish into whatever surface it sits on.
  ...onEverySurface('disabledBg', 'decorative', 'disabled control fill against the page'),
];

/** A card must be findable: either its fill differs from the page, or its hairline shows. */
const SURFACE_SEPARATION: ColorKey[] = ['surface', 'surfaceRaised'];

const report: string[] = [];

function check(themeName: ThemeName, theme: ThemeColors, pair: Pair) {
  const fg = theme[pair.fg];
  const bg = theme[pair.bg];
  const ratio = contrastRatio(fg, bg);
  const min = MINIMUM_BY_ROLE[pair.role];
  report.push(
    `${themeName.padEnd(5)} ${roundRatio(ratio).toFixed(2).padStart(6)} (min ${min}) ` +
      `${pair.fg} ${fg} on ${pair.bg} ${bg} — ${pair.role}: ${pair.why}`,
  );
  return { ratio, min };
}

describe.each<[ThemeName, ThemeColors]>([
  ['light', lightTheme],
  ['dark', darkTheme],
])('%s theme contrast', (themeName, theme) => {
  it.each(PAIRS.map((pair) => [`${pair.fg} on ${pair.bg} (${pair.role})`, pair] as const))(
    '%s meets its WCAG minimum',
    (_label, pair) => {
      const { ratio, min } = check(themeName, theme, pair);
      expect(roundRatio(ratio)).toBeGreaterThanOrEqual(min);
    },
  );

  it.each(DECORATIVE_PAIRS.map((pair) => [`${pair.fg} on ${pair.bg}`, pair] as const))(
    '%s is decorative: visible, and never relied on as an essential edge',
    (_label, pair) => {
      const { ratio, min } = check(themeName, theme, pair);
      expect(roundRatio(ratio)).toBeGreaterThanOrEqual(min);
      // If one of these ever reaches 3:1 it can be promoted, but until then the
      // essential-edge token is borderStrong.
      expect(contrastRatio(theme.borderStrong, theme.bg)).toBeGreaterThanOrEqual(3);
    },
  );

  it.each(SURFACE_SEPARATION)('%s is distinguishable from the page', (surface) => {
    const fillDelta = contrastRatio(theme[surface], theme.bg);
    const hairline = contrastRatio(theme.borderSoft, theme[surface]);
    report.push(
      `${themeName.padEnd(5)} ${roundRatio(fillDelta).toFixed(2).padStart(6)} (fill) / ` +
        `${roundRatio(hairline).toFixed(2)} (hairline) ${surface} vs bg — separation`,
    );
    // Light cards are white on white and rely on the hairline plus shadow-sm;
    // dark cards are tonal, so either signal on its own is enough.
    expect(Math.max(fillDelta, hairline)).toBeGreaterThanOrEqual(1.2);
  });

  /**
   * The bug this guards: disabled used to be `opacity: 0.45` over the enabled
   * skin, so in dark mode the bright CTA (#34D399) and its near-black label
   * both collapsed toward the page and met in the middle — a disabled
   * "Sign in" measured 1.48:1 and still looked like a live CTA. A blanket
   * alpha can never satisfy this: it moves BOTH colours toward the page by the
   * same amount, so the disabled fill is always a dimmed copy of the enabled
   * one. Distinct tokens can, and this is the assertion that keeps them.
   */
  it('makes a disabled control unmistakably different from an enabled one', () => {
    const fromCta = contrastRatio(theme.disabledBg, theme.cta);
    const labelFromOnCta = contrastRatio(theme.disabledFg, theme.onCta);
    report.push(
      `${themeName.padEnd(5)} ${roundRatio(fromCta).toFixed(2).padStart(6)} disabledBg vs cta / ` +
        `${roundRatio(labelFromOnCta).toFixed(2)} disabledFg vs onCta — disabled affordance`,
    );
    // Same threshold as any other essential UI difference (SC 1.4.11).
    expect(roundRatio(fromCta)).toBeGreaterThanOrEqual(3);
    expect(roundRatio(labelFromOnCta)).toBeGreaterThanOrEqual(3);
    // And it is a real fill, not an alpha: nothing about it is derived from cta.
    expect(theme.disabledBg).not.toBe(theme.cta);
    expect(theme.disabledFg).not.toBe(theme.onCta);
  });

  it('keeps the linear progress track paler than the ring track', () => {
    // Not a contrast rule — a weight rule. The linear track sits closer to the
    // page than the ring track does, which is the whole point of the split.
    const linearFromPage = contrastRatio(theme.progressTrackLinear, theme.bg);
    const ringFromPage = contrastRatio(theme.progressTrack, theme.bg);
    expect(linearFromPage).toBeLessThanOrEqual(ringFromPage);
  });

  it('defines every token as a hex colour', () => {
    for (const [key, value] of Object.entries(theme)) {
      expect(() => parseHex(value)).not.toThrow();
      expect(`${key}:${value}`).toBe(`${key}:${value.toUpperCase()}`);
    }
  });
});

describe('contrast helpers', () => {
  it('matches the WCAG reference values for black and white', () => {
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });

  it('is symmetric and accepts shorthand hex', () => {
    expect(contrastRatio('#FFF', '#000')).toBeCloseTo(contrastRatio('#000', '#FFF'), 10);
  });

  it('rejects anything that is not a hex colour', () => {
    expect(() => parseHex('rgb(0,0,0)')).toThrow(/Not a hex colour/);
  });

  it('never rounds a ratio up past its real value', () => {
    expect(roundRatio(4.4999)).toBe(4.49);
  });
});

describe('theme parity', () => {
  it('declares the same token set in both themes', () => {
    expect(Object.keys(darkTheme).sort()).toEqual(Object.keys(lightTheme).sort());
    expect(Object.keys(themes)).toEqual(['light', 'dark']);
  });
});

// CONTRAST_REPORT=1 npx jest src/theme/contrast.test.ts  -> full table for design reviews.
afterAll(() => {
  if (process.env.CONTRAST_REPORT) {
     
    console.log(['', 'DBF contrast report', ...report].join('\n'));
  }
});
