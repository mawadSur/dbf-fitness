/**
 * Pure layout maths for the design system (§3, §5, §6).
 *
 * Everything here is a plain function so the geometry that decides whether a
 * label is clipped, whether a safe-area inset is counted twice, or whether a
 * touch target is big enough can be unit-tested without rendering anything.
 */

import { layout, motion, space } from '../../theme/tokens';

/** Font scaling is respected, but geometry is only reserved up to 200%. */
export const MAX_FONT_SCALE = 2;

export function clampFontScale(scale: number): number {
  if (!Number.isFinite(scale) || scale < 1) return 1;
  return Math.min(scale, MAX_FONT_SCALE);
}

/* ---------------------------------------------------------------- touch ---- */

/** iOS 44pt / Android 48dp (design system §9). */
export function minTouchTarget(os: string): number {
  return os === 'android' ? layout.minTouchTargetAndroid : layout.minTouchTarget;
}

export type ButtonSize = 'sm' | 'md' | 'lg';

/** sm 40 / md 48 / lg 56 — `sm` is below 44pt on purpose and ships with hitSlop. */
export const BUTTON_HEIGHT: Record<ButtonSize, number> = { sm: 40, md: 48, lg: 56 };

/** Extra hit area that lifts a control back to the platform minimum. */
export function hitSlopFor(height: number, os: string): number {
  return Math.max(0, Math.ceil((minTouchTarget(os) - height) / 2));
}

/* --------------------------------------------------------------- screen ---- */

/** Screen gutter: 16, or 24 from 600dp wide. */
export function screenGutter(width: number): number {
  return width >= layout.wideBreakpoint ? layout.gutterWide : layout.gutter;
}

/** Content column never grows past 640 and stays centred on tablets/web. */
export const CONTENT_MAX_WIDTH = layout.maxContentWidth;

/**
 * The bottom padding of a footer / scroll container.
 *
 * Inside the tab shell the tab bar already consumes the gesture-bar inset, so
 * adding it again would double-pad; outside the shell the footer owns it.
 */
export function bottomInsetPadding(insideTabShell: boolean, bottomInset: number): number {
  return insideTabShell ? 0 : Math.max(0, bottomInset);
}

export function fixedFooterPadding(
  insideTabShell: boolean,
  bottomInset: number,
  base: number = space.lg,
): number {
  return base + bottomInsetPadding(insideTabShell, bottomInset);
}

/**
 * Bottom padding of a `ScreenShell`'s scroll content.
 *
 * When the shell owns a `FixedFooter`, the footer is the thing that sits at the
 * bottom edge and therefore the thing that pays the gesture-bar inset — adding
 * it to the scroll content as well would push the last row up by the inset
 * twice. Without a footer the scroll content pays it (outside the tab shell).
 */
export function scrollBottomPadding(
  insideTabShell: boolean,
  bottomInset: number,
  hasFooter: boolean,
  base: number = space.xl,
): number {
  if (hasFooter) return base;
  return base + bottomInsetPadding(insideTabShell, bottomInset);
}

/* -------------------------------------------------------------- tab bar ---- */

export const TAB_BAR_ICON_SIZE = 24;
export const TAB_BAR_LABEL_FONT_SIZE = 12;
export const TAB_BAR_INDICATOR_WIDTH = 32;
export const TAB_BAR_INDICATOR_HEIGHT = 4;
export const TAB_BAR_MIN_HEIGHT = 56;

export const TAB_BAR_VERTICAL_PADDING = 4;
export const TAB_BAR_ITEM_HORIZONTAL_PADDING = 2;
export const TAB_BAR_GAP = 4;
const TAB_BAR_LINE_HEIGHT_RATIO = 1.35;

/** A tab label never wraps past two lines: the third one would be clipped. */
export const TAB_BAR_MAX_LABEL_LINES = 2;

