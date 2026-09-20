import { screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { tokens } from '../../theme/tokens';
import {
  HeroPanel,
  heroBackdropSize,
  HERO_DOT_OPACITY,
  HERO_DOT_RADIUS,
  HERO_DOT_SPACING,
} from './HeroPanel';
import { Text } from './Typography';
import {
  colorsFor,
  flattenStyle,
  gradientStops,
  hostNodes,
  INCLUDING_HIDDEN,
  layoutTo,
  renderInTheme,
  svgColorToHex,
} from './testing';

/** A phone-width panel: 390 − 16 gutters, tall enough for a heading and a line. */
const PANEL = { width: 358, height: 244 } as const;

const HERO = (
  <HeroPanel>
    <Text>Transform your body and mind</Text>
  </HeroPanel>
);

/**
 * Renders the panel and delivers the layout pass Jest never performs.
 *
 * The backdrop is drawn at the panel's MEASURED size (see `HeroPanel`), so a
 * test that never reports a box is testing the unmeasured state.
 */
async function renderHero(ui: ReactElement = HERO, scheme: 'light' | 'dark' = 'light') {
  const view = await renderInTheme(ui, scheme);
  await layoutTo(screen.getByTestId('hero-panel'), PANEL.width, PANEL.height);
  return view;
}

function backdrop() {
  return screen.getByTestId('hero-panel-background', INCLUDING_HIDDEN);
}

function stopColors(): string[] {
  return gradientStops(backdrop());
}

/**
 * The two full-bleed rects: the gradient wash and the dot texture over it.
 *
 * Matched by host type, NOT by "has a width and a height" — the canvas itself
 * (`RNSVGSvgView`, 358×244) and the dot `RNSVGPattern` (24×24, the tile size)
 * both carry those props too, so the loose filter returned four nodes and
 * asserted the pattern tile was panel-sized.
 */
function washRects() {
  return hostNodes(backdrop()).filter((node) => node.type === 'RNSVGRect');
}

describe('HeroPanel', () => {
  it('renders its children', async () => {
    await renderHero();
    expect(screen.getByText('Transform your body and mind')).toBeTruthy();
  });

  it('is a radius-16 panel that clips its backdrop', async () => {
    await renderHero();
    const style = flattenStyle(screen.getByTestId('hero-panel').props.style);
    expect(style.borderRadius).toBe(tokens.radii.xl);
    expect(style.overflow).toBe('hidden');
  });

  it('takes the roomy 24 padding by default and the compact 16 on request', async () => {
    await renderHero(
      <HeroPanel padding={16}>
        <Text>Hi</Text>
      </HeroPanel>,
    );
    expect(flattenStyle(screen.getByTestId('hero-panel').props.style).padding).toBe(16);
  });

  it('hides the decorative backdrop from screen readers', async () => {
    await renderHero();
    expect(backdrop().props?.accessibilityElementsHidden).toBe(true);
    expect(screen.queryByTestId('hero-panel-background')).toBeNull();
  });

  it('fades from bg to bg-soft in the light theme', async () => {
    await renderHero(HERO, 'light');
    expect(stopColors()).toEqual([colorsFor('light').bg, colorsFor('light').bgSoft]);
  });

  it('fades from bg to bg-soft in the dark theme', async () => {
    await renderHero(HERO, 'dark');
    expect(stopColors()).toEqual([colorsFor('dark').bg, colorsFor('dark').bgSoft]);
  });

  it('textures the panel with sage dots at 6%', async () => {
    await renderHero(HERO, 'light');
    const dot = hostNodes(backdrop()).find((node) => node.props?.fillOpacity !== undefined);
    expect(dot?.props?.fillOpacity).toBe(HERO_DOT_OPACITY);
    expect(dot?.props?.r).toBe(HERO_DOT_RADIUS);
    expect(svgColorToHex(dot?.props?.fill)).toBe(colorsFor('light').sage);
  });

  it('keeps the dot texture sparse enough to stay decorative', () => {
    expect(HERO_DOT_OPACITY).toBeLessThanOrEqual(0.06);
    expect(HERO_DOT_SPACING).toBeGreaterThanOrEqual(HERO_DOT_RADIUS * 8);
  });
});

/**
 * The Android half-painted-panel regression.
 *
 * Shipped shape: an absolutely positioned `<Svg width="100%" height="100%">`
 * with two `<Rect width="100%" height="100%">`. On a real Android emulator
 * react-native-svg resolved those percentages against something other than the
 * laid-out box, so the gradient and the dots covered only ~82% of the panel's
 * width and ~48% of its height and the rest of the card stayed bare page
 * background; iOS and web looked right. Percentages are therefore banned here:
 * the canvas and both rects must carry the MEASURED numbers.
 */
describe('HeroPanel backdrop covers the whole measured panel', () => {
  it('draws nothing until the panel has been measured', async () => {
    await renderInTheme(HERO);
    expect(screen.queryByTestId('hero-panel-background', INCLUDING_HIDDEN)).toBeNull();
  });

  it('sizes the canvas in numbers, never percentages', async () => {
    await renderHero();
    const svg = backdrop();
    expect(svg.props.bbWidth).toBe(PANEL.width);
    expect(svg.props.bbHeight).toBe(PANEL.height);
    expect(svg.props.vbWidth).toBe(PANEL.width);
    expect(svg.props.vbHeight).toBe(PANEL.height);

    // Every scalar prop on the canvas, checked for a percentage. `svg.props`
    // also holds children and a context value, so it cannot be JSON.stringify'd
    // (circular) — only the primitives are inspected.
    for (const [key, value] of Object.entries(svg.props)) {
      if (typeof value === 'string' || typeof value === 'number') {
        expect(`${key}=${value}`).not.toContain('%');
      }
    }
  });

  it('paints both layers edge to edge at the measured size', async () => {
    await renderHero();
    const rects = washRects();
    expect(rects).toHaveLength(2);
    for (const rect of rects) {
      // Numbers, not `"100%"` — the percentages are what Android mis-resolved.
      expect(typeof rect.props?.width).toBe('number');
      expect(typeof rect.props?.height).toBe('number');
      expect(rect.props?.width).toBe(PANEL.width);
      expect(rect.props?.height).toBe(PANEL.height);
    }
  });

  it('redraws at the new size when the panel is re-measured', async () => {
    await renderHero();
    await layoutTo(screen.getByTestId('hero-panel'), 720, 300);
    expect(backdrop().props.bbWidth).toBe(720);
    for (const rect of washRects()) expect(rect.props?.width).toBe(720);
  });

  it('refuses to draw a degenerate box', () => {
    expect(heroBackdropSize(null)).toBeNull();
    expect(heroBackdropSize({ width: 0, height: 244 })).toBeNull();
    expect(heroBackdropSize({ width: 358, height: 0 })).toBeNull();
    expect(heroBackdropSize({ width: -1, height: -1 })).toBeNull();
    expect(heroBackdropSize(PANEL)).toEqual(PANEL);
  });
});
