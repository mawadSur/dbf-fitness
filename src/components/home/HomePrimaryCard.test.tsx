import { fireEvent, screen } from '@testing-library/react-native';

import type { PlanDay } from '../../features/workouts/planSummary';
import { BOTH_THEMES, INCLUDING_HIDDEN, renderInTheme } from '../ui/testing';
import { HomePrimaryCard } from './HomePrimaryCard';

const day: PlanDay = { id: 'd3', dayNumber: 3, blockName: 'Lower body', durationMinutes: 42 };

describe('HomePrimaryCard', () => {
  it('holds its height before the 300 ms delay, drawing nothing yet', async () => {
    await renderInTheme(
      <HomePrimaryCard
        primary={{ kind: 'loading' }}
        showSkeleton={false}
        onStartDay={jest.fn()}
        onPickCoach={jest.fn()}
      />,
    );
    expect(screen.getByTestId('home-primary-loading')).toBeTruthy();
    expect(screen.queryAllByTestId('skeleton', INCLUDING_HIDDEN)).toHaveLength(0);
  });

  it('draws the skeleton once the load is slow enough to admit it', async () => {
    await renderInTheme(
      <HomePrimaryCard
        primary={{ kind: 'loading' }}
        showSkeleton
        onStartDay={jest.fn()}
        onPickCoach={jest.fn()}
      />,
    );
    expect(screen.getByLabelText('Loading your workout')).toBeTruthy();
    expect(screen.queryAllByTestId('skeleton', INCLUDING_HIDDEN).length).toBeGreaterThan(0);
  });

  it('leads a member with no coach to picking one', async () => {
    const onPickCoach = jest.fn();
    await renderInTheme(
      <HomePrimaryCard
        primary={{ kind: 'needs-coach' }}
        onStartDay={jest.fn()}
        onPickCoach={onPickCoach}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Choose your coach' }));
    expect(onPickCoach).toHaveBeenCalledTimes(1);
  });

  it('explains the wait with no dead button when the plan is not written yet', async () => {
    await renderInTheme(
      <HomePrimaryCard
        primary={{ kind: 'awaiting-plan' }}
        onStartDay={jest.fn()}
        onPickCoach={jest.fn()}
      />,
    );
    expect(screen.getByText('Your coach is preparing your plan')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('starts the next day and names the day in the button', async () => {
    const onStartDay = jest.fn();
    await renderInTheme(
      <HomePrimaryCard
        primary={{ kind: 'next-day', day, completedCount: 2, totalDays: 12 }}
        onStartDay={onStartDay}
        onPickCoach={jest.fn()}
      />,
    );
    expect(screen.getByText('Day 3 of 12')).toBeTruthy();
    // The block name is the heading; the supporting line adds the estimate only.
    expect(screen.getByText('Lower body')).toBeTruthy();
    expect(screen.getByText('about 42 min')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Start Day 3' }));
    expect(onStartDay).toHaveBeenCalledWith('d3');
  });

  it('celebrates a finished plan without offering a workout that does not exist', async () => {
    await renderInTheme(
      <HomePrimaryCard
        primary={{ kind: 'plan-complete', totalDays: 12 }}
        onStartDay={jest.fn()}
        onPickCoach={jest.fn()}
      />,
    );
    expect(screen.getByText('Plan complete')).toBeTruthy();
    expect(screen.getByText('All 12 days done')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it.each(BOTH_THEMES)('renders the next-day card in the %s theme', async (scheme) => {
    await renderInTheme(
      <HomePrimaryCard
        primary={{ kind: 'next-day', day, completedCount: 0, totalDays: 12 }}
        onStartDay={jest.fn()}
        onPickCoach={jest.fn()}
      />,
      scheme,
    );
    expect(screen.getByRole('button', { name: 'Start Day 3' })).toBeTruthy();
  });
});
