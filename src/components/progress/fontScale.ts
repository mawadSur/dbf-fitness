import { space, typeScale } from '../../theme/tokens';
import { glyphAdvanceEm, MAX_FONT_SCALE } from '../ui/layout';

/**
 * When a row of three has to become a column (design system §9).
 *
 * At 130% text a three-across row on a 390pt phone gives each item under 110pt,
 * which is narrower than the words in it — so past this scale the layout gives
 * up the row rather than the copy. One threshold, shared by every progress
 * surface, so the stat tiles and the milestone toast never disagree.
 */
export const STACK_FONT_SCALE = 1.3;

export function shouldStack(fontScale: number): boolean {
  return fontScale >= STACK_FONT_SCALE;
}

/* ------------------------------------------------------- month grid cell ---- */

/**
 * Widest digit in the label font, in em.
 *
 * The day number renders with `tabularNums`, so every digit takes the SAME
 * advance — and the one the renderer picks is the widest of the ten. Charging
 * the widest is therefore exact here, not conservative.
 */
export const WIDEST_DIGIT_EM = Math.max(
  ...Array.from('0123456789', (digit) => glyphAdvanceEm(digit)),
);

/** A month grid always has to hold two digits ("30"), never three. */
export const DAY_NUMBER_ADVANCE_EM = WIDEST_DIGIT_EM * 2;

/**
 * Everything between the day number and the edges of its 1/7 column: the
 * selection border on the cell (2pt each side) plus the pill's own horizontal
 * padding (`space.xs` each side).
 */
export const DAY_NUMBER_CHROME = 2 * 2 + space.xs * 2;

/**
 * How far the OS may scale the DAY NUMBER in a month-grid cell.
 *
 * The grid is seven equal columns of a fixed-width page, so a cell CANNOT grow
 * sideways — the doc comment that claimed "a 200% font scale enlarges the cell
 * instead of clipping the number" was only ever true vertically. Horizontally
 * the number simply ran out of column and React Native broke it BETWEEN THE
 * DIGITS: at font_scale 2.0 on the Android emulator 10, 11, 12 and 13 each
 * rendered as a stacked "1" over "0"/"1"/"2"/"3" and the week rows stopped
 * reading as dates.
 *
 * So the number scales as far as its own column allows and no further. On a
 * 412pt phone that is past 200% (nothing is capped); on a 360pt phone it is
 * ~186%, which is still a 26pt digit. `numberOfLines={1}` on the Text is the
 * backstop for a container narrower than any phone we ship on.
 *
 * Never below 1: a font scale the user did not ask for is a bug in the other
 * direction.
 */
export function dayNumberMaxFontScale(cellWidth: number): number {
  if (!Number.isFinite(cellWidth)) return 1;
  const available = cellWidth - DAY_NUMBER_CHROME;
  const atScaleOne = DAY_NUMBER_ADVANCE_EM * typeScale.bodySmMedium.fontSize;
  return Math.min(MAX_FONT_SCALE, Math.max(1, available / atScaleOne));
}
