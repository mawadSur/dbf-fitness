import { screen } from '@testing-library/react-native';

import { motion } from '../../theme/tokens';
import { Button } from './Button';
import {
  BOTH_THEMES,
  colorsFor,
  mockReducedMotion,
  pressableStyle,
  pressIn,
  renderInTheme,
  restoreReducedMotion,
} from './testing';

/**
 * PRESS FEEDBACK IS REAL, AND IT IS ON THE NODE THAT CARRIES THE BOX.
 *
 * Two separate things have to hold for a press to be visible on Android, and
 * the shipped build had the second one wrong:
 *
 *  1. `motion.pressOpacity` (0.92) and `motion.pressScale` (0.98) must land on
 *     the SAME host node that carries the fill — dimming a child while the
 *     filled parent stays lit is not feedback. `PressableBase` drives this from
 *     `onPressIn`/`onPressOut` state and appends it as a plain object, because
 *     the css-interop wrapper never calls a function-form style (see
 *     `androidPressableMock`).
 *  2. The `android_ripple` UNDER that opacity must be a colour that is not
 *     already there. It used to be another opaque palette token, and in the
 *     dark theme `primary`'s ripple (`brand` #34D399) was its own fill (`cta`
 *     #34D399) — so Android drew nothing and the measured pressed-state change
 *     was ~0.985 instead of 0.92. `src/theme/ripple.test.ts` holds the colour
 *     maths; this file holds what the components actually pass.
 */

afterEach(restoreReducedMotion);

describe.each(BOTH_THEMES)('%s theme', (scheme) => {
  const colors = colorsFor(scheme);

  it('dims and shrinks the button that carries the fill, not a child of it', async () => {
    await renderInTheme(
      <Button label="Start Day 3" testID="cta" onPress={() => undefined} />,
      scheme,
    );
    const node = screen.getByTestId('cta');

    expect(pressableStyle(node).backgroundColor).toBe(colors.cta);
    expect(pressableStyle(node).opacity).toBe(1);

    await pressIn(node);

    const pressed = pressableStyle(screen.getByTestId('cta'));
    // Same node: the fill and the feedback are on one style object.
    expect(pressed.backgroundColor).toBe(colors.cta);
    expect(pressed.opacity).toBe(motion.pressOpacity);
    expect(pressed.transform).toEqual([{ scale: motion.pressScale }]);
  });

  it('keeps the opacity but drops the scale under reduced motion', async () => {
    mockReducedMotion(true);
    await renderInTheme(
      <Button label="Go" testID="cta" onPress={() => undefined} />,
      scheme,
    );
    const node = screen.getByTestId('cta');

    await pressIn(node);

    const pressed = pressableStyle(screen.getByTestId('cta'));
    expect(pressed.opacity).toBe(motion.pressOpacity);
    expect(pressed.transform).toEqual([{ scale: 1 }]);
  });

  it('gives an inert button no ripple and no press feedback at all', async () => {
    await renderInTheme(
      <Button label="Go" disabled testID="cta" onPress={() => undefined} />,
      scheme,
    );
    const node = screen.getByTestId('cta');

    await pressIn(node);

    const pressed = pressableStyle(screen.getByTestId('cta'));
    expect(pressed.opacity).toBeUndefined();
    expect(pressed.backgroundColor).toBe(colors.disabledBg);
  });
});
