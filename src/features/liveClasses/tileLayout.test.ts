import { computeContentWidth, computeTileLayout } from './tileLayout';

describe('computeTileLayout', () => {
  it('bounds a single tile to 40% of the window on a phone (390x844 -> 320 cap)', () => {
    const l = computeTileLayout({ count: 1, availableWidth: 358, windowHeight: 844 });
    expect(l.columns).toBe(1);
    expect(l.tileWidth).toBe(358);
    expect(l.tileHeight).toBe(201); // 16:9 of 358, below both caps
  });

  it('caps a single tile at 40% of a short window (360x640 -> 256)', () => {
    const l = computeTileLayout({ count: 1, availableWidth: 700, windowHeight: 640 });
    expect(l.tileHeight).toBe(256);
    expect(l.tileWidth).toBe(455); // keeps 16:9, not the full row
  });

  it('never exceeds 320pt on tall/wide screens (1280x900)', () => {
    const l = wideLayout();
    expect(l.tileHeight).toBeLessThanOrEqual(320);
    expect(l.tileWidth).toBeLessThanOrEqual(l.tileHeight * (16 / 9) + 1);
  });

  it('uses two columns for 2-4 participants', () => {
    for (const count of [2, 3, 4]) {
      const l = computeTileLayout({ count, availableWidth: 358, windowHeight: 844 });
      expect(l.columns).toBe(2);
      expect(l.tileWidth * 2 + 8).toBeLessThanOrEqual(358);
    }
  });

  it('uses three columns for 5+ only when wide', () => {
    expect(computeTileLayout({ count: 6, availableWidth: 358, windowHeight: 844 }).columns).toBe(2);
    expect(computeTileLayout({ count: 6, availableWidth: 688, windowHeight: 900 }).columns).toBe(3);
  });

  it('survives a zero width', () => {
    const l = computeTileLayout({ count: 1, availableWidth: 0, windowHeight: 800 });
    expect(l.tileHeight).toBeGreaterThan(0);
  });
});

function wideLayout() {
  return computeTileLayout({ count: 1, availableWidth: 688, windowHeight: 900 });
}

describe('computeContentWidth', () => {
  it('subtracts padding before the cap only on narrow windows', () => {
    expect(computeContentWidth(390, 720, 16)).toBe(358);
    expect(computeContentWidth(360, 720, 16)).toBe(328);
  });
  it('is the full 720 column on wide windows (no 32pt loss)', () => {
    expect(computeContentWidth(1280, 720, 16)).toBe(720);
  });
});
