import { space, typeScale } from '../../theme/tokens';
import { MAX_FONT_SCALE, screenGutter, CONTENT_MAX_WIDTH } from '../ui/layout';
import {
  DAY_NUMBER_ADVANCE_EM,
  DAY_NUMBER_CHROME,
  dayNumberMaxFontScale,
  shouldStack,
  STACK_FONT_SCALE,
  WIDEST_DIGIT_EM,
} from './fontScale';

describe('shouldStack', () => {
  it('keeps the row up to the threshold and gives it up past it', () => {
    expect(shouldStack(1)).toBe(false);
    expect(shouldStack(STACK_FONT_SCALE - 0.01)).toBe(false);
    expect(shouldStack(STACK_FONT_SCALE)).toBe(true);
    expect(shouldStack(2)).toBe(true);
  });
});

/** The width one month-grid column really gets inside a `ScreenShell`. */
function cellWidth(screenWidth: number): number {
  return (Math.min(screenWidth, CONTENT_MAX_WIDTH) - screenGutter(screenWidth) * 2) / 7;
}

/** Points the day number draws at, at a given OS font scale. */
function drawnWidth(scale: number): number {
  return DAY_NUMBER_ADVANCE_EM * typeScale.bodySmMedium.fontSize * scale;
}

describe('dayNumberMaxFontScale', () => {
  it('charges two of the widest digit plus the cell chrome', () => {
    expect(WIDEST_DIGIT_EM).toBeGreaterThan(0.6);
    expect(DAY_NUMBER_ADVANCE_EM).toBe(WIDEST_DIGIT_EM * 2);
    // 2pt selection border each side + the pill's own space.xs each side.
    expect(DAY_NUMBER_CHROME).toBe(4 + space.xs * 2);
  });

  /**
   * The defect: at font_scale 2.0 on the Android emulator 10, 11, 12 and 13
   * each rendered as a stacked "1" over "0"/"1"/"2"/"3" — React Native broke
   * two-digit days BETWEEN THE DIGITS because a 1/7 column cannot grow.
   */
  it.each([360, 390, 412, 1280])('keeps a two-digit day inside its %ipt-wide screen', (width) => {
    const scale = dayNumberMaxFontScale(cellWidth(width));
    expect(drawnWidth(scale)).toBeLessThanOrEqual(cellWidth(width) - DAY_NUMBER_CHROME);
  });

  it('still lets the number grow on the phones we ship on', () => {
    // Not a disguised "no scaling at all": every supported width gets well
    // past 150%, and the two biggest go the full 200%.
    expect(dayNumberMaxFontScale(cellWidth(360))).toBeGreaterThan(1.5);
    expect(dayNumberMaxFontScale(cellWidth(390))).toBe(MAX_FONT_SCALE);
    expect(dayNumberMaxFontScale(cellWidth(412))).toBe(MAX_FONT_SCALE);
  });

  it('never caps below 100% and never past the app-wide maximum', () => {
    expect(dayNumberMaxFontScale(0)).toBe(1);
    expect(dayNumberMaxFontScale(-50)).toBe(1);
    expect(dayNumberMaxFontScale(Number.NaN)).toBe(1);
    expect(dayNumberMaxFontScale(10_000)).toBe(MAX_FONT_SCALE);
  });

  it('is monotonic: a wider column never allows less', () => {
    const scales = [200, 300, 400, 500, 600].map(dayNumberMaxFontScale);
    for (let i = 1; i < scales.length; i += 1) {
      expect(scales[i]).toBeGreaterThanOrEqual(scales[i - 1]);
    }
  });
});
