import { fireEvent, screen } from '@testing-library/react-native';

import { ChecklistRow, CHECK_TARGET_SIZE } from './ChecklistRow';
import {
  colorsFor,
  flattenStyle,
  INCLUDING_HIDDEN,
  mockReducedMotion,
  pressableStyle,
  pressIn,
  renderInTheme,
} from './testing';

const base = { label: 'Back squat', checked: false, onToggle: () => undefined };

describe('ChecklistRow (design system)', () => {
  it('exposes the toggle as a checkbox labelled by the row', async () => {
    await renderInTheme(<ChecklistRow {...base} />);
    const box = screen.getByRole('checkbox', { name: 'Back squat' });
    expect(box.props.accessibilityState).toMatchObject({ checked: false, disabled: false });
  });

  it('reports the checked state to a screen reader', async () => {
    await renderInTheme(<ChecklistRow {...base} checked />);
    expect(
      screen.getByRole('checkbox', { name: 'Back squat' }).props.accessibilityState,
    ).toMatchObject({ checked: true });
  });

  it('toggles when the checkbox is pressed', async () => {
    const onToggle = jest.fn();
    await renderInTheme(<ChecklistRow {...base} onToggle={onToggle} />);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Back squat' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('gives the checkbox a 48pt target, above both platform minimums', async () => {
    await renderInTheme(<ChecklistRow {...base} />);
    const style = pressableStyle(screen.getByRole('checkbox', { name: 'Back squat' }));
    expect(style.width).toBe(CHECK_TARGET_SIZE);
    expect(style.height).toBe(CHECK_TARGET_SIZE);
    expect(CHECK_TARGET_SIZE).toBeGreaterThanOrEqual(48);
  });

  it('marks a checked item with a check icon and a strike-through, not colour alone', async () => {
    await renderInTheme(<ChecklistRow {...base} checked />);
    expect(screen.getByTestId('icon-check', INCLUDING_HIDDEN)).toBeTruthy();
    expect(flattenStyle(screen.getByText('Back squat').props.style).textDecorationLine).toBe(
      'line-through',
    );
  });

  it('leaves an unchecked box empty and outlined with the strong border', async () => {
    await renderInTheme(<ChecklistRow {...base} />, 'light');
    const box = flattenStyle(screen.getByTestId('checklist-box').props.style);
    expect(box.backgroundColor).toBe('transparent');
    expect(box.borderColor).toBe(colorsFor('light').borderStrong);
    expect(screen.queryByTestId('icon-check', INCLUDING_HIDDEN)).toBeNull();
  });

  it('fills the box with the cta colour once checked', async () => {
    await renderInTheme(<ChecklistRow {...base} checked />, 'dark');
    expect(flattenStyle(screen.getByTestId('checklist-box').props.style).backgroundColor).toBe(
      colorsFor('dark').cta,
    );
  });

  it('shows the sublabel', async () => {
    await renderInTheme(<ChecklistRow {...base} sublabel="3 × 10" />);
    expect(screen.getByText('3 × 10')).toBeTruthy();
  });

  it('exposes no details button unless onPress is given', async () => {
    await renderInTheme(<ChecklistRow {...base} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('opens details through a separate labelled button', async () => {
    const onPress = jest.fn();
    await renderInTheme(<ChecklistRow {...base} onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Back squat, details' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does nothing and dims when disabled', async () => {
    const onToggle = jest.fn();
    const onPress = jest.fn();
    await renderInTheme(
      <ChecklistRow {...base} onToggle={onToggle} onPress={onPress} disabled testID="row" />,
    );
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Back squat' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Back squat, details' }));
    expect(onToggle).not.toHaveBeenCalled();
    expect(onPress).not.toHaveBeenCalled();
    expect(flattenStyle(screen.getByTestId('row').props.style).opacity).toBe(0.45);
  });

  // A workout already logged for today: the ticks are a record of what was
  // done, so they must not be editable — but the member can still open the
  // exercise, and work they have finished must not be dimmed to 45%.
  it('locks only the checkbox when toggleDisabled, keeping details and full contrast', async () => {
    const onToggle = jest.fn();
    const onPress = jest.fn();
    await renderInTheme(
      <ChecklistRow
        {...base}
        checked
        onToggle={onToggle}
        onPress={onPress}
        toggleDisabled
        testID="row"
      />,
    );

    const box = screen.getByRole('checkbox', { name: 'Back squat' });
    await fireEvent.press(box);
    expect(onToggle).not.toHaveBeenCalled();
    expect(box.props.accessibilityState).toMatchObject({ checked: true, disabled: true });

    await fireEvent.press(screen.getByRole('button', { name: 'Back squat, details' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(flattenStyle(screen.getByTestId('row').props.style).opacity).toBe(1);
  });

  it('shrinks the checkbox on press', async () => {
    await renderInTheme(<ChecklistRow {...base} />);
    const box = screen.getByRole('checkbox', { name: 'Back squat' });
    await pressIn(box);
    expect(pressableStyle(screen.getByRole('checkbox', { name: 'Back squat' })).transform).toEqual([
      { scale: 0.98 },
    ]);
  });

  it('holds still under reduced motion', async () => {
    mockReducedMotion(true);
    await renderInTheme(<ChecklistRow {...base} />);
    await pressIn(screen.getByRole('checkbox', { name: 'Back squat' }));
    expect(pressableStyle(screen.getByRole('checkbox', { name: 'Back squat' })).transform).toEqual([
      { scale: 1 },
    ]);
  });

  it('wraps a long label instead of clipping it to one line', async () => {
    await renderInTheme(<ChecklistRow {...base} label="Bulgarian split squat with a slow eccentric" />);
    expect(
      screen.getByText('Bulgarian split squat with a slow eccentric').props.numberOfLines,
    ).toBe(2);
  });
});
