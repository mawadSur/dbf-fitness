/**
 * The calendar screen's state matrix.
 *
 * The clock is NOT mocked: the grid is keyed to the real UTC day on purpose
 * (`monthMath.ts`), so every fixture is built relative to `new Date()` and the
 * assertions never name a fixed month.
 */

import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Dimensions, PixelRatio } from 'react-native';

import CalendarScreen from '../../../app/calendar';
import { resetFake, setSession, setTable } from '../../features/diet/fakeSupabase';
import { CONTENT_MAX_WIDTH, MAX_FONT_SCALE, screenGutter } from '../ui/layout';
import { dayNumberMaxFontScale } from './fontScale';
import { fail, ok, offline, renderScreen } from './testHarness';
import { SKELETON_DELAY_MS } from '../ui/useDelayedVisible';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    replace: mockReplace,
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('../../services/supabase/client', () => ({
  supabase: jest.requireActual('../../features/diet/fakeSupabase').fakeSupabase,
}));
jest.mock('../../features/milestones/useMilestoneCheck', () => ({
  useMilestoneCheck: () => ({ newlyAchievedTier: null, isLoading: false }),
}));

/** The width one month-grid column gets in this harness (390pt shell, 16pt gutters). */
const WINDOW_WIDTH = Dimensions.get('window').width;
const GRID_CELL_WIDTH =
  (Math.min(WINDOW_WIDTH, CONTENT_MAX_WIDTH) - screenGutter(WINDOW_WIDTH) * 2) / 7;

const now = new Date();
const utcMonth = `${now.getUTCFullYear()}-${`${now.getUTCMonth() + 1}`.padStart(2, '0')}`;
const dayKey = (day: number) => `${utcMonth}-${`${day}`.padStart(2, '0')}`;
const at = (day: number, hour = 12) => `${dayKey(day)}T${`${hour}`.padStart(2, '0')}:00:00Z`;

const STATS = {
  current_streak: 4,
  completed_count: 9,
  missed_count: 1,
  avg_effort_score: 8.44,
};

const completion = (id: string, day: number, effort: number | null) => ({
  id,
  status: 'completed',
  effort_score: effort,
  completed_at: at(day),
});

function seed(stats: unknown, completions: unknown[]) {
  setTable('member_workout_stats', () => ok(stats));
  setTable('workout_completions', () => ok(completions));
}

