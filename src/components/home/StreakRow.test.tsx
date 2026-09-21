import { screen } from '@testing-library/react-native';

import { BOTH_THEMES, flattenStyle, renderInTheme } from '../ui/testing';
import { StreakRow, STACK_FONT_SCALE, streakCaption } from './StreakRow';

describe('streakCaption', () => {
  it('invites a first workout instead of celebrating zero', () => {
    expect(streakCaption(0, 30)).toBe('Finish a workout to start your 30-day streak.');
  });

  it('counts up, in whole days, and never says "29 to go" at the goal', () => {
    expect(streakCaption(1, 30)).toBe('1 day in a row. 29 to go.');
    expect(streakCaption(7, 30)).toBe('7 days in a row. 23 to go.');
    expect(streakCaption(30, 30)).toBe('30 days in a row. Goal reached.');
    expect(streakCaption(41, 30)).toBe('41 days in a row. Goal reached.');
  });
});

/** The single flex row inside the card: ring + copy, or the stacked version. */
function flexDirectionOfRow(): unknown {
  const [row] = screen.getByTestId('home-streak').children as unknown as {
    props: { style: unknown };
  }[];
  return flattenStyle(row.props.style).flexDirection;
}

describe('StreakRow', () => {
  it('reserves the row while the stats query is open', async () => {
    await renderInTheme(<StreakRow currentStreak={null} goal={30} />);
    expect(screen.getByTestId('home-streak-loading')).toBeTruthy();
    expect(screen.queryByTestId('home-streak')).toBeNull();
  });

  it('states the streak in words as well as in the ring', async () => {
    await renderInTheme(<StreakRow currentStreak={3} goal={30} />);
    expect(screen.getByTestId('home-streak')).toBeTruthy();
    expect(screen.getByText('Day streak')).toBeTruthy();
    expect(screen.getByText('3 days in a row. 27 to go.')).toBeTruthy();
  });

  it('sits the ring beside the copy at normal text size', async () => {
    await renderInTheme(<StreakRow currentStreak={3} goal={30} fontScale={1} />);
    expect(flexDirectionOfRow()).toBe('row');
  });

  it('stacks the ring above the copy at 130% text and above', async () => {
    await renderInTheme(<StreakRow currentStreak={3} goal={30} fontScale={STACK_FONT_SCALE} />);
    expect(flexDirectionOfRow()).toBe('column');
  });

  it.each(BOTH_THEMES)('renders in the %s theme', async (scheme) => {
    await renderInTheme(<StreakRow currentStreak={12} goal={30} />, scheme);
    expect(screen.getByText('12 days in a row. 18 to go.')).toBeTruthy();
  });
});
