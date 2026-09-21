import {
  contrastRatio,
  MINIMUM_BY_ROLE,
  parseHex,
  roundRatio,
} from './contrast';
import {
  darkTheme,
  lightTheme,
  RIPPLE_ALPHA,
  rippleFor,
  type ThemeColors,
} from './tokens';

/**
 * ANDROID'S PRESS FEEDBACK HAS TO BE VISIBLE.
 *
 * The shipped bar was a pressed-state change measured at ~0.985 on the Android
 * emulator where `motion.pressOpacity` (0.92) was expected. The cause was not
 * the opacity: it was the ripple UNDER it. Every `android_ripple` was handed
 * another OPAQUE palette token, and in the dark theme those tokens collide
 * with what they are drawn on —
 *
 *   - `primary` button: fill `cta` #34D399, ripple `brand` #34D399 — identical,
 *   - `secondary`/`ghost`/rows/chips: ripple `bgSoft` #022C22 on page #011A14.
 *
 * so Android drew no press feedback at all and only the small opacity step was
 * left, which on an already-dark page is a few percent of pixel change.
 *
 * The ink is now derived from the control's CONTENT colour (`rippleFor`), which
 * cannot collide with the fill: content is already >= 4.5:1 against its own
 * fill. This suite composites the ink over every surface it is actually drawn
 * on, in both themes, and fails if the press would be invisible.
 */

/** `rgba(r, g, b, a)` back to channels. */
function parseRgba(value: string): {
  rgb: [number, number, number];
  alpha: number;
} {
  const match = /^rgba\((\d+), (\d+), (\d+), ([0-9.]+)\)$/.exec(value);
  if (!match) throw new Error(`Not an rgba colour: ${value}`);
  return {
    rgb: [Number(match[1]), Number(match[2]), Number(match[3])],
    alpha: Number(match[4]),
  };
}

/** `#rrggbb` for the ink composited over an opaque background — what the eye sees. */
function compositeOver(ink: string, background: string): string {
  const { rgb, alpha } = parseRgba(ink);
  const under = parseHex(background);
  const mixed = rgb.map((channel, i) =>
    Math.round(channel * alpha + under[i] * (1 - alpha)),
  );
  return `#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** A tint carrying no information still has to be VISIBLE (the contrast suite's floor). */
const VISIBLE = MINIMUM_BY_ROLE.decorative;

describe('rippleFor', () => {
  it('renders the colour as an rgba ink at the documented alpha', () => {
    expect(rippleFor('#022C22')).toBe(`rgba(2, 44, 34, ${RIPPLE_ALPHA})`);
    expect(rippleFor('#FFFFFF', 0.5)).toBe('rgba(255, 255, 255, 0.5)');
  });

  it('rejects a non-hex colour rather than emitting a broken ink', () => {
    expect(() => rippleFor('rgba(0,0,0,0.2)')).toThrow(/Not a hex colour/);
  });
});

describe.each<[string, ThemeColors]>([
  ['light', lightTheme],
  ['dark', darkTheme],
])('%s theme press ink', (_scheme, colors) => {
  /**
   * Every control that sets `android_ripple`, as
   * [what the ink is derived from, what it is drawn on].
   *
   * Button variants come first because that is where the collision was: a
   * filled button's ink lands on its OWN fill, not on the page.
   */
  const surfaces: [string, string, string][] = [
    ['Button primary', colors.onCta, colors.cta],
    ['Button danger', colors.dangerBg, colors.danger],
    ['Button secondary', colors.text, colors.bg],
    ['Button secondary on a card', colors.text, colors.surface],
    ['Button ghost', colors.textSecondary, colors.bg],
    ['Button danger-outline', colors.danger, colors.bg],
    ['Button disabled (filled)', colors.disabledFg, colors.disabledBg],
    ['Card / ListRow / ChecklistRow', colors.text, colors.surface],
    ['Raised row', colors.text, colors.surfaceRaised],
    ['Chip / Banner on the page', colors.text, colors.bg],
    ['Chip selected', colors.text, colors.bgSoft],
    ['Tab bar item', colors.text, colors.bg],
  ];

  it.each(surfaces)(
    '%s is visible when pressed',
    (_name, content, background) => {
      const seen = compositeOver(rippleFor(content), background);
      expect(
        roundRatio(contrastRatio(seen, background)),
      ).toBeGreaterThanOrEqual(VISIBLE);
    },
  );

  it('never hands a filled button an ink equal to its own fill', () => {
    expect(compositeOver(rippleFor(colors.onCta), colors.cta)).not.toBe(
      colors.cta.toLowerCase(),
    );
  });
});

it('keeps the old primary ripple documented as the invisible one it was', () => {
  // `brand` and `cta` are the SAME colour in the dark theme, which is why the
  // old `ripple: colors.brand` drew nothing on a dark primary button. Light
  // was fine, which is why it shipped.
  expect(darkTheme.brand).toBe(darkTheme.cta);
  expect(
    roundRatio(contrastRatio(lightTheme.brand, lightTheme.cta)),
  ).toBeGreaterThan(VISIBLE);
});