/**
 * How far the OS may scale the TAB LABEL specifically (the rest of the app
 * still scales to `MAX_FONT_SCALE`).
 *
 * Five tabs on a 390pt phone give each label 74pt of glyph width. "Community"
 * in Inter SemiBold is 5.578em, i.e. 134pt at a 200% (24pt) label — it does not
 * fit two 74pt lines, and text wrapping is DISCRETE: the greedy break puts
 * "Com" on line one (54pt; "Comm" is 76pt and overflows) and has to tail-
 * truncate "munity" (82pt) on line two, so the device renders "Com" / "muni…".
 * At 150% the same label needs 100pt over two lines and breaks as "Commu" /
 * "nity" (68pt and 33pt), which clears even a 360pt phone's 68pt lines with
 * ~17% to spare. The full name always stays in the tab's accessibilityLabel,
 * so nothing is lost to assistive tech by capping the glyphs here.
 */
export const TAB_BAR_LABEL_MAX_FONT_SCALE = 1.5;

/** `clampFontScale`, further capped to what the tab label can actually show. */
export function clampLabelFontScale(scale: number): number {
  return Math.min(clampFontScale(scale), TAB_BAR_LABEL_MAX_FONT_SCALE);
}

/**
 * The `lineHeight` the label STYLE carries — unscaled, in raw points.
 *
 * React Native scales `lineHeight` by the OS font scale exactly as it scales
 * `fontSize` (and caps both with `maxFontSizeMultiplier`). Handing it an
 * already-scaled value therefore scaled it TWICE: at 200% the box reserved
 * 2 × 25pt while Android drew 2 × 37.5pt, and the second line of "Community"
 * ("nity") dropped out of the content box into the gesture-bar inset —
 * measured on the Android emulator at font_scale 2.0, ink rows 94px apart
 * where the model had reserved 65px.
 */
export const TAB_BAR_LABEL_LINE_HEIGHT = TAB_BAR_LABEL_FONT_SIZE * TAB_BAR_LINE_HEIGHT_RATIO;

/**
 * The height ONE line of the label occupies once the OS has scaled it — what
 * the bar has to reserve. This is `TAB_BAR_LABEL_LINE_HEIGHT` put through the
 * same cap the rendered label is given, so reserved and drawn agree.
 */
export function tabBarLabelLineHeight(fontScale: number): number {
  return Math.ceil(TAB_BAR_LABEL_LINE_HEIGHT * clampLabelFontScale(fontScale));
}

/**
 * Height of the bar's content, EXCLUDING the safe-area inset. `lines` comes
 * from `tabBarLabelLines`, which is what decides whether the label needs a
 * second line at this width and scale.
 */
export function tabBarContentHeight(fontScale: number, lines: number): number {
  const stack =
    TAB_BAR_VERTICAL_PADDING * 2 +
    TAB_BAR_INDICATOR_HEIGHT +
    TAB_BAR_GAP +
    TAB_BAR_ICON_SIZE +
    TAB_BAR_GAP +
    tabBarLabelLineHeight(fontScale) * Math.max(1, lines);
  return Math.max(TAB_BAR_MIN_HEIGHT, stack);
}

/** Total bar height. The gesture-bar inset is added here and nowhere else. */
export function tabBarHeight(fontScale: number, lines: number, bottomInset: number): number {
  return tabBarContentHeight(fontScale, lines) + Math.max(0, bottomInset);
}

/* ------------------------------------------------ tab bar: horizontal fit ---- */

/**
 * Width of one tab. Every tab takes an EQUAL share of the row (`flex: 1`), so
 * this is the width the label has to live inside — height alone never decided
 * whether a label is clipped.
 */
export function tabBarItemWidth(barWidth: number, tabCount: number): number {
  if (!Number.isFinite(barWidth) || barWidth <= 0 || tabCount <= 0) return 0;
  return barWidth / tabCount;
}

