import { fireEvent, screen } from '@testing-library/react-native';

import { BOTH_THEMES, INCLUDING_HIDDEN, renderInTheme } from '../ui/testing';
import { ExerciseChecklistRow } from './ExerciseChecklistRow';

const props = {
  name: 'Bench press',
  repsOrDuration: '5x5',
  imageKey: 'bench-press',
  checked: false,
  onToggle: jest.fn(),
  onPress: jest.fn(),
};

describe('ExerciseChecklistRow', () => {
  it('is a checkbox named after the exercise, with the reps as its detail line', async () => {
    await renderInTheme(<ExerciseChecklistRow {...props} />);
    const box = screen.getByRole('checkbox', { name: 'Bench press' });
    expect(box.props.accessibilityState.checked).toBe(false);
    expect(screen.getByText('5x5')).toBeTruthy();
  });

  it('toggles and opens the detail from two separate targets', async () => {
    const onToggle = jest.fn();
    const onPress = jest.fn();
    await renderInTheme(
      <ExerciseChecklistRow {...props} onToggle={onToggle} onPress={onPress} />,
    );
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Bench press' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Bench press, details' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('carries the checked state in accessibilityState, not only in the tint', async () => {
    await renderInTheme(<ExerciseChecklistRow {...props} checked />);
    expect(
      screen.getByRole('checkbox', { name: 'Bench press' }).props.accessibilityState.checked,
    ).toBe(true);
  });

  it('hides the pictogram from screen readers and still draws one for an unknown name', async () => {
    await renderInTheme(
      <ExerciseChecklistRow {...props} name="Zercher carry variation" imageKey={null} />,
    );
    expect(screen.getByTestId('exercise-pictogram-thumb', INCLUDING_HIDDEN)).toBeTruthy();
    // Decorative: the row's own accessible name already carries the exercise.
    expect(screen.queryByTestId('exercise-pictogram-thumb')).toBeNull();
  });

  it('goes disabled while its own toggle is saving', async () => {
    const onToggle = jest.fn();
    await renderInTheme(<ExerciseChecklistRow {...props} onToggle={onToggle} disabled />);
    const box = screen.getByRole('checkbox', { name: 'Bench press' });
    expect(box.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(box);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it.each(BOTH_THEMES)('renders in the %s theme', async (scheme) => {
    await renderInTheme(<ExerciseChecklistRow {...props} />, scheme);
    expect(screen.getByRole('checkbox', { name: 'Bench press' })).toBeTruthy();
  });
});
