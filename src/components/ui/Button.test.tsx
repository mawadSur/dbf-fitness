import { fireEvent, screen } from '@testing-library/react-native';
import { View } from 'react-native';

import { contrastRatio, TEXT_CONTRAST_MIN } from '../../theme/contrast';
import { Button, type ButtonVariant } from './Button';
import { BUTTON_HEIGHT, type ButtonSize } from './layout';
import {
  BOTH_THEMES,
  colorsFor,
  flattenStyle,
  INCLUDING_HIDDEN,
  mockReducedMotion,
  pressableStyle,
  pressIn,
  renderInTheme,
} from './testing';

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger', 'danger-outline'];
const SIZES: ButtonSize[] = ['sm', 'md', 'lg'];

describe('Button', () => {
  it('is a button with the label as its accessible name', async () => {
    await renderInTheme(<Button label="Start workout" onPress={() => undefined} testID="b" />);
    const button = screen.getByTestId('b');
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityLabel).toBe('Start workout');
    expect(button.props.accessibilityState).toMatchObject({ disabled: false, busy: false });
  });

  it('prefers an explicit accessibility label over the visible one', async () => {
    await renderInTheme(<Button label="Join" accessibilityLabel="Join the live class" testID="b" />);
    expect(screen.getByTestId('b').props.accessibilityLabel).toBe('Join the live class');
  });

  it('calls onPress once when pressed', async () => {
    const onPress = jest.fn();
    await renderInTheme(<Button label="Save" onPress={onPress} testID="b" />);
    fireEvent.press(screen.getByTestId('b'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire when disabled, and says so', async () => {
    const onPress = jest.fn();
    await renderInTheme(<Button label="Save" onPress={onPress} disabled testID="b" />);
    const button = screen.getByTestId('b');
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(button.props.accessibilityState.disabled).toBe(true);
  });

  /**
   * The regression this replaced a blanket `opacity: 0.45` for.
   *
   * Fading the whole pressable faded the fill AND the label towards the page
   * by the same alpha, so in DARK mode the bright `cta` (#34D399) and the
   * near-black `onCta` (#022C22) both collapsed toward #011A14 and met: the
   * disabled label measured (14,80,59) on (24,108,79) = 1.48:1 on the Android
   * emulator. Light mode kept a white label and stayed readable, which is why
   * the whole defect was dark-only — so both themes are asserted here.
   */
  describe('disabled is legible, not just faded', () => {
    it.each(BOTH_THEMES)('never dims the whole button in %s', async (scheme) => {
      await renderInTheme(<Button label="Upload recording" disabled testID="b" />, scheme);
      const style = pressableStyle(screen.getByTestId('b'));
      expect(style.opacity).toBeUndefined();
    });

    it.each(BOTH_THEMES)(
      'holds the disabled label above 4.5:1 on its own fill in %s',
      async (scheme) => {
        await renderInTheme(<Button label="Upload recording" disabled testID="b" />, scheme);
        const colors = colorsFor(scheme);
        const style = pressableStyle(screen.getByTestId('b'));
        // A filled variant keeps a fill — the DISABLED one, not a ghost of the CTA.
        expect(style.backgroundColor).toBe(colors.disabledBg);
        const label = screen.getByText('Upload recording');
        expect(flattenStyle(label.props.style).color).toBe(colors.disabledFg);
        expect(contrastRatio(colors.disabledFg, colors.disabledBg)).toBeGreaterThanOrEqual(
          TEXT_CONTRAST_MIN,
        );
      },
    );

    /**
     * The other half of the same defect: `opacity: 0.45` left a disabled
     * primary looking like a live CTA (a 45%-faded #34D399 in dark is still
     * unmistakably the brand green). A disabled button must not be mistakable
     * for the enabled one at a glance, so the FILL has to move, not just fade.
     */
    it.each(BOTH_THEMES)('does not look like a live CTA in %s', async (scheme) => {
      const colors = colorsFor(scheme);
      // Both buttons in ONE tree: the comparison is between what a member sees
      // side by side, and it keeps a single render/cleanup cycle.
      await renderInTheme(
        <View>
          <Button label="Sign in" disabled testID="off" />
          <Button label="Create account" onPress={() => undefined} testID="on" />
        </View>,
        scheme,
      );
      const offFill = pressableStyle(screen.getByTestId('off')).backgroundColor;
      const onFill = pressableStyle(screen.getByTestId('on')).backgroundColor;

      expect(onFill).toBe(colors.cta);
      expect(offFill).not.toBe(onFill);
      // Same threshold as any other essential UI difference (SC 1.4.11).
      expect(contrastRatio(offFill as string, onFill as string)).toBeGreaterThanOrEqual(3);
    });

    it.each(BOTH_THEMES)('keeps an outlined variant outlined in %s', async (scheme) => {
      await renderInTheme(
        <Button label="Cancel" variant="secondary" disabled testID="b" />,
        scheme,
      );
      const colors = colorsFor(scheme);
      const style = pressableStyle(screen.getByTestId('b'));
      expect(style.backgroundColor).toBe('transparent');
      expect(style.borderWidth).toBe(2);
      expect(style.borderColor).toBe(colors.disabledFg);
      // The edge is the control's only shape here, so it has to be visible.
      expect(contrastRatio(colors.disabledFg, colors.bg)).toBeGreaterThanOrEqual(3);
    });

    it('keeps its own colours while LOADING, so the spinner stays visible', async () => {
      await renderInTheme(<Button label="Saving" loading testID="b" />, 'dark');
      const colors = colorsFor('dark');
      expect(pressableStyle(screen.getByTestId('b')).backgroundColor).toBe(colors.cta);
      expect(screen.getByTestId('button-spinner').props.color).toBe(colors.onCta);
    });
  });

  /**
   * "Delete account" used to be a plain `secondary` sitting directly under
   * "Sign out" and "Change coach" in the danger zone, so the only thing
   * separating an irreversible action from a benign one was a trash glyph.
   */
  it.each(BOTH_THEMES)('gives danger-outline the danger tone in %s', async (scheme) => {
    await renderInTheme(
      <Button label="Delete account" variant="danger-outline" testID="b" />,
      scheme,
    );
    const colors = colorsFor(scheme);
    const style = pressableStyle(screen.getByTestId('b'));
    expect(style.backgroundColor).toBe('transparent');
    expect(style.borderColor).toBe(colors.danger);
    expect(style.borderWidth).toBe(2);
    expect(flattenStyle(screen.getByText('Delete account').props.style).color).toBe(colors.danger);
    // It is a real outline AND readable text, in both themes.
    expect(contrastRatio(colors.danger, colors.bg)).toBeGreaterThanOrEqual(TEXT_CONTRAST_MIN);
  });

  it('does not fire while loading, shows a spinner and reports busy', async () => {
    const onPress = jest.fn();
    await renderInTheme(<Button label="Saving" onPress={onPress} loading testID="b" />);
    const button = screen.getByTestId('b');
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(button.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    expect(screen.getByTestId('button-spinner')).toBeTruthy();
  });

  it.each(SIZES)('gives size %s its documented min height', async (size) => {
    await renderInTheme(
      <View>
        <Button label={size} size={size} testID={`b-${size}`} />
      </View>,
    );
    expect(pressableStyle(screen.getByTestId(`b-${size}`)).minHeight).toBe(BUTTON_HEIGHT[size]);
  });

  it('lifts the 40pt small button back to the platform minimum with hitSlop', async () => {
    await renderInTheme(<Button label="Small" size="sm" testID="b" />);
    // iOS/web minimum is 44: (44 - 40) / 2 = 2 on each edge.
    expect(screen.getByTestId('b').props.hitSlop).toBe(2);
  });

  it.each(VARIANTS)('renders the %s variant from theme tokens only', async (variant) => {
    await renderInTheme(<Button label={variant} variant={variant} testID="b" />, 'light');
    const style = pressableStyle(screen.getByTestId('b'));
    const colors = colorsFor('light');
    const expected = {
      primary: colors.cta,
      secondary: 'transparent',
      ghost: 'transparent',
      danger: colors.danger,
      'danger-outline': 'transparent',
    }[variant];
    expect(style.backgroundColor).toBe(expected);
  });

  it('outlines the secondary variant with a 2px text-coloured border', async () => {
    await renderInTheme(<Button label="Secondary" variant="secondary" testID="b" />, 'light');
    const style = pressableStyle(screen.getByTestId('b'));
    expect(style.borderWidth).toBe(2);
    expect(style.borderColor).toBe(colorsFor('light').text);
  });

  it.each(BOTH_THEMES)('takes its primary fill from the %s theme', async (scheme) => {
    await renderInTheme(<Button label="Go" testID="b" />, scheme);
    expect(pressableStyle(screen.getByTestId('b')).backgroundColor).toBe(colorsFor(scheme).cta);
  });

  it('stretches only when fullWidth is set', async () => {
    await renderInTheme(<Button label="Wide" fullWidth testID="b" />);
    expect(pressableStyle(screen.getByTestId('b')).alignSelf).toBe('stretch');
  });

  it('hugs its content by default', async () => {
    await renderInTheme(<Button label="Narrow" testID="b" />);
    expect(pressableStyle(screen.getByTestId('b')).alignSelf).toBe('flex-start');
  });

  it('renders leading and trailing icons', async () => {
    await renderInTheme(<Button label="Next" leadingIcon="plus" trailingIcon="arrow-right" testID="b" />);
    expect(screen.getByTestId('icon-plus', INCLUDING_HIDDEN)).toBeTruthy();
    expect(screen.getByTestId('icon-arrow-right', INCLUDING_HIDDEN)).toBeTruthy();
  });

  it('dims and shrinks on press without shifting layout', async () => {
    await renderInTheme(<Button label="Press" testID="b" />);
    await pressIn(screen.getByTestId('b'));
    const pressed = pressableStyle(screen.getByTestId('b'));
    expect(pressed.opacity).toBeCloseTo(0.92);
    // A scale, never a size/margin change: pressing must not reflow the row.
    expect(pressed.transform).toEqual([{ scale: 0.98 }]);
    expect(pressed.minHeight).toBe(BUTTON_HEIGHT.md);
  });

  it('keeps the dim but drops the scale under reduced motion', async () => {
    mockReducedMotion(true);
    await renderInTheme(<Button label="Press" testID="b" />);
    await pressIn(screen.getByTestId('b'));
    const pressed = pressableStyle(screen.getByTestId('b'));
    expect(pressed.opacity).toBeCloseTo(0.92);
    expect(pressed.transform).toEqual([{ scale: 1 }]);
  });

  it('turns the android ripple off while inert', async () => {
    await renderInTheme(<Button label="Off" disabled testID="b" />);
    expect(screen.getByTestId('b').props.android_ripple).toBeUndefined();
  });
});