/** Width left for the glyphs, after the tab's own horizontal padding. */
export function tabBarLabelWidth(barWidth: number, tabCount: number): number {
  return Math.max(
    0,
    tabBarItemWidth(barWidth, tabCount) - TAB_BAR_ITEM_HORIZONTAL_PADDING * 2,
  );
}

/**
 * Advance width of every printable ASCII character in the label font, in em.
 *
 * Measured from the SHIPPED font binaries (`@expo-google-fonts/inter`
 * `500Medium` and `600SemiBold`, `hmtx` advances over the format-4 `cmap`,
 * divided by `unitsPerEm`) and kept at the wider of the two weights, because
 * the focused tab renders SemiBold and the rest render Medium.
 *
 * A per-character table is the whole point: a single "average glyph" ratio
 * cannot tell you where a word BREAKS. "Comm" is 3.169em — well over four
 * average glyphs — so an averaged model happily reports a fit that the device
 * tail-truncates.
 */
export const GLYPH_ADVANCE_EM: Readonly<Record<string, number>> = {
  '0': 0.66, '1': 0.423, '2': 0.624, '3': 0.637, '4': 0.667, '5': 0.613, '6': 0.64, '7': 0.577,
  '8': 0.641, '9': 0.64, ' ': 0.267, '!': 0.322, '"': 0.523, '#': 0.644, '$': 0.651,
  '%': 1.005, '&': 0.663, "'": 0.326, '(': 0.374, ')': 0.374, '*': 0.54, '+': 0.673,
  ',': 0.319, '-': 0.466, '.': 0.319, '/': 0.379, ':': 0.319, ';': 0.33, '<': 0.673,
  '=': 0.673, '>': 0.673, '?': 0.544, '@': 1, A: 0.728, B: 0.66, C: 0.737, D: 0.723, E: 0.606,
  F: 0.59, G: 0.75, H: 0.746, I: 0.277, J: 0.58, K: 0.704, L: 0.566, M: 0.923, N: 0.76,
  O: 0.769, P: 0.646, Q: 0.773, R: 0.653, S: 0.651, T: 0.661, U: 0.741, V: 0.728, W: 1.021,
  X: 0.72, Y: 0.714, Z: 0.653, '[': 0.374, '\\': 0.379, ']': 0.374, '^': 0.482, _: 0.47,
  '`': 0.352, a: 0.575, b: 0.625, c: 0.583, d: 0.625, e: 0.592, f: 0.389, g: 0.626, h: 0.613,
  i: 0.262, j: 0.262, k: 0.57, l: 0.262, m: 0.901, n: 0.612, o: 0.609, p: 0.625, q: 0.625,
  r: 0.397, s: 0.55, t: 0.354, u: 0.613, v: 0.587, w: 0.84, x: 0.569, y: 0.589, z: 0.566,
  '{': 0.455, '|': 0.359, '}': 0.455, '~': 0.673,
};

/** Widest glyph in the table — what an unmeasured character is charged. */
export const FALLBACK_GLYPH_ADVANCE_EM = 1.021;

/** Advance of one character, in em. Unknown characters pay the widest one. */
export function glyphAdvanceEm(char: string): number {
  return GLYPH_ADVANCE_EM[char] ?? FALLBACK_GLYPH_ADVANCE_EM;
}

/** Advance of a whole string, in em. */
export function textAdvanceEm(text: string): number {
  let total = 0;
  for (const char of text) total += glyphAdvanceEm(char);
  return total;
}

/** Rendered width of `label` at `fontScale`, in points. */
export function labelAdvanceWidth(label: string, fontSize: number, fontScale: number): number {
  return textAdvanceEm(label) * fontSize * clampFontScale(fontScale);
}

/** The longest of `labels` by rendered width (not by character count). */
export function widestLabel(labels: readonly string[]): string {
  return labels.reduce(
    (widest, label) => (textAdvanceEm(label) > textAdvanceEm(widest) ? label : widest),
    labels[0] ?? '',
  );
}

