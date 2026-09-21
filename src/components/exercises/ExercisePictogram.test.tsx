import { screen } from '@testing-library/react-native';

import { pictogramPalette } from '../../features/exercises/drawing';
import { pictograms, PICTOGRAM_KEYS } from '../../features/exercises/pictograms';
import type { ThemeName } from '../../theme/tokens';
import {
  BOTH_THEMES,
  colorsFor,
  flattenStyle,
  INCLUDING_HIDDEN,
  layoutTo,
  renderInTheme,
  svgFills,
  svgStrokes,
} from '../ui/testing';
import { ExercisePictogram, HERO_MAX_WIDTH, THUMB_SIZE } from './ExercisePictogram';

describe('ExercisePictogram — hero', () => {
  it('names the drawing for a screen reader with the full alt sentence', async () => {
    await renderInTheme(<ExercisePictogram name="Push-Ups" variant="hero" />);
    const image = screen.getByRole('image');
    expect(image.props.accessibilityLabel).toBe(`Illustration: ${pictograms['push-up'].alt}`);
    expect(image.props.accessibilityLabel).toMatch(/elbows are bent about 90 degrees/);
  });

  it('draws one frame per pose with a step number and an arrow between them', async () => {
    await renderInTheme(
      <ExercisePictogram name="Burpees" variant="hero" />,
      'light',
    );
    expect(pictograms.burpee.frames).toHaveLength(3);
    expect(screen.getByTestId('exercise-pictogram-frame-0', INCLUDING_HIDDEN)).toBeTruthy();
    expect(screen.getByTestId('exercise-pictogram-frame-2', INCLUDING_HIDDEN)).toBeTruthy();
    expect(screen.queryByTestId('exercise-pictogram-frame-3', INCLUDING_HIDDEN)).toBeNull();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    // Two arrows for three frames.
    expect(screen.getAllByTestId('icon-chevron-right', INCLUDING_HIDDEN)).toHaveLength(2);
  });

  it('never stretches past the 640 content width', async () => {
    await renderInTheme(<ExercisePictogram name="Plank Hold" variant="hero" />);
    expect(flattenStyle(screen.getByTestId('exercise-pictogram-hero').props.style).maxWidth).toBe(
      HERO_MAX_WIDTH,
    );
  });

  it('shrinks the frames to the measured panel, so nothing overflows a 360pt screen', async () => {
    await renderInTheme(
      <ExercisePictogram name="Burpees" variant="hero" />,
    );
    // 360 screen - 16 gutter each side - 16 panel padding each side.
    await layoutTo(screen.getByRole('image'), 296, 120);
    const frame = screen.getByTestId('exercise-pictogram-frame-0', INCLUDING_HIDDEN);
    expect(frame.props.width).toBeLessThanOrEqual(296 / 3);
    expect(frame.props.width).toBeGreaterThan(0);
  });

  it.each(BOTH_THEMES)('uses only theme colours in %s', async (scheme: ThemeName) => {
    const colors = colorsFor(scheme);
    const palette = pictogramPalette(colors, scheme);
    await renderInTheme(
      <ExercisePictogram name="Bodyweight Squats" variant="hero" />,
      scheme,
    );
    const frame = screen.getByTestId('exercise-pictogram-frame-0', INCLUDING_HIDDEN);
    const allowed = new Set([palette.near, palette.far, palette.ground].map((c) => c.toUpperCase()));
    for (const stroke of svgStrokes(frame)) {
      if (stroke) expect(allowed).toContain(stroke.toUpperCase());
    }
    for (const fill of svgFills(frame)) {
      if (fill && fill !== '#000000') expect(allowed).toContain(fill.toUpperCase());
    }
  });

  it('hides the individual frames from assistive tech (the wrapper is the image)', async () => {
    await renderInTheme(<ExercisePictogram name="Plank Hold" variant="hero" />);
    const frame = screen.getByTestId('exercise-pictogram-frame-0', INCLUDING_HIDDEN);
    expect(frame.props.accessibilityElementsHidden ?? frame.props['aria-hidden']).toBeTruthy();
  });
});

