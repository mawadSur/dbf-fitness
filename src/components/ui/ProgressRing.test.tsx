import { screen, waitFor } from '@testing-library/react-native';
import { Animated } from 'react-native';

import { contrastRatio, UI_CONTRAST_MIN } from '../../theme/contrast';
import { darkTheme, lightTheme, type ThemeName } from '../../theme/tokens';
import { ProgressRing } from './ProgressRing';
import {
  BOTH_THEMES,
  INCLUDING_HIDDEN,
  colorsFor,
  flattenStyle,
  hostNodes,
  mockReducedMotion,
  renderInTheme,
  svgStrokes,
} from './testing';

const ring = () => screen.getByTestId('ring', INCLUDING_HIDDEN);

/** Every stroked circle under the ring, in document order: track, then arc. */
function circles() {
  return hostNodes(ring()).filter((node) => node.props?.stroke !== undefined && 'r' in (node.props ?? {}));
}

/**
 * react-native-svg normalises a length to a number or a `{ value }` box — and
 * folds a zero length to `null`, which is exactly the "ring is full" case, so
 * it has to be read as 0 rather than as a missing prop.
 */
function svgLength(value: unknown): number {
  if (value === null) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return Number((value as { value?: number } | undefined)?.value ?? Number.NaN);
}

/** How much of the arc is still empty: circumference = empty, 0 = full. */
function arcOffset(): number {
  return svgLength(circles()[1]?.props?.strokeDashoffset);
}

const circumference = (size = 120, stroke = 10) => 2 * Math.PI * ((size - stroke) / 2);