/**
 * Sub-point slack subtracted from a line box before comparing advances.
 *
 * Both platforms round a measured run up to a device pixel, so a label that
 * comes within a fraction of a point of the edge is a coin flip; half a point
 * at the 3x densities we ship on is ~1.5 pixels of headroom.
 */
export const LABEL_FIT_SLACK = 0.5;

/** Width one LINE of the label actually gets, after padding and slack. */
export function tabBarLabelLineWidth(barWidth: number, tabCount: number): number {
  return Math.max(0, tabBarLabelWidth(barWidth, tabCount) - LABEL_FIT_SLACK);
}

/**
 * Greedy line breaking, the way the platforms do it: fill a line word by word,
 * and break a word that is wider than the whole line by CHARACTER rather than
 * letting it overflow.
 *
 * This is the part the old model got wrong. It compared the label's total
 * advance to `lines × lineWidth`, which assumes a word can be poured into the
 * two lines with no wasted width. Text does not work that way: "Community" at
 * 24pt only ever splits at a character boundary, so 134pt of glyphs do not fit
 * two 74pt lines — they need three.
 */
export function wrapLabel(label: string, lineWidth: number, fontSize: number): string[] {
  const width = (text: string) => textAdvanceEm(text) * fontSize;
  const lines: string[] = [];
  let current = '';

  for (const word of label.split(' ')) {
    const candidate = current ? `${current} ${word}` : word;
    if (width(candidate) <= lineWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    let rest = word;
    while (width(rest) > lineWidth) {
      let take = 0;
      while (take < rest.length && width(rest.slice(0, take + 1)) <= lineWidth) take += 1;
      // A single glyph wider than the line still has to go somewhere.
      if (take === 0) take = 1;
      lines.push(rest.slice(0, take));
      rest = rest.slice(take);
    }
    current = rest;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

/** How many lines `label` needs inside one tab at this width and font scale. */
export function tabBarLabelLineCount(
  barWidth: number,
  tabCount: number,
  fontScale: number,
  label: string,
): number {
  const fontSize = TAB_BAR_LABEL_FONT_SIZE * clampLabelFontScale(fontScale);
  return wrapLabel(label, tabBarLabelLineWidth(barWidth, tabCount), fontSize).length;
}

/**
 * How many lines the label box reserves.
 *
 * Derived from the DISCRETE fit against the real bar width, not from a bare
 * "the member scaled text at all" threshold: on a 412pt phone "Community"
 * still fits one 78.4pt line at 105% (69pt), and giving it two lines there cost
 * 19pt of a 640pt-tall screen for nothing.
 */
export function tabBarLabelLines(
  fontScale: number,
  barWidth: number,
  tabCount: number,
  longestLabel: string,
): 1 | 2 {
  return tabBarLabelLineCount(barWidth, tabCount, fontScale, longestLabel) <= 1
    ? 1
    : TAB_BAR_MAX_LABEL_LINES;
}

/**
 * The largest font scale at which `label` still fits ONE tab line.
 *
 * Two lines are not free: text wrapping is DISCRETE and a tab label is a
 * single word, so the only place "Community" can break is BETWEEN LETTERS. At
 * font_scale 2.0 the Android emulator rendered it as "Commu" / "nity" while
 * the other four tabs stayed on one line, which reads as a rendering fault
 * rather than as large text.
 *
 * So the label grows only as far as its own tab is wide. On the phones we
 * ship on that is ~101% (360pt), ~110% (390pt) and ~116% (412pt) — modest, but
 * it is the whole word on one line at every OS text size, and the full name is
 * in the tab's `accessibilityLabel` for anyone who needs it read out.
 *
 * Never below 1 and never above `TAB_BAR_LABEL_MAX_FONT_SCALE`: a bar too
 * narrow to hold the label at its BASE size still needs the two-line box, and
 * shrinking a tab label below 12pt would be its own accessibility defect.
 */
export function tabBarLabelFitScale(barWidth: number, tabCount: number, label: string): number {
  const advanceEm = textAdvanceEm(label);
  if (advanceEm <= 0) return TAB_BAR_LABEL_MAX_FONT_SCALE;
  const fits =
    tabBarLabelLineWidth(barWidth, tabCount) / (advanceEm * TAB_BAR_LABEL_FONT_SIZE);
  return Math.max(1, Math.min(TAB_BAR_LABEL_MAX_FONT_SCALE, fits));
}

/**
 * Does the longest tab label still fit its tab at this font scale?
 *
 * The label box is at most `TAB_BAR_MAX_LABEL_LINES` line boxes tall and
 * `tabBarLabelWidth(...)` wide, and the label is tail-truncated, so a label
 * that greedy-wraps onto a third line is CLIPPED — which is precisely the
 * acceptance criterion "labels never clipped at 200% font scale". Vertical
 * geometry (`tabBarContentHeight`) cannot see this, which is why it lives here.
 */
export function tabBarLabelFits(
  barWidth: number,
  tabCount: number,
  fontScale: number,
  longestLabel: string,
): boolean {
  return (
    tabBarLabelLineCount(barWidth, tabCount, fontScale, longestLabel) <= TAB_BAR_MAX_LABEL_LINES
  );
}

/* --------------------------------------------------------------- titles ---- */

/**
 * Lines a TITLE may wrap onto before it is allowed to tail-truncate.
 *
 * Two was not enough. A workout block is named by its coach, and the real
 * plans carry names like "Cardio in Place — Foundation & Technique": at the h1
 * size, on a 390pt phone, that is three lines, so the day screen's header read
 * "Cardio in Place — Foundation & …" and the member could not see which block
 * they had opened. A title is the one string on a screen that must never be
 * cut — everything else on the page is understood relative to it.
 */
export const TITLE_MAX_LINES = 3;

/**
 * The OS text size from which a title stops being clamped at all.
 *
 * A fixed line budget is a size budget in disguise: three lines of an h1 at
 * 100% is roughly one line at 300%, so keeping the clamp would reintroduce the
 * very truncation it exists to prevent for exactly the members who enlarged
 * the text. Past this point the title is allowed to be as tall as it needs —
 * the screen scrolls, and a tall heading is never as bad as a cut one.
 *
 * 1.3 is the same threshold the app already uses to stack rows (§9).
 */
export const TITLE_UNCLAMP_FONT_SCALE = 1.3;

/**
 * `numberOfLines` for a title at this OS text size: `TITLE_MAX_LINES`
 * normally, and `undefined` (no clamp, no ellipsis) once text is enlarged.
 */
export function titleLines(fontScale: number): number | undefined {
  if (!Number.isFinite(fontScale)) return TITLE_MAX_LINES;
  return fontScale >= TITLE_UNCLAMP_FONT_SCALE ? undefined : TITLE_MAX_LINES;
}

/* --------------------------------------------------------------- motion ---- */

export type PressFeedback = { opacity: number; transform: { scale: number }[] };

/** Press feedback that never shifts layout; scale is dropped under reduced motion. */
export function pressedStyle(pressed: boolean, reducedMotion: boolean): PressFeedback {
  if (!pressed) return { opacity: 1, transform: [{ scale: 1 }] };
  return {
    opacity: motion.pressOpacity,
    transform: [{ scale: reducedMotion ? 1 : motion.pressScale }],
  };
}

/** Animation duration, collapsed to 0 when the member asked for reduced motion. */
export function duration(ms: number, reducedMotion: boolean): number {
  return reducedMotion ? 0 : ms;
}

/* ------------------------------------------------------------- progress ---- */

export function clampProgress(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.max(0, Math.min(value, max));
}

/** Fraction 0..1 of a ring/bar. */
export function progressFraction(value: number, max: number): number {
  if (!Number.isFinite(max) || max <= 0) return 0;
  return clampProgress(value, max) / max;
}
