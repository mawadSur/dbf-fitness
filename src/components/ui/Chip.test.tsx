import { fireEvent, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { Chip } from './Chip';
import { hitSlopFor, minTouchTarget } from './layout';
import {
  colorsFor,
  flattenStyle,
  INCLUDING_HIDDEN,
  mockReducedMotion,
  pressableStyle,
  pressIn,
  renderInTheme,
} from './testing';

describe('Chip', () => {
  it('is plain text when it has no press handler', async () => {
    await renderInTheme(<Chip label="Static" testID="c" />);
    expect(screen.getByTestId('c').props.accessibilityRole).toBe('text');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('becomes a button with a selected state when pressable', async () => {
    const onPress = jest.fn();
    await renderInTheme(<Chip label="Strength" selected onPress={onPress} testID="c" />);
    const chip = screen.getByTestId('c');
    expect(chip.props.accessibilityRole).toBe('button');
    expect(chip.props.accessibilityLabel).toBe('Strength');
    expect(chip.props.accessibilityState).toMatchObject({ selected: true, disabled: false });
    await fireEvent.press(chip);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('adds a check icon when selected, so selection is not colour alone', async () => {
    await renderInTheme(<Chip label="Cardio" selected onPress={() => undefined} />);
    expect(screen.getByTestId('icon-check', INCLUDING_HIDDEN)).toBeTruthy();
  });

  it('keeps the caller icon instead of the check when one is given', async () => {
    await renderInTheme(<Chip label="Cardio" selected icon="flame" onPress={() => undefined} />);
    expect(screen.getByTestId('icon-flame', INCLUDING_HIDDEN)).toBeTruthy();
    expect(screen.queryByTestId('icon-check', INCLUDING_HIDDEN)).toBeNull();
  });

  it('fills with the cta colour when selected', async () => {
    await renderInTheme(<Chip label="On" selected onPress={() => undefined} testID="c" />, 'light');
    expect(pressableStyle(screen.getByTestId('c')).backgroundColor).toBe(colorsFor('light').cta);
  });

  it('stays transparent with a strong outline when not selected', async () => {
    await renderInTheme(<Chip label="Off" onPress={() => undefined} testID="c" />, 'light');
    const style = pressableStyle(screen.getByTestId('c'));
    expect(style.backgroundColor).toBe('transparent');
    expect(style.borderColor).toBe(colorsFor('light').borderStrong);
  });

  it('takes its outline from the dark theme', async () => {
    await renderInTheme(<Chip label="Off" onPress={() => undefined} testID="c" />, 'dark');
    expect(pressableStyle(screen.getByTestId('c')).borderColor).toBe(colorsFor('dark').borderStrong);
  });

  it('does not fire and reports disabled when disabled', async () => {
    const onPress = jest.fn();
    await renderInTheme(<Chip label="Nope" disabled onPress={onPress} testID="c" />);
    const chip = screen.getByTestId('c');
    await fireEvent.press(chip);
    expect(onPress).not.toHaveBeenCalled();
    expect(chip.props.accessibilityState).toMatchObject({ disabled: true });
    expect(pressableStyle(chip).opacity).toBe(0.45);
  });

  it('adds enough hitSlop to reach the platform minimum target', async () => {
    await renderInTheme(<Chip label="Small" onPress={() => undefined} testID="c" />);
    const slop = screen.getByTestId('c').props.hitSlop as number;
    expect(slop).toBe(hitSlopFor(32, Platform.OS));
    expect(32 + slop * 2).toBeGreaterThanOrEqual(minTouchTarget(Platform.OS));
  });

  it('dims and shrinks on press', async () => {
    await renderInTheme(<Chip label="Press" onPress={() => undefined} testID="c" />);
    await pressIn(screen.getByTestId('c'));
    const style = pressableStyle(screen.getByTestId('c'));
    expect(style.transform).toEqual([{ scale: 0.98 }]);
    expect(style.opacity).toBe(0.92);
  });

  it('stops shrinking under reduced motion', async () => {
    mockReducedMotion(true);
    await renderInTheme(<Chip label="Press" onPress={() => undefined} testID="c" />);
    await pressIn(screen.getByTestId('c'));
    expect(pressableStyle(screen.getByTestId('c')).transform).toEqual([{ scale: 1 }]);
  });

  it('never shrinks below a 32pt pill', async () => {
    await renderInTheme(<Chip label="Tag" testID="c" />);
    expect(flattenStyle(screen.getByTestId('c').props.style).minHeight).toBe(32);
  });
});
