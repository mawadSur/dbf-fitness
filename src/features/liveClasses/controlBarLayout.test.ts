import {
  CONTROL_GAP,
  controlBarRows,
  controlWidthNeeded,
  shouldStackControls,
  STACK_FONT_SCALE,
} from './controlBarLayout';

/** Footer inner width = screen width minus the 16pt gutter on each side. */
const inner = (screenWidth: number) => screenWidth - 32;

describe('controlBarRows', () => {
  it('fits all three controls on ONE row from 360pt up', () => {
    // The regression this file exists for: the old labelled-Button bar took two
    // rows at 390pt and three at 360pt, pushing the video stage below the fold.
    expect(controlBarRows(1, inner(360))).toBe(1);
    expect(controlBarRows(1, inner(390))).toBe(1);
    expect(controlBarRows(1, inner(412))).toBe(1);
    expect(controlBarRows(1, inner(1280))).toBe(1);
  });

  it('measures the fit from the shipped glyph advances, not a guessed breakpoint', () => {
    const three = controlWidthNeeded(1) * 3 + CONTROL_GAP * 2;
    expect(three).toBeLessThanOrEqual(inner(360));
  });

  it('still fits one row at 130% text on a 360pt phone', () => {
    expect(controlBarRows(STACK_FONT_SCALE, inner(360))).toBe(1);
    expect(shouldStackControls(STACK_FONT_SCALE, inner(360))).toBe(false);
  });

  it('never needs more than TWO rows at 360pt, even at the 200% ceiling', () => {
    expect(controlBarRows(2, inner(360))).toBe(2);
    expect(controlBarRows(2, inner(390))).toBeLessThanOrEqual(2);
    // 200% on a wide phone still keeps Leave beside the toggles is not required,
    // but it must never fall back to one control per row.
    expect(controlBarRows(2, inner(412))).toBeLessThanOrEqual(2);
  });

  it('drops Leave below the toggles rather than stacking everything', () => {
    expect(controlBarRows(2, inner(360))).toBe(2);
  });

  it('assumes a 360pt phone when the width cannot be measured', () => {
    expect(controlBarRows(1)).toBe(1);
    expect(controlBarRows(2)).toBe(2);
  });

  it('treats a nonsense scale as the default row', () => {
    expect(controlBarRows(Number.NaN, inner(360))).toBe(1);
    expect(controlBarRows(Number.POSITIVE_INFINITY, inner(360))).toBe(1);
    expect(controlBarRows(0, inner(360))).toBe(1);
  });

  it('charges more width as text grows', () => {
    expect(controlWidthNeeded(2)).toBeGreaterThan(controlWidthNeeded(1));
  });
});
