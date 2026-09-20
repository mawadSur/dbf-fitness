import { layout, motion, space } from '../../theme/tokens';
import {
  BUTTON_HEIGHT,
  CONTENT_MAX_WIDTH,
  FALLBACK_GLYPH_ADVANCE_EM,
  MAX_FONT_SCALE,
  TAB_BAR_ICON_SIZE,
  TAB_BAR_INDICATOR_HEIGHT,
  TAB_BAR_INDICATOR_WIDTH,
  TAB_BAR_ITEM_HORIZONTAL_PADDING,
  TAB_BAR_LABEL_FONT_SIZE,
  TAB_BAR_LABEL_MAX_FONT_SCALE,
  TAB_BAR_MAX_LABEL_LINES,
  TAB_BAR_MIN_HEIGHT,
  bottomInsetPadding,
  clampFontScale,
  clampLabelFontScale,
  clampProgress,
  duration,
  fixedFooterPadding,
  glyphAdvanceEm,
  hitSlopFor,
  labelAdvanceWidth,
  minTouchTarget,
  pressedStyle,
  progressFraction,
  screenGutter,
  scrollBottomPadding,
  tabBarContentHeight,
  tabBarHeight,
  tabBarItemWidth,
  tabBarLabelFits,
  tabBarLabelLineCount,
  tabBarLabelLineHeight,
  tabBarLabelLineWidth,
  tabBarLabelLines,
  tabBarLabelWidth,
  textAdvanceEm,
  widestLabel,
  wrapLabel,
} from './layout';

describe('font scale', () => {
  it('never drops below 1 and never reserves past 200%', () => {
    expect(clampFontScale(0.5)).toBe(1);
    expect(clampFontScale(1)).toBe(1);
    expect(clampFontScale(1.6)).toBeCloseTo(1.6);
    expect(clampFontScale(3)).toBe(MAX_FONT_SCALE);
    expect(clampFontScale(Number.NaN)).toBe(1);
  });
});

describe('touch targets', () => {
  it('is 44 on iOS/web and 48 on Android', () => {
    expect(minTouchTarget('ios')).toBe(layout.minTouchTarget);
    expect(minTouchTarget('web')).toBe(layout.minTouchTarget);
    expect(minTouchTarget('android')).toBe(layout.minTouchTargetAndroid);
  });

  it('lifts every button size to the platform minimum with hitSlop', () => {
    for (const os of ['ios', 'android'] as const) {
      for (const size of ['sm', 'md', 'lg'] as const) {
        const height = BUTTON_HEIGHT[size];
        expect(height + hitSlopFor(height, os) * 2).toBeGreaterThanOrEqual(minTouchTarget(os));
      }
    }
  });

  it('adds no slop to a control that is already big enough', () => {
    expect(hitSlopFor(56, 'ios')).toBe(0);
    expect(hitSlopFor(48, 'android')).toBe(0);
  });
});

describe('screen geometry', () => {
  it('uses the wide gutter from 600dp', () => {
    expect(screenGutter(390)).toBe(layout.gutter);
    expect(screenGutter(412)).toBe(layout.gutter);
    expect(screenGutter(599)).toBe(layout.gutter);
    expect(screenGutter(600)).toBe(layout.gutterWide);
    expect(screenGutter(1280)).toBe(layout.gutterWide);
  });

  it('caps the content column at 640', () => {
    expect(CONTENT_MAX_WIDTH).toBe(640);
  });
});

describe('bottom insets are paid exactly once', () => {
  it('is skipped inside the tab shell and applied outside it', () => {
    expect(bottomInsetPadding(true, 34)).toBe(0);
    expect(bottomInsetPadding(false, 34)).toBe(34);
    expect(bottomInsetPadding(false, -5)).toBe(0);
  });

  it('gives a footer its base padding plus the inset only outside the tabs', () => {
    expect(fixedFooterPadding(true, 34)).toBe(space.lg);
    expect(fixedFooterPadding(false, 34)).toBe(space.lg + 34);
  });

  it('moves the inset from the scroll content to the footer when there is one', () => {
    // Outside the tabs, exactly one of the two pays the 34pt inset.
    expect(scrollBottomPadding(false, 34, false)).toBe(space.xl + 34);
    expect(scrollBottomPadding(false, 34, true)).toBe(space.xl);
    expect(scrollBottomPadding(false, 34, true) + fixedFooterPadding(false, 34)).toBe(
      space.xl + space.lg + 34,
    );
  });

  it('never pays the inset inside the tab shell, with or without a footer', () => {
    expect(scrollBottomPadding(true, 34, false)).toBe(space.xl);
    expect(scrollBottomPadding(true, 34, true)).toBe(space.xl);
    expect(fixedFooterPadding(true, 34)).toBe(space.lg);
  });
});

