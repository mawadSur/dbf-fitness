import { fireEvent, screen } from '@testing-library/react-native';

import type { PlanDay } from '../../features/workouts/planSummary';
import { TITLE_MAX_LINES } from '../ui/layout';
import { BOTH_THEMES, mockWindowDimensions, renderInTheme } from '../ui/testing';
import { DayCard } from './DayCard';

const day: PlanDay = { id: 'd2', dayNumber: 2, blockName: 'Pull', durationMinutes: 40 };

describe('DayCard', () => {
  it('names the day, the block, the duration and one status word', async () => {
    await renderInTheme(
      <DayCard day={day} isCompleted={false} isToday onPress={jest.fn()} testID="card" />,
    );
    expect(screen.getByTestId('card').props.accessibilityLabel).toBe(
      'Day 2, Pull, Today, about 40 min',
    );
    expect(screen.getByText('Day 2')).toBeTruthy();
    expect(screen.getByText('Pull')).toBeTruthy();
    // The status is a word, never the tint alone.
    expect(screen.getByText('Today')).toBeTruthy();
  });

  it('marks a completed day Done', async () => {
    await renderInTheme(
      <DayCard day={day} isCompleted isToday={false} onPress={jest.fn()} testID="done" />,
    );
    expect(screen.getByTestId('done').props.accessibilityLabel).toBe(
      'Day 2, Pull, Done, about 40 min',
    );
    expect(screen.getByText('Done')).toBeTruthy();
  });

  it('leaves the duration out of the label when the coach left it empty', async () => {
    await renderInTheme(
      <DayCard
        day={{ ...day, durationMinutes: null }}
        isCompleted={false}
        isToday={false}
        onPress={jest.fn()}
        testID="upcoming"
      />,
    );
    expect(screen.getByTestId('upcoming').props.accessibilityLabel).toBe('Day 2, Pull, Upcoming');
  });

  it('opens the day it describes', async () => {
    const onPress = jest.fn();
    await renderInTheme(
      <DayCard day={day} isCompleted={false} isToday onPress={onPress} testID="card" />,
    );
    await fireEvent.press(screen.getByTestId('card'));
    expect(onPress).toHaveBeenCalledWith('d2');
  });

  it.each(BOTH_THEMES)('renders today emphasised in the %s theme', async (scheme) => {
    await renderInTheme(
      <DayCard day={day} isCompleted={false} isToday onPress={jest.fn()} testID="card" />,
      scheme,
    );
    expect(screen.getByTestId('card').props.accessibilityRole).toBe('button');
  });

  describe('a long coach-written block name', () => {
    afterEach(() => jest.restoreAllMocks());

    const longDay: PlanDay = { ...day, blockName: 'Cardio in Place — Foundation & Technique' };

    it('wraps over three lines instead of truncating', async () => {
      mockWindowDimensions({ fontScale: 1 });
      await renderInTheme(
        <DayCard day={longDay} isCompleted={false} isToday onPress={jest.fn()} testID="card" />,
      );
      const title = screen.getByText(longDay.blockName);
      expect(title.props.numberOfLines).toBe(TITLE_MAX_LINES);
    });

    it('is not clamped at all once the member enlarges text', async () => {
      mockWindowDimensions({ fontScale: 2 });
      await renderInTheme(
        <DayCard day={longDay} isCompleted={false} isToday onPress={jest.fn()} testID="card" />,
      );
      const title = screen.getByText(longDay.blockName);
      expect(title.props.numberOfLines).toBeUndefined();
      expect(title.props.ellipsizeMode).toBeUndefined();
    });
  });
});
