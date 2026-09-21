import { labelAdvanceWidth, widestLabel } from '../../components/ui';

/**
 * How many ROWS the in-call control bar needs.
 *
 * The bar used to be three labelled `Button`s (icon beside text): they never
 * fit abreast, so Leave always took a second row and on a 360pt phone the two
 * toggles stacked as well — three rows of chrome that pushed the video stage
 * below the fold on a 360x640 phone.
 *
 * The controls are now COMPACT: the icon sits ABOVE the label, so a control is
 * only as wide as its widest WORD plus its padding. Three of those fit abreast
 * from 360pt at normal text size, which is the point of the change.
 */

/** The font scale from which a labelled row is allowed to stack (design system §9). */
export const STACK_FONT_SCALE = 1.3;

/** Every label the bar can show. The row is sized for the widest of them. */
export const CONTROL_LABELS = ['Mute', 'Unmute', 'Camera on', 'Camera off', 'Leave'] as const;

/** Horizontal padding a compact control puts around its label (8pt each side). */
export const CONTROL_CHROME_WIDTH = 8 * 2;

/** `Text` role "labelSm" — the type a compact control renders its label at. */
export const CONTROL_FONT_SIZE = 15;

/** Gap between two controls (`tokens.space.sm`). */
export const CONTROL_GAP = 8;

/**
 * Width one compact control needs.
 *
 * Measured against the widest WORD, not the widest label: a compact control
 * wraps "Camera off" to two lines happily (the icon is above, so the box is
 * tall already), and wrapping between words is not clipping. What must never
 * happen again is a break INSIDE a word ("Came / ra off"), which is exactly
 * what sizing to the longest word prevents.
 */
export function controlWidthNeeded(fontScale: number): number {
  const words = CONTROL_LABELS.flatMap((label) => label.split(' '));
  return CONTROL_CHROME_WIDTH + labelAdvanceWidth(widestLabel(words), CONTROL_FONT_SIZE, fontScale);
}

/** True when `count` controls fit abreast in `availableWidth`. */
function fitsAbreast(count: number, fontScale: number, availableWidth: number): boolean {
  const per = (availableWidth - CONTROL_GAP * (count - 1)) / count;
  return per >= controlWidthNeeded(fontScale);
}

/**
 * Rows the bar needs: 1 (all three abreast), 2 (toggles abreast, Leave below)
 * or 3 (one control per row).
 *
 * `availableWidth` is the footer's inner width (screen minus its gutters). It
 * is optional so a caller that cannot measure still gets a sane answer: assume
 * the narrow phone the design targets rather than a row that might clip.
 */
export function controlBarRows(fontScale: number, availableWidth?: number): 1 | 2 | 3 {
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  const width =
    availableWidth !== undefined && Number.isFinite(availableWidth) ? availableWidth : 360 - 16 * 2;
  if (fitsAbreast(3, scale, width)) return 1;
  if (fitsAbreast(2, scale, width)) return 2;
  return 3;
}

/**
 * True when the bar cannot keep all three controls on one row.
 *
 * Kept as a named predicate because the screen reads better for it, and
 * because "did the bar stack?" is the thing the tests assert about.
 */
export function shouldStackControls(fontScale: number, availableWidth?: number): boolean {
  return controlBarRows(fontScale, availableWidth) > 1;
}