beforeEach(() => {
  jest.clearAllMocks();
  resetFake();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('CalendarScreen — first load', () => {
  it('holds the page blank for 300ms, then shows skeletons instead of a spinner', async () => {
    jest.useFakeTimers();
    try {
      // Never resolves: the screen stays in its loading state for the whole test.
      setTable('member_workout_stats', () => new Promise(() => {}));
      setTable('workout_completions', () => new Promise(() => {}));
      // RNTL 14's `render` is async — without the await, `screen` is still detached.
      await renderScreen(<CalendarScreen />);

      expect(screen.queryByTestId('stat-tiles-skeleton')).toBeNull();
      expect(screen.queryByTestId('month-grid-skeleton')).toBeNull();

      await act(async () => {
        jest.advanceTimersByTime(SKELETON_DELAY_MS);
      });

      expect(screen.getByTestId('stat-tiles-skeleton')).toBeTruthy();
      expect(screen.getByTestId('month-grid-skeleton')).toBeTruthy();
      expect(screen.queryByTestId('activity-indicator')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('CalendarScreen — success', () => {
  it('draws the month grid, the stat tiles and the written summary', async () => {
    seed(STATS, [completion('w1', 15, 8), completion('w2', 16, null)]);
    await renderScreen(<CalendarScreen />);

    expect(await screen.findByTestId('month-grid')).toBeTruthy();
    expect(screen.getByText('4d')).toBeTruthy();
    expect(screen.getByText('8.4/10')).toBeTruthy();
    expect(screen.getByTestId('month-summary').props.children).toMatch(/2 workouts in \w+/);
    expect(screen.getByText('This month')).toBeTruthy();
    // Nothing writes a missed row, so the tile that always said 0 is gone.
    expect(screen.queryByText('Missed')).toBeNull();
  });

  it('says each day out loud: date, today, and whether a workout was logged', async () => {
    seed(STATS, [completion('w1', 15, 8)]);
    await renderScreen(<CalendarScreen />);

    const completed = await screen.findByTestId(`day-${dayKey(15)}`);
    expect(completed.props.accessibilityLabel).toMatch(
      /15 \w+, (today, )?workout completed, effort 8 out of 10/,
    );
    const todayKey = `${utcMonth}-${`${now.getUTCDate()}`.padStart(2, '0')}`;
    expect(screen.getByTestId(`day-${todayKey}`).props.accessibilityLabel).toContain('today');
  });

  it('opens and closes an inline detail card for the tapped day', async () => {
    seed(STATS, [completion('w1', 15, 8)]);
    await renderScreen(<CalendarScreen />);

    await fireEvent.press(await screen.findByTestId(`day-${dayKey(15)}`));
    const detail = screen.getByTestId('day-detail');
    expect(detail).toBeTruthy();
    expect(screen.getByText('8/10 effort')).toBeTruthy();
    expect(screen.getByTestId(`day-${dayKey(15)}`).props.accessibilityState.selected).toBe(true);

    await fireEvent.press(screen.getByTestId('day-detail-close'));
    expect(screen.queryByTestId('day-detail')).toBeNull();
  });

  it('a day with nothing logged says so in the detail card', async () => {
    seed(STATS, [completion('w1', 15, 8)]);
    await renderScreen(<CalendarScreen />);

    await fireEvent.press(await screen.findByTestId(`day-${dayKey(14)}`));
    expect(screen.getByText('Nothing logged on this day.')).toBeTruthy();
  });
});

describe('CalendarScreen — month navigation', () => {
  it('cannot step past the first or last month that has data', async () => {
    seed(STATS, [completion('w1', 15, 8)]);
    await renderScreen(<CalendarScreen />);

    const next = await screen.findByTestId('month-next');
    expect(next.props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('month-prev').props.accessibilityState.disabled).toBe(true);
  });

  it('stepping back clears the open day and moves the title', async () => {
    // A completion last month widens the range, so Previous becomes reachable.
    const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 10, 12));
    seed(STATS, [
      completion('w1', 15, 8),
      { id: 'w0', status: 'completed', effort_score: 5, completed_at: lastMonth.toISOString() },
    ]);
    await renderScreen(<CalendarScreen />);

    await fireEvent.press(await screen.findByTestId(`day-${dayKey(15)}`));
    expect(screen.getByTestId('day-detail')).toBeTruthy();

    const prev = screen.getByTestId('month-prev');
    expect(prev.props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(prev);

    expect(screen.queryByTestId('day-detail')).toBeNull();
    expect(screen.getByTestId('month-summary').props.children).toMatch(/1 workout in \w+/);
  });
});

describe('CalendarScreen — empty, partial and signed out', () => {
  it('empty history offers the next action rather than a dead end', async () => {
    seed(null, []);
    await renderScreen(<CalendarScreen />);

    expect(await screen.findByText('No workouts logged yet')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Go to your workouts' }));
    expect(mockReplace).toHaveBeenCalledWith('/workout');
  });

  it('empty month still says so in words', async () => {
    seed(null, []);
    await renderScreen(<CalendarScreen />);
    expect(await screen.findByTestId('month-summary')).toBeTruthy();
    expect(screen.getByTestId('month-summary').props.children).toMatch(/No workouts in \w+/);
  });

  it('partial data: a staff account has no stats row, and the grid still renders', async () => {
    seed(null, [completion('w1', 15, null)]);
    await renderScreen(<CalendarScreen />);

    expect(await screen.findByTestId('month-grid')).toBeTruthy();
    expect(screen.getByText('This month')).toBeTruthy();
    expect(screen.queryByText('Current streak')).toBeNull();
    expect(screen.getByTestId(`day-${dayKey(15)}`).props.accessibilityLabel).toContain(
      'no effort score yet',
    );
  });

  it('signed out shows the empty state instead of crashing', async () => {
    setSession(null);
    seed(null, []);
    await renderScreen(<CalendarScreen />);
    expect(await screen.findByText('No workouts logged yet')).toBeTruthy();
  });
});

describe('CalendarScreen — failure and refresh', () => {
  it('an error is an alert with a working retry, and the raw text never shows', async () => {
    let attempts = 0;
    setTable('member_workout_stats', () => {
      attempts += 1;
      return attempts === 1 ? fail('stats exploded') : ok(STATS);
    });
    setTable('workout_completions', () => ok([completion('w1', 15, 8)]));
    await renderScreen(<CalendarScreen />);

    const banner = await screen.findByTestId('banner');
    expect(banner.props.accessibilityRole).toBe('alert');
    expect(screen.getByText('Could not load your calendar.')).toBeTruthy();
    expect(screen.queryByText('stats exploded')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByTestId('banner')).toBeNull());
    expect(screen.getByText('4d')).toBeTruthy();
  });

  it('an offline failure says it is the connection, not the app', async () => {
    setTable('member_workout_stats', offline);
    setTable('workout_completions', () => ok([]));
    await renderScreen(<CalendarScreen />);
    expect(await screen.findByText(/connection/i)).toBeTruthy();
  });

  it('pull-to-refresh refetches both queries', async () => {
    let statsCalls = 0;
    let historyCalls = 0;
    setTable('member_workout_stats', () => {
      statsCalls += 1;
      return ok(STATS);
    });
    setTable('workout_completions', () => {
      historyCalls += 1;
      return ok([completion('w1', 15, 8)]);
    });
    await renderScreen(<CalendarScreen />);
    await screen.findByTestId('month-grid');

    await act(async () => {
      screen.getByTestId('calendar-scroll').props.refreshControl.props.onRefresh();
    });

    await waitFor(() => expect(statsCalls).toBe(2));
    expect(historyCalls).toBe(2);
  });
});

describe('CalendarScreen — large text', () => {
  it('stacks the stat tiles one per row at 130% text', async () => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1.3);
    seed(STATS, [completion('w1', 15, 8)]);
    await renderScreen(<CalendarScreen />);

    const tiles = await screen.findByTestId('stat-tiles');
    for (const tile of tiles.children) {
      if (typeof tile === 'string') continue;
      const style = Array.isArray(tile.props.style)
        ? Object.assign({}, ...tile.props.style.filter(Boolean))
        : tile.props.style;
      expect(style.flexBasis).toBe('100%');
    }
  });

  /**
   * The month grid is seven equal columns of a fixed-width page, so a cell
   * CANNOT grow sideways. At font_scale 2.0 on the Android emulator 10, 11, 12
   * and 13 each came out as a stacked "1" over "0"/"1"/"2"/"3" — React Native
   * broke the day number BETWEEN THE DIGITS and the week rows stopped reading
   * as dates.
   */
  it('keeps every two-digit day on ONE line, capped to what its column holds', async () => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(2);
    seed(STATS, [completion('w1', 15, 8)]);
    await renderScreen(<CalendarScreen />);
    await screen.findByTestId('month-grid');

    // Every day in the visible month, not just the one with a completion.
    const days = screen.getAllByTestId(/^day-number-/);
    expect(days.length).toBeGreaterThan(27);
    const twoDigit = days.filter((day) => String(day.props.children).length === 2);
    expect(twoDigit.length).toBeGreaterThan(15);

    for (const day of days) {
      expect(day.props.numberOfLines).toBe(1);
      const cap = day.props.maxFontSizeMultiplier;
      expect(cap).toBeGreaterThanOrEqual(1);
      expect(cap).toBeLessThanOrEqual(MAX_FONT_SCALE);
      // The cap is what the column can actually hold, so the digits fit.
      expect(cap).toBe(dayNumberMaxFontScale(GRID_CELL_WIDTH));
    }
  });
});
