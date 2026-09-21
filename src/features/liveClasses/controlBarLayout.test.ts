import { shouldStackControls, STACK_FONT_SCALE, toggleWidthNeeded } from './controlBarLayout';

/** Footer inner width = screen width minus the 16pt gutter on each side. */
const inner = (screenWidth: number) => screenWidth - 32;

describe('shouldStackControls', () => {
  it('keeps the two toggles in a row on a 390pt and a 412pt phone', () => {
    expect(shouldStackControls(1, inner(390))).toBe(false);
    expect(shouldStackControls(1, inner(412))).toBe(false);
    expect(shouldStackControls(1, inner(1280))).toBe(false);
  });

  it('stacks on a 360pt phone, where "Camera off" cannot share the row', () => {
    // The measured advance is what proves this, not a guessed breakpoint.
    expect(toggleWidthNeeded(1) * 2 + 8).toBeGreaterThan(inner(360));
    expect(shouldStackControls(1, inner(360))).toBe(true);
  });

  it('keeps three controls in a row at default and mildly enlarged text', () => {
    expect(shouldStackControls(1)).toBe(false);
    expect(shouldStackControls(1.15)).toBe(false);
    expect(shouldStackControls(STACK_FONT_SCALE - 0.01)).toBe(false);
  });

  it('stacks from 130% upwards, including the 200% ceiling', () => {
    expect(shouldStackControls(STACK_FONT_SCALE)).toBe(true);
    expect(shouldStackControls(1.5)).toBe(true);
    expect(shouldStackControls(2)).toBe(true);
  });

  it('treats a missing or nonsense scale as the default row', () => {
    expect(shouldStackControls(Number.NaN)).toBe(false);
    expect(shouldStackControls(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
