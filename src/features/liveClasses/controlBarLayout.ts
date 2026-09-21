import { labelAdvanceWidth, widestLabel } from '../../components/ui';

/**
 * The font scale at which a row of labelled controls stops fitting side by
 * side on a 360pt phone and has to stack (design system §9 / stage-2 rule 4).
 */
export const STACK_FONT_SCALE = 1.3;

/** Both states of both toggles: the row is sized for the widest of them. */
export const TOGGLE_LABELS = ['Mute', 'Unmute', 'Camera on', 'Camera off'] as const;

/**
 * Chrome a `Button` puts around its label at size `md`: 24pt of padding each
 * side, a 20pt leading icon and the 8pt gap after it (see `ui/Button.tsx`).
 */
export const TOGGLE_CHROME_WIDTH = 24 * 2 + 20 + 8;

/** `Text` role "label" — the type the button renders at size `md`. */
const TOGGLE_FONT_SIZE = 16;

/** Gap between the two toggles (`tokens.space.sm`). */
export const TOGGLE_GAP = 8;

/**
 * Width one toggle needs before its label wraps.
 *
 * Measured from the shipped font's glyph advances rather than guessed: at 360pt
 * the three-abreast bar broke "Camera off" mid-word into "Came / ra off", which
 * is what this number exists to prevent.
 */
export function toggleWidthNeeded(fontScale: number): number {
  const label = widestLabel([...TOGGLE_LABELS]);
  return TOGGLE_CHROME_WIDTH + labelAdvanceWidth(label, TOGGLE_FONT_SIZE, fontScale);
}

/**
 * True when the two toggles must become a column.
 *
 * `availableWidth` is the footer's inner width (screen minus its gutters). It is
 * optional so a caller that cannot measure still gets the font-scale rule.
 */
export function shouldStackControls(fontScale: number, availableWidth?: number): boolean {
  if (Number.isFinite(fontScale) && fontScale >= STACK_FONT_SCALE) return true;
  if (availableWidth === undefined || !Number.isFinite(availableWidth)) return false;
  const perToggle = (availableWidth - TOGGLE_GAP) / 2;
  return perToggle < toggleWidthNeeded(Number.isFinite(fontScale) ? fontScale : 1);
}
