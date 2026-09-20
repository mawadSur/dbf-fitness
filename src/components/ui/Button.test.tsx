import { fireEvent, screen } from '@testing-library/react-native';
import { View } from 'react-native';

import { Button, type ButtonVariant } from './Button';
import { BUTTON_HEIGHT, type ButtonSize } from './layout';
import {
  BOTH_THEMES,
  colorsFor,
  INCLUDING_HIDDEN,
  mockReducedMotion,
  pressableStyle,
  pressIn,
  renderInTheme,
} from './testing';

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger'];
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
    // Colour is never the only signal: the state is announced AND dimmed.
    expect(pressableStyle(button).opacity).toBe(0.45);
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
