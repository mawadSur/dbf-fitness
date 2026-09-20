/**
 * WCAG 2.1 contrast maths for the design tokens.
 *
 * Pure and dependency-free so `contrast.test.ts` can assert every documented
 * colour pair in both themes, and so components can assert their own pairs.
 */

/** WCAG 2.1 SC 1.4.3 — normal-size body text. */
export const TEXT_CONTRAST_MIN = 4.5;
/** WCAG 2.1 SC 1.4.3 — text >= 18.66px bold or >= 24px. */
export const LARGE_TEXT_CONTRAST_MIN = 3;
/** WCAG 2.1 SC 1.4.11 — icons and essential borders. */
export const UI_CONTRAST_MIN = 3;

export type ContrastRole = 'text' | 'large-text' | 'ui' | 'decorative';

export const MINIMUM_BY_ROLE: Record<ContrastRole, number> = {
  text: TEXT_CONTRAST_MIN,
  'large-text': LARGE_TEXT_CONTRAST_MIN,
  ui: UI_CONTRAST_MIN,
  // Hairlines and tints that carry no information: they only have to be visible.
  decorative: 1.2,
};

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** `#RGB` or `#RRGGBB` to 0-255 channels. Throws on anything else: a bad token is a bug. */
export function parseHex(hex: string): [number, number, number] {
  if (!HEX.test(hex)) throw new Error(`Not a hex colour: ${hex}`);
  const body = hex.slice(1);
  const full =
    body.length === 3
      ? body
          .split('')
          .map((c) => c + c)
          .join('')
      : body;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** WCAG relative luminance. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two opaque colours, 1..21. */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** Rounded down to 2dp so a reported value never overstates the real ratio. */
export function roundRatio(ratio: number): number {
  return Math.floor(ratio * 100) / 100;
}

export function meetsContrast(foreground: string, background: string, role: ContrastRole): boolean {
  return contrastRatio(foreground, background) >= MINIMUM_BY_ROLE[role];
}