describe('ProgressRing', () => {
  afterEach(() => jest.restoreAllMocks());

  it('exposes a progressbar with the label, value and bounds', async () => {
    await renderInTheme(<ProgressRing value={5} max={30} label="Day streak" animate={false} testID="ring" />);
    expect(ring().props.accessibilityRole).toBe('progressbar');
    expect(ring().props.accessibilityLabel).toBe('Day streak 5 of 30');
    expect(ring().props.accessibilityValue).toEqual({ min: 0, max: 30, now: 5 });
  });

  it('clamps an out-of-range value into 0..max for the number and the a11y value', async () => {
    await renderInTheme(<ProgressRing value={99} max={30} label="Day streak" animate={false} testID="ring" />);
    expect(ring().props.accessibilityValue.now).toBe(30);
    expect(screen.getByText('30')).toBeTruthy();
    expect(screen.getByText('/ 30')).toBeTruthy();
  });

  it('clamps a negative value to zero rather than drawing a reversed arc', async () => {
    await renderInTheme(<ProgressRing value={-4} max={30} label="Day streak" animate={false} testID="ring" />);
    expect(ring().props.accessibilityValue.now).toBe(0);
    expect(screen.getByText('0')).toBeTruthy();
  });

  it('lets a caller replace the "/ max" caption', async () => {
    await renderInTheme(<ProgressRing value={5} max={30} label="Day streak" animate={false} valueCaption="days" />);
    expect(screen.getByText('days')).toBeTruthy();
    expect(screen.queryByText('/ 30')).toBeNull();
  });

  it('keeps the label in the accessible name even when it is visually hidden', async () => {
    await renderInTheme(
      <ProgressRing value={5} max={30} label="Day streak" animate={false} showLabel={false} testID="ring" />,
    );
    expect(screen.queryByText('Day streak')).toBeNull();
    expect(ring().props.accessibilityLabel).toBe('Day streak 5 of 30');
  });

  it('shows the label under the ring by default', async () => {
    await renderInTheme(<ProgressRing value={5} max={30} label="Day streak" animate={false} testID="ring" />);
    expect(screen.getByText('Day streak')).toBeTruthy();
  });

  it('hides the SVG from assistive tech so the ring is announced exactly once', async () => {
    await renderInTheme(<ProgressRing value={5} max={30} label="Day streak" animate={false} testID="ring" />);
    const svg = hostNodes(ring()).find((node) => node.props?.bbWidth !== undefined);
    expect(svg?.props?.accessibilityElementsHidden).toBe(true);
    expect(svg?.props?.importantForAccessibility).toBe('no-hide-descendants');
  });

  /**
   * At 0 the ring must be JUST ITS TRACK — no arc element at all.
   *
   * `strokeDashoffset === circumference` is not enough: the arc has
   * `strokeLinecap="round"`, and a round cap on a dash whose visible length has
   * collapsed to zero still paints its cap (react-native-svg's Android
   * renderer drew a brand dot at 12 o'clock). "You have not started" must not
   * render as "you have just started", so the element is not rendered.
   */
  describe('a value of 0 draws only the track', () => {
    it.each([
      ['a real zero', 0, 10],
      ['max of zero', 5, 0],
      ['a negative value', -3, 10],
    ])('renders one circle for %s', async (_case, value, max) => {
      await renderInTheme(
        <ProgressRing value={value} max={max} label="Empty" animate={false} testID="ring" />,
      );
      expect(ring().props.accessibilityValue.now).toBe(0);
      expect(circles()).toHaveLength(1);
      // The only stroke on screen is the track.
      expect(svgStrokes(ring())).toEqual([lightTheme.progressTrack.toUpperCase()]);
      // No second circle means no round cap that a renderer could paint as a dot.
      expect(circles()[0]?.props?.strokeLinecap).toBeUndefined();
    });

    it('brings the arc back as soon as there is progress', async () => {
      await renderInTheme(
        <ProgressRing value={1} max={10} label="Started" animate={false} testID="ring" />,
      );
      expect(circles()).toHaveLength(2);
      expect(arcOffset()).toBeLessThan(circumference());
    });
  });

  it('scales the ring geometry with the size and strokeWidth props', async () => {
    await renderInTheme(
      <ProgressRing value={5} max={30} label="Day streak" size={72} strokeWidth={6} animate={false} testID="ring" />,
    );
    expect(svgLength(circles()[0]?.props?.r)).toBeCloseTo((72 - 6) / 2, 5);
    expect(svgLength(circles()[1]?.props?.r)).toBeCloseTo((72 - 6) / 2, 5);
  });

  it.each(BOTH_THEMES)(
    'draws the progress arc over the progress track in the %s theme',
    async (scheme: ThemeName) => {
      await renderInTheme(
        <ProgressRing value={5} max={30} label="Day streak" animate={false} testID="ring" />,
        scheme,
      );
      const colors = colorsFor(scheme);
      const strokes = svgStrokes(ring());
      expect(strokes[0]).toBe(colors.progressTrack.toUpperCase());
      expect(strokes[1]).toBe(colors.progressArc.toUpperCase());
    },
  );

  /*
   * Regression: the arc used `brand` on a `sage` track — 2.47:1 in light and
   * 1.26:1 in dark, so a 5/30 ring and a 30/30 ring looked identical. The arc
   * is the only thing that says how far along you are, so it is a UI graphic
   * and owes 3:1 (SC 1.4.11).
   */
  it.each(BOTH_THEMES)('keeps the arc readable against its track in %s', (scheme: ThemeName) => {
    const colors = colorsFor(scheme);
    expect(contrastRatio(colors.progressArc, colors.progressTrack)).toBeGreaterThanOrEqual(
      UI_CONTRAST_MIN,
    );
  });

  describe('palette override', () => {
    /*
     * Regression: `app/(tabs)/index.tsx` still paints a hard-coded white page,
     * so in dark mode the themed ring drew #ECFDF5 on #FFFFFF (1.05:1) and the
     * streak number was invisible on the app's landing screen.
     */
    it('uses the given palette instead of the active theme, in every ink', async () => {
      await renderInTheme(
        <ProgressRing
          value={5}
          max={30}
          label="Day streak"
          animate={false}
          palette={lightTheme}
          testID="ring"
        />,
        'dark',
      );
      const strokes = svgStrokes(ring());
      expect(strokes[0]).toBe(lightTheme.progressTrack.toUpperCase());
      expect(strokes[1]).toBe(lightTheme.progressArc.toUpperCase());

      const ink = (text: string) => flattenStyle(screen.getByText(text).props.style).color;
      expect(ink('5')).toBe(lightTheme.text);
      expect(ink('/ 30')).toBe(lightTheme.textMuted);
      expect(ink('Day streak')).toBe(lightTheme.textSecondary);

      // ...and that ink is readable on the white page the legacy screen paints.
      expect(contrastRatio(lightTheme.text, lightTheme.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(lightTheme.textMuted, lightTheme.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(lightTheme.textSecondary, lightTheme.bg)).toBeGreaterThanOrEqual(4.5);
    });

    it('still follows the theme when no palette is given', async () => {
      await renderInTheme(
        <ProgressRing value={5} max={30} label="Day streak" animate={false} testID="ring" />,
        'dark',
      );
      expect(flattenStyle(screen.getByText('5').props.style).color).toBe(darkTheme.text);
    });
  });

  describe('animation', () => {
    it('starts empty and fills to the target, so the arc is animated not static', async () => {
      await renderInTheme(<ProgressRing value={30} max={30} label="Complete" testID="ring" />);
      // The first frames have barely moved the arc — it did NOT jump to full.
      // (A tolerance, not an equality: how many frames have run by now depends
      // on how loaded the machine is, and a flaky test is worse than a loose one.)
      expect(arcOffset()).toBeGreaterThan(circumference() * 0.75);
      // ...and it ends up completely filled.
      await waitFor(() => expect(arcOffset()).toBeCloseTo(0, 1));
    });

    it('settles at the right fraction of the way round for a partial value', async () => {
      await renderInTheme(<ProgressRing value={15} max={30} label="Half" testID="ring" />);
      await waitFor(() => expect(arcOffset()).toBeCloseTo(circumference() / 2, 1));
    });

    it('runs exactly one animation — a re-render with the same value does not restart it', async () => {
      const timing = jest.spyOn(Animated, 'timing');
      const view = await renderInTheme(
        <ProgressRing value={15} max={30} label="Half" testID="ring" />,
      );
      await waitFor(() => expect(arcOffset()).toBeCloseTo(circumference() / 2, 1));
      const runs = timing.mock.calls.length;
      expect(runs).toBe(1);
      view.rerender(<ProgressRing value={15} max={30} label="Half" testID="ring" />);
      expect(timing.mock.calls.length).toBe(runs);
    });

    it('jumps straight to the target when animate is off', async () => {
      await renderInTheme(
        <ProgressRing value={30} max={30} label="Complete" animate={false} testID="ring" />,
      );
      expect(arcOffset()).toBeCloseTo(0, 1);
    });

    it('snaps to the target under reduced motion instead of easing into it', async () => {
      mockReducedMotion(true);
      // `useReducedMotion` resolves asynchronously, so the preference arrives a
      // tick after mount; what matters is that the ring then SETS its value
      // rather than easing to it. Same assertion shape as the Skeleton test.
      const setValue = jest.spyOn(Animated.Value.prototype, 'setValue');
      await renderInTheme(<ProgressRing value={15} max={30} label="Half" testID="ring" />);
      await waitFor(() => expect(setValue).toHaveBeenCalledWith(0.5));
      expect(arcOffset()).toBeCloseTo(circumference() / 2, 1);
    });

    it('does not snap the value while motion is allowed — it eases there', async () => {
      const setValue = jest.spyOn(Animated.Value.prototype, 'setValue');
      await renderInTheme(<ProgressRing value={15} max={30} label="Half" testID="ring" />);
      expect(setValue).not.toHaveBeenCalledWith(0.5);
      await waitFor(() => expect(arcOffset()).toBeCloseTo(circumference() / 2, 1));
    });
  });

  /*
   * Regression: `Animated.createAnimatedComponent` FORCES `collapsable: false`
   * onto whatever it wraps, so the native view is never flattened. An SVG
   * `Circle` is not a native view, and react-native-svg spreads what it does
   * not recognise straight onto the node — so every mounted ring logged
   *
   *   Received `false` for a non-boolean attribute `collapsable`.
   *
   * on web, and the same complaint as a red LogBox toast on Android. The dev
   * gallery mounts three rings, so it popped a toast the moment it opened.
   * `ProgressRing` now wraps `Circle` to swallow the prop.
   */
  describe('the animated arc', () => {
    it('never passes `collapsable` down to the SVG circle', async () => {
      await renderInTheme(<ProgressRing value={15} max={30} label="Half" testID="ring" />);
      for (const circle of circles()) {
        expect(circle.props).not.toHaveProperty('collapsable');
      }
    });

    it('still animates, so the wrapper did not break the ref Animated drives', async () => {
      await renderInTheme(<ProgressRing value={15} max={30} label="Half" testID="ring" />);
      expect(circles()).toHaveLength(2);
      await waitFor(() => expect(arcOffset()).toBeCloseTo(circumference() / 2, 1));
    });
  });
});