describe('ExercisePictogram — thumb', () => {
  it('is a 56pt tile and is decorative, because the name sits beside it', async () => {
    await renderInTheme(
      <ExercisePictogram name="Mountain Climbers" variant="thumb" />,
    );
    const tile = screen.getByTestId('exercise-pictogram-thumb', INCLUDING_HIDDEN);
    const style = flattenStyle(tile.props.style);
    expect(style.width).toBe(THUMB_SIZE);
    expect(style.height).toBe(THUMB_SIZE);
    expect(style.borderRadius).toBe(12);
    expect(tile.props.accessibilityElementsHidden).toBe(true);
    expect(tile.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('shows the key frame, cropped to the figure', async () => {
    await renderInTheme(
      <ExercisePictogram name="Push-Ups" variant="thumb" />,
    );
    const frame = screen.getByTestId('exercise-pictogram-frame-0', INCLUDING_HIDDEN);
    expect(frame.props.viewBox).not.toBe('0 0 100 100');
    // A thumbnail is one frame, never the sequence.
    expect(screen.queryByTestId('exercise-pictogram-frame-1', INCLUDING_HIDDEN)).toBeNull();
  });

  it.each(BOTH_THEMES)('sits on a themed tile in %s', async (scheme: ThemeName) => {
    const colors = colorsFor(scheme);
    await renderInTheme(
      <ExercisePictogram name="Plank Hold" variant="thumb" />,
      scheme,
    );
    const style = flattenStyle(screen.getByTestId('exercise-pictogram-thumb', INCLUDING_HIDDEN).props.style);
    expect(style.backgroundColor).toBe(colors.bgSoft);
    expect(style.borderColor).toBe(colors.borderSoft);
  });
});

describe('ExercisePictogram — unknown names', () => {
  it('falls back to a category drawing rather than rendering nothing', async () => {
    await renderInTheme(
      <ExercisePictogram name="Dumbbell Shoulder Press" variant="hero" />,
    );
    expect(screen.getByRole('image').props.accessibilityLabel).toBe(
      `Illustration: ${pictograms.strength.alt}`,
    );
  });

  it('falls back to the default drawing when a name carries no signal', async () => {
    await renderInTheme(<ExercisePictogram name="Coach special" variant="hero" />);
    expect(screen.getByRole('image').props.accessibilityLabel).toBe(
      `Illustration: ${pictograms.default.alt}`,
    );
  });

  it.each([
    ['', 'default'],
    ['   ', 'default'],
    ['🏋️', 'default'],
  ] as const)('renders for the empty-ish name %p', async (name, key) => {
    await renderInTheme(<ExercisePictogram name={name} variant="hero" />);
    expect(screen.getByRole('image').props.accessibilityLabel).toBe(
      `Illustration: ${pictograms[key].alt}`,
    );
  });

  it('prefers a stored imageKey over the name', async () => {
    await renderInTheme(<ExercisePictogram imageKey="plank" name="Burpees" variant="hero" />);
    expect(screen.getByRole('image').props.accessibilityLabel).toBe(
      `Illustration: ${pictograms.plank.alt}`,
    );
  });

  it('ignores an imageKey the registry does not know, without throwing', async () => {
    await renderInTheme(<ExercisePictogram imageKey="not-a-key" name="Burpees" variant="hero" />);
    expect(screen.getByRole('image').props.accessibilityLabel).toBe(
      `Illustration: ${pictograms.burpee.alt}`,
    );
  });
});

describe('ExercisePictogram — every registry key renders', () => {
  const cases = PICTOGRAM_KEYS.flatMap((key) =>
    BOTH_THEMES.flatMap((scheme) =>
      (['hero', 'thumb'] as const).map(
        (variant) => [key, scheme, variant] as [typeof key, ThemeName, 'hero' | 'thumb'],
      ),
    ),
  );

  it.each(cases)('%s draws as a %s %s', async (key, scheme, variant) => {
    await renderInTheme(<ExercisePictogram imageKey={key} name="" variant={variant} />, scheme);
    const testID = variant === 'hero' ? 'exercise-pictogram-hero' : 'exercise-pictogram-thumb';
    expect(screen.getByTestId(testID, INCLUDING_HIDDEN)).toBeTruthy();
    expect(screen.getByTestId('exercise-pictogram-frame-0', INCLUDING_HIDDEN)).toBeTruthy();
  });
});
