import { contrastRatio, UI_CONTRAST_MIN } from '../../theme/contrast';
import { darkTheme, lightTheme, type ThemeName } from '../../theme/tokens';
import {
  frameDrawing,
  frameViewBox,
  keyFrameIndex,
  pictogramDrawing,
  pictogramPalette,
  STROKE,
} from './drawing';
import { VIEW_BOX_SIZE } from './geometry';
import { pictograms, PICTOGRAM_KEYS } from './pictograms';

describe('frameDrawing', () => {
  const drawing = frameDrawing(pictograms['push-up'].frames[0]);

  it('paints the ground first, the far side next and the head last', () => {
    expect(drawing.shapes.map((shape) => shape.role)).toEqual([
      'ground',
      'far',
      'far',
      'near',
      'near',
      'near',
      'near',
    ]);
    expect(drawing.shapes[drawing.shapes.length - 1].kind).toBe('circle');
  });

  it('draws the far limbs thinner than the near ones', () => {
    expect(STROKE.farLimb).toBeLessThan(STROKE.nearLimb);
    expect(STROKE.nearLimb).toBeLessThan(STROKE.torso);
  });

  it.each(PICTOGRAM_KEYS)('%s produces finite geometry for every frame', (key) => {
    const entry = pictogramDrawing(key);
    expect(entry.viewBox).toBe(VIEW_BOX_SIZE);
    expect(entry.frames).toHaveLength(pictograms[key].frames.length);
    for (const frame of entry.frames) {
      expect(frame.shapes.length).toBeGreaterThan(0);
      expect(frame.croppedViewBox).not.toMatch(/NaN|Infinity/);
      for (const shape of frame.shapes) {
        if (shape.kind === 'path') {
          expect(shape.d).not.toMatch(/NaN|Infinity/);
          expect(shape.width).toBeGreaterThan(0);
        } else {
          expect(shape.r).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('frameViewBox', () => {
  it('is square and contains the whole figure', () => {
    for (const key of PICTOGRAM_KEYS) {
      for (const pose of pictograms[key].frames) {
        const [x, y, width, height] = frameViewBox(pose).split(' ').map(Number);
        expect(width).toBeCloseTo(height, 5);
        expect(width).toBeGreaterThan(0);
        expect(width).toBeLessThanOrEqual(VIEW_BOX_SIZE + 12);
        expect(x).toBeGreaterThan(-VIEW_BOX_SIZE);
        expect(y).toBeGreaterThan(-VIEW_BOX_SIZE);
      }
    }
  });

  it('crops tighter than the full box for a figure that does not fill it', () => {
    const [, , width] = frameViewBox(pictograms.plank.frames[1]).split(' ').map(Number);
    expect(width).toBeLessThan(VIEW_BOX_SIZE);
  });
});

describe('keyFrameIndex', () => {
  it('picks the last frame, and copes with a single-frame pictogram', () => {
    expect(keyFrameIndex(3)).toBe(2);
    expect(keyFrameIndex(1)).toBe(0);
    expect(keyFrameIndex(0)).toBe(0);
  });
});

describe('pictogramPalette', () => {
  const themes: Record<ThemeName, typeof lightTheme> = { light: lightTheme, dark: darkTheme };

  it.each(['light', 'dark'] as ThemeName[])(
    'keeps the near-side figure at 3:1 on the %s panel',
    (scheme) => {
      const colors = themes[scheme];
      const palette = pictogramPalette(colors, scheme);
      // The hero panel is a bg -> bgSoft gradient, so both ends must clear it.
      for (const background of [colors.bg, colors.bgSoft]) {
        expect(contrastRatio(palette.near, background)).toBeGreaterThanOrEqual(UI_CONTRAST_MIN);
      }
    },
  );

  it.each(['light', 'dark'] as ThemeName[])(
    'keeps the far-side limbs at 3:1 on the %s panel once their opacity is applied',
    (scheme) => {
      const colors = themes[scheme];
      const palette = pictogramPalette(colors, scheme);
      for (const background of [colors.bg, colors.bgSoft]) {
        const effective = blend(palette.far, background, palette.farOpacity);
        expect(contrastRatio(effective, background)).toBeGreaterThanOrEqual(UI_CONTRAST_MIN);
      }
    },
  );

  it('keeps the two sides of the body distinguishable in both themes', () => {
    for (const scheme of ['light', 'dark'] as ThemeName[]) {
      const colors = themes[scheme];
      const palette = pictogramPalette(colors, scheme);
      const far = blend(palette.far, colors.bg, palette.farOpacity);
      expect(contrastRatio(palette.near, far)).toBeGreaterThan(1.5);
    }
  });

  it.each(['light', 'dark'] as ThemeName[])(
    'keeps the ground line visible at 3:1 on the %s panel',
    (scheme) => {
      // It was `borderSoft`: 1.23:1 in light and 1.97:1 in dark, i.e. a figure
      // floating in space for anyone with low vision.
      const colors = themes[scheme];
      const palette = pictogramPalette(colors, scheme);
      for (const background of [colors.bg, colors.bgSoft]) {
        const effective = blend(palette.ground, background, palette.groundOpacity);
        expect(contrastRatio(effective, background)).toBeGreaterThanOrEqual(UI_CONTRAST_MIN);
      }
    },
  );

  it('keeps the floor subordinate to the figure standing on it', () => {
    for (const scheme of ['light', 'dark'] as ThemeName[]) {
      const colors = themes[scheme];
      const palette = pictogramPalette(colors, scheme);
      const ground = blend(palette.ground, colors.bg, palette.groundOpacity);
      // The figure must out-contrast its own floor, or the drawing reads as a
      // line with a smudge above it.
      expect(contrastRatio(palette.near, colors.bg)).toBeGreaterThan(
        contrastRatio(ground, colors.bg),
      );
    }
  });

  it('uses the deep-emerald CTA in light and the brand green in dark', () => {
    expect(pictogramPalette(lightTheme, 'light').near).toBe(lightTheme.cta);
    expect(pictogramPalette(darkTheme, 'dark').near).toBe(darkTheme.brand);
    expect(pictogramPalette(lightTheme, 'light').farOpacity).toBe(1);
    expect(pictogramPalette(darkTheme, 'dark').farOpacity).toBeLessThan(1);
  });
});

/** `foreground` at `alpha` composited over `background`, as sRGB hex. */
function blend(foreground: string, background: string, alpha: number): string {
  const parse = (hex: string) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
  const [fr, fg, fb] = parse(foreground);
  const [br, bg, bb] = parse(background);
  const mix = (f: number, b: number) => Math.round(f * alpha + b * (1 - alpha));
  return `#${[mix(fr, br), mix(fg, bg), mix(fb, bb)]
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;
}