/** The five shipped tabs, and the phone widths the design system supports. */
const TAB_LABELS = ['Home', 'Workout', 'Food', 'Community', 'Profile'] as const;
const PHONE_WIDTHS = [360, 390, 412] as const;

describe('tab bar geometry', () => {
  it('decides the line count from the real tab width, not from "scaled at all"', () => {
    // 412pt phone: a tab gets 82.4pt, so "Community" (5.578em ≈ 69pt at 105%)
    // still fits ONE line — giving it two there cost 18pt of a 640pt screen.
    expect(tabBarLabelLines(1.05, 412, 5, 'Community')).toBe(1);
    expect(tabBarLabelLines(1.05, 390, 5, 'Community')).toBe(1);
    // 360pt phone: 68pt per tab, and 5.578em × 12.6pt = 70.3pt — it really
    // does need the second line there.
    expect(tabBarLabelLines(1.05, 360, 5, 'Community')).toBe(2);
  });

  it('keeps one line at 100% and never reserves more than two', () => {
    for (const width of PHONE_WIDTHS) {
      expect(tabBarLabelLines(0.8, width, 5, 'Community')).toBe(1);
      expect(tabBarLabelLines(1, width, 5, 'Community')).toBe(1);
      expect(tabBarLabelLines(2, width, 5, 'Community')).toBe(2);
      expect(tabBarLabelLines(4, width, 5, 'Community')).toBe(2);
    }
    // A tablet/web column is wide enough for one line at any scale.
    expect(tabBarLabelLines(2, 1280, 5, 'Community')).toBe(1);
  });

  it('scales the line height with the font scale, capped at the label maximum', () => {
    expect(tabBarLabelLineHeight(1)).toBe(Math.ceil(TAB_BAR_LABEL_FONT_SIZE * 1.35));
    expect(tabBarLabelLineHeight(1.5)).toBe(Math.ceil(TAB_BAR_LABEL_FONT_SIZE * 1.35 * 1.5));
    // The label stops growing at TAB_BAR_LABEL_MAX_FONT_SCALE, so the line box
    // it lives in stops there too — reserving 200% of height for 150% of text
    // is how the bar ended up 31% taller than it needed to be.
    expect(tabBarLabelLineHeight(2)).toBe(tabBarLabelLineHeight(TAB_BAR_LABEL_MAX_FONT_SCALE));
    expect(tabBarLabelLineHeight(4)).toBe(tabBarLabelLineHeight(2));
  });

  it('grows the bar so a scaled label is never clipped VERTICALLY', () => {
    const base = tabBarContentHeight(1, 1);
    const huge = tabBarContentHeight(2, 2);
    expect(base).toBeGreaterThanOrEqual(TAB_BAR_MIN_HEIGHT);
    expect(huge).toBeGreaterThan(base);
    // Room for the pill, the 24px icon, two label lines and the padding.
    const needed = TAB_BAR_INDICATOR_HEIGHT + TAB_BAR_ICON_SIZE + tabBarLabelLineHeight(2) * 2;
    expect(huge).toBeGreaterThanOrEqual(needed);
  });

  it('does not pay for a second line when the width did not ask for one', () => {
    // Regression: one notch of text scaling used to add a whole line box.
    expect(tabBarContentHeight(1.05, 1)).toBe(62);
    expect(tabBarContentHeight(1.05, 2)).toBe(80);
    expect(tabBarContentHeight(1.05, 1) - tabBarContentHeight(1, 1)).toBe(1);
  });

  it('adds the gesture-bar inset exactly once', () => {
    expect(tabBarHeight(1, 1, 0)).toBe(tabBarContentHeight(1, 1));
    expect(tabBarHeight(1, 1, 34)).toBe(tabBarContentHeight(1, 1) + 34);
    expect(tabBarHeight(2, 2, 34)).toBe(tabBarContentHeight(2, 2) + 34);
    expect(tabBarHeight(1, 1, -10)).toBe(tabBarContentHeight(1, 1));
  });

  /*
   * Height alone never decided whether a label is clipped: the label is a
   * tail-truncating box, so a bar that is tall enough can still render "Comm…".
   * These are the width maths the 200% criterion actually needs.
   */
  describe('horizontal fit', () => {
    const TAB_COUNT = 5;

    it('splits the bar into equal shares and survives nonsense input', () => {
      expect(tabBarItemWidth(390, TAB_COUNT)).toBe(78);
      expect(tabBarItemWidth(360, TAB_COUNT)).toBe(72);
      expect(tabBarItemWidth(0, TAB_COUNT)).toBe(0);
      expect(tabBarItemWidth(390, 0)).toBe(0);
      expect(tabBarItemWidth(Number.NaN, TAB_COUNT)).toBe(0);
    });

    it('takes the tab padding off the width the glyphs actually get', () => {
      expect(tabBarLabelWidth(390, TAB_COUNT)).toBe(78 - TAB_BAR_ITEM_HORIZONTAL_PADDING * 2);
      expect(tabBarLabelWidth(0, TAB_COUNT)).toBe(0);
    });

    it('measures a label from the shipped font, not from an average glyph', () => {
      // Inter 600SemiBold, from the .ttf that ships in the bundle.
      expect(textAdvanceEm('Community')).toBeCloseTo(5.578, 3);
      expect(textAdvanceEm('Home')).toBeCloseTo(2.848, 3);
      // An average-glyph model reads "Comm" as 4 × 0.62 = 2.48em; it is 3.17em,
      // which is why a continuous model gets the line BREAK wrong.
      expect(textAdvanceEm('Comm')).toBeGreaterThan(3.1);
      // Unknown characters are charged the widest glyph in the font.
      expect(glyphAdvanceEm('é')).toBe(FALLBACK_GLYPH_ADVANCE_EM);
    });

    it('grows the advance with the label length and the font scale', () => {
      const one = labelAdvanceWidth('Home', TAB_BAR_LABEL_FONT_SIZE, 1);
      expect(labelAdvanceWidth('Community', TAB_BAR_LABEL_FONT_SIZE, 1)).toBeGreaterThan(one);
      expect(labelAdvanceWidth('Home', TAB_BAR_LABEL_FONT_SIZE, 2)).toBeCloseTo(one * 2, 5);
      // Past 200% nothing is reserved, so nothing is estimated either.
      expect(labelAdvanceWidth('Home', TAB_BAR_LABEL_FONT_SIZE, 4)).toBeCloseTo(one * 2, 5);
    });

    it('picks the widest label by rendered width, not by character count', () => {
      // "Workout" is longer than "Profile" by one character and wider by four.
      expect(widestLabel([...TAB_LABELS])).toBe('Community');
      expect(widestLabel(['III', 'mm'])).toBe('mm');
      expect(widestLabel([])).toBe('');
    });

    /*
     * The bug this replaces: `available = lineWidth × lines` assumes a word can
     * be poured into two lines with no wasted width. It cannot — it breaks at a
     * character boundary, and the leftover width on line one is simply lost.
     */
    it('breaks a label greedily, by word and then by character', () => {
      expect(wrapLabel('Community', 200, 12)).toEqual(['Community']);
      expect(wrapLabel('Accountability Partners', 90, 12)).toEqual([
        'Accountability',
        'Partners',
      ]);
      // 24pt glyphs in a 74pt line: "Comm" is 76pt, so line one takes "Com"
      // and the rest cannot fit a single further line — three lines, i.e. the
      // device tail-truncates the second one. This is what a 200% label did.
      expect(wrapLabel('Community', tabBarLabelWidth(390, TAB_COUNT), 24)).toEqual([
        'Com',
        'munit',
        'y',
      ]);
      // At the label cap (18pt) the same word breaks into two clean lines.
      expect(wrapLabel('Community', tabBarLabelLineWidth(360, TAB_COUNT), 18)).toEqual([
        'Comm',
        'unity',
      ]);
    });

    it('fits every shipped tab label at 200% on every supported phone width', () => {
      for (const label of TAB_LABELS) {
        for (const width of PHONE_WIDTHS) {
          expect({ label, width, fits: tabBarLabelFits(width, TAB_COUNT, 2, label) }).toEqual({
            label,
            width,
            fits: true,
          });
          // …and the two reserved lines are what it actually uses.
          expect(tabBarLabelLineCount(width, TAB_COUNT, 2, label)).toBeLessThanOrEqual(
            TAB_BAR_MAX_LABEL_LINES,
          );
        }
      }
    });

    it('only fits at 200% BECAUSE the label stops scaling at 150%', () => {
      // Without the cap the very same check fails on both phones — this is the
      // false positive the continuous model used to certify.
      for (const width of [360, 390]) {
        const uncapped = wrapLabel(
          'Community',
          tabBarLabelLineWidth(width, TAB_COUNT),
          TAB_BAR_LABEL_FONT_SIZE * 2,
        );
        expect(uncapped.length).toBeGreaterThan(TAB_BAR_MAX_LABEL_LINES);
      }
      expect(TAB_BAR_LABEL_MAX_FONT_SCALE).toBeLessThan(MAX_FONT_SCALE);
      expect(clampLabelFontScale(2)).toBe(TAB_BAR_LABEL_MAX_FONT_SCALE);
      expect(clampLabelFontScale(1.2)).toBeCloseTo(1.2);
      expect(clampLabelFontScale(0.5)).toBe(1);
    });

    it('reports a label that does NOT fit, so the check is not vacuous', () => {
      expect(tabBarLabelFits(390, TAB_COUNT, 2, 'Accountability Partners')).toBe(false);
      expect(tabBarLabelFits(390, TAB_COUNT, 2, 'Community')).toBe(true);
      // One line would clip "Community" above ~110%; the second line buys it back.
      expect(tabBarLabelLines(1.4, 390, TAB_COUNT, 'Community')).toBe(2);
      expect(tabBarLabelFits(390, TAB_COUNT, 1.4, 'Community')).toBe(true);
    });

    it('fits every shipped label at EVERY scale from 100% to 200%', () => {
      for (const label of TAB_LABELS) {
        for (const width of PHONE_WIDTHS) {
          for (let scale = 1; scale <= 2.0001; scale += 0.05) {
            const rounded = Math.round(scale * 100) / 100;
            expect({
              label,
              width,
              scale: rounded,
              fits: tabBarLabelFits(width, TAB_COUNT, rounded, label),
            }).toEqual({ label, width, scale: rounded, fits: true });
          }
        }
      }
    });
  });

  it('uses the documented pill and icon sizes', () => {
    expect([TAB_BAR_INDICATOR_WIDTH, TAB_BAR_INDICATOR_HEIGHT]).toEqual([32, 4]);
    expect(TAB_BAR_ICON_SIZE).toBe(24);
    expect(TAB_BAR_LABEL_FONT_SIZE).toBe(12);
  });
});

describe('press feedback', () => {
  it('dims and scales without shifting layout', () => {
    expect(pressedStyle(false, false)).toEqual({ opacity: 1, transform: [{ scale: 1 }] });
    expect(pressedStyle(true, false)).toEqual({
      opacity: motion.pressOpacity,
      transform: [{ scale: motion.pressScale }],
    });
  });

  it('drops the scale but keeps the dim under reduced motion', () => {
    expect(pressedStyle(true, true)).toEqual({
      opacity: motion.pressOpacity,
      transform: [{ scale: 1 }],
    });
  });

  it('collapses every duration to 0 under reduced motion', () => {
    expect(duration(motion.progressRing, false)).toBe(motion.progressRing);
    expect(duration(motion.progressRing, true)).toBe(0);
  });
});

describe('progress maths', () => {
  it('clamps into range and survives nonsense input', () => {
    expect(clampProgress(5, 30)).toBe(5);
    expect(clampProgress(99, 30)).toBe(30);
    expect(clampProgress(-4, 30)).toBe(0);
    expect(clampProgress(5, 0)).toBe(0);
    expect(clampProgress(Number.NaN, 30)).toBe(0);
  });

  it('turns a value into a 0..1 fraction', () => {
    expect(progressFraction(15, 30)).toBe(0.5);
    expect(progressFraction(0, 30)).toBe(0);
    expect(progressFraction(99, 30)).toBe(1);
    expect(progressFraction(5, 0)).toBe(0);
  });
});
