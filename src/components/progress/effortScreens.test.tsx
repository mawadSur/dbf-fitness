/**
 * The effort and effort-review screens' state matrix.
 *
 * `screens.test.tsx` already covers the ranking, the persisted score and the
 * back behaviour; this file covers the states the redesign added — the delayed
 * skeletons, refresh, partial data, offline, the per-row saving state and the
 * mutation error — without repeating them.
 */

import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { PixelRatio, StyleSheet } from 'react-native';

import EffortScreen from '../../../app/effort';
import EffortReviewScreen from '../../../app/effort-review';
import { fakeCalls, resetFake, setSession, setTable } from '../../features/diet/fakeSupabase';
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

const stat = (id: string, avg: number | null) => ({
  member_id: id,
  completed_count: 2,
  missed_count: 0,
  total_effort_score: 10,
  avg_effort_score: avg,
  current_streak: 3,
});

/** The review screen asks `profiles` twice: once for the role, once for names. */
function coachProfiles(names: { id: string; full_name: string }[]) {
  setTable('profiles', (ops) =>
    ops.filters.some(([col]) => col === 'id') && ops.filters.length === 1 && !Array.isArray(ops.payload)
      ? ok({ role: 'coach', full_name: 'Casey' })
      : ok(names),
  );
}

const completion = (id: string, score: number | null) => ({
  id,
  member_id: 'm1',
  workout_day_id: 'd1',
  effort_score: score,
  completed_at: '2026-09-18T10:00:00Z',
});

beforeEach(() => {
  jest.clearAllMocks();
  resetFake();
});
afterEach(() => jest.restoreAllMocks());

describe('EffortScreen — loading, empty and offline', () => {
  it('waits 300ms before drawing skeletons, and never shows a bare spinner', async () => {
    jest.useFakeTimers();
    try {
      setTable('member_workout_stats', () => new Promise(() => {}));
      await renderScreen(<EffortScreen />);

      expect(screen.queryByTestId('effort-summary-skeleton')).toBeNull();
      await act(async () => {
        jest.advanceTimersByTime(SKELETON_DELAY_MS);
      });
      expect(screen.getByTestId('effort-summary-skeleton')).toBeTruthy();
      expect(screen.getByTestId('leaderboard-skeleton')).toBeTruthy();
      expect(screen.queryByTestId('activity-indicator')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('no scores yet offers the next action rather than a dead end', async () => {
    setTable('member_workout_stats', () => ok([]));
    await renderScreen(<EffortScreen />);
    expect(await screen.findByText('No effort scores yet')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Go to your workouts' }));
    expect(mockReplace).toHaveBeenCalledWith('/workout');
  });

  it('an offline failure blames the connection, not the app', async () => {
    setTable('member_workout_stats', offline);
    await renderScreen(<EffortScreen />);
    expect(await screen.findByText(/connection/i)).toBeTruthy();
    expect(screen.getByTestId('banner').props.accessibilityRole).toBe('alert');
  });

  it('signed out shows the empty state instead of crashing', async () => {
    setSession(null);
    setTable('member_workout_stats', () => ok([]));
    await renderScreen(<EffortScreen />);
    expect(await screen.findByText('No effort scores yet')).toBeTruthy();
  });
});

describe('EffortScreen — partial data and refresh', () => {
  it('a member with no score yet gets a dash, NOT a ring reading "0 of 10"', async () => {
    setTable('member_workout_stats', () => ok([stat('a', null)]));
    setTable('profiles', () => ok([{ id: 'a', full_name: 'Alex' }]));
    await renderScreen(<EffortScreen />);

    expect(await screen.findByTestId('effort-unscored')).toBeTruthy();
    // The regression this guards: an arc at zero next to "No effort score yet"
    // announced "Average effort 0 of 10" — a measurement of something unmeasured.
    expect(screen.queryByTestId('effort-ring')).toBeNull();
    expect(screen.queryByLabelText('Average effort 0 of 10')).toBeNull();
    expect(screen.queryByText('of 10')).toBeNull();

    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.getByText('No effort score yet')).toBeTruthy();
    expect(screen.getByLabelText('Average effort: not scored yet')).toBeTruthy();
    expect(
      screen.getByText('Your coach scores the effort once you finish a workout.'),
    ).toBeTruthy();
    // The rest of the card is unchanged: completed count and streak still show.
    expect(screen.getByTestId('effort-stats').children).toHaveLength(2);
  });

  it('a scored member is not told the average three times over', async () => {
    setTable('member_workout_stats', () => ok([stat('a', 8)]));
    setTable('profiles', () => ok([{ id: 'a', full_name: 'Alex' }]));
    await renderScreen(<EffortScreen />);

    expect(await screen.findByLabelText('Average effort 8 of 10')).toBeTruthy();
    expect(screen.getByTestId('effort-ring')).toBeTruthy();
    expect(screen.queryByTestId('effort-unscored')).toBeNull();
    expect(screen.queryByText('No effort score yet')).toBeNull();
    // The number lives in the ring only — no "8/10" tile echoing it underneath.
    expect(screen.queryByText('8/10')).toBeNull();
    expect(screen.getByTestId('effort-stats').children).toHaveLength(2);
  });

  it('a missing profile row falls back to a name instead of blank', async () => {
    setTable('member_workout_stats', () => ok([stat('a', 8), stat('b', 6)]));
    setTable('profiles', () => ok([{ id: 'a', full_name: 'Alex' }]));
    await renderScreen(<EffortScreen />);
    const rows = await screen.findAllByLabelText(/^Rank \d/);
    expect(rows[1].props.accessibilityLabel).toContain('Unknown member');
  });

  it('pull-to-refresh refetches the leaderboard', async () => {
    let calls = 0;
    setTable('member_workout_stats', () => {
      calls += 1;
      return ok([stat('a', 8)]);
    });
    setTable('profiles', () => ok([{ id: 'a', full_name: 'Alex' }]));
    await renderScreen(<EffortScreen />);
    await screen.findByTestId('effort-summary');

    await act(async () => {
      screen.getByTestId('effort-list').props.refreshControl.props.onRefresh();
    });
    await waitFor(() => expect(calls).toBe(2));
  });

  it('stacks the summary tiles one per row at 130% text', async () => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1.3);
    setTable('member_workout_stats', () => ok([stat('a', 8)]));
    setTable('profiles', () => ok([{ id: 'a', full_name: 'Alex' }]));
    await renderScreen(<EffortScreen />);

    const tiles = await screen.findByTestId('effort-stats');
    for (const tile of tiles.children) {
      if (typeof tile === 'string') continue;
      expect(StyleSheet.flatten(tile.props.style).flexBasis).toBe('100%');
    }
  });
});

describe('EffortReviewScreen — gate, loading and empty', () => {
  it('waits 300ms before drawing the review skeletons', async () => {
    jest.useFakeTimers();
    try {
      setTable('profiles', () => new Promise(() => {}));
      await renderScreen(<EffortReviewScreen />);

      expect(screen.queryByTestId('review-list-skeleton')).toBeNull();
      await act(async () => {
        jest.advanceTimersByTime(SKELETON_DELAY_MS);
      });
      expect(screen.getByTestId('review-list-skeleton')).toBeTruthy();
      expect(screen.queryByTestId('activity-indicator')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('a member is told it is coaches only and given somewhere to go', async () => {
    setTable('profiles', () => ok({ role: 'member' }));
    await renderScreen(<EffortReviewScreen />);
    expect(await screen.findByText('Coaches only')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Go to your workouts' }));
    expect(mockReplace).toHaveBeenCalledWith('/workout');
  });

  it('an access check that fails is retryable and never shows the raw error', async () => {
    let attempts = 0;
    setTable('profiles', () => {
      attempts += 1;
      return attempts === 1 ? fail('profiles exploded') : ok({ role: 'member' });
    });
    await renderScreen(<EffortReviewScreen />);
    expect(await screen.findByText('Could not check your access.')).toBeTruthy();
    expect(screen.queryByText('profiles exploded')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Coaches only')).toBeTruthy();
  });

  it('a coach with nothing to review sees why, not a blank list', async () => {
    coachProfiles([]);
    setTable('workout_completions', () => ok([]));
    await renderScreen(<EffortReviewScreen />);
    expect(await screen.findByText('Nothing to review yet')).toBeTruthy();
  });

  it('a failed completions load is an alert with a retry', async () => {
    coachProfiles([{ id: 'm1', full_name: 'Riley' }]);
    let attempts = 0;
    setTable('workout_completions', () => {
      attempts += 1;
      return attempts === 1 ? offline() : ok([]);
    });
    await renderScreen(<EffortReviewScreen />);
    expect(await screen.findByText(/connection/i)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Nothing to review yet')).toBeTruthy();
  });
});

describe('EffortReviewScreen — scoring', () => {
  function seedCoach(rows: ReturnType<typeof completion>[]) {
    coachProfiles([{ id: 'm1', full_name: 'Riley' }]);
    setTable('workout_days', () => ok([{ id: 'd1', day_number: 3, block_name: 'Legs' }]));
    setTable('workout_completions', (ops) => (ops.method === 'update' ? ok(null) : ok(rows)));
  }

  it('the 1-10 control is two fixed rows of five, not a wrap that spills to 4/4/2', async () => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1);
    seedCoach([completion('c1', null)]);
    await renderScreen(<EffortReviewScreen />);

    const picker = await screen.findByTestId('score-picker');
    expect(StyleSheet.flatten(picker.props.style).flexWrap).toBeUndefined();
    const rows = picker.children.filter((child) => typeof child !== 'string');
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect((row as { children: unknown[] }).children).toHaveLength(5);
    }
  });

  it('drops to two scores per row at 130% text so a two-digit label still fits', async () => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1.3);
    seedCoach([completion('c1', null)]);
    await renderScreen(<EffortReviewScreen />);

    const rows = (await screen.findByTestId('score-picker')).children.filter(
      (child) => typeof child !== 'string',
    );
    expect(rows).toHaveLength(5);
    expect((rows[0] as { children: unknown[] }).children).toHaveLength(2);
  });

  it('an unscored row says "Not scored" in words, a scored one shows its number', async () => {
    seedCoach([completion('c1', null), completion('c2', 6)]);
    await renderScreen(<EffortReviewScreen />);
    expect(await screen.findByText('Not scored')).toBeTruthy();
    expect(screen.getByText('6/10')).toBeTruthy();
    expect(screen.getByTestId('review-c1')).toBeTruthy();
  });

  it('only the row being saved goes busy, and it announces itself', async () => {
    let release: (() => void) | undefined;
    coachProfiles([{ id: 'm1', full_name: 'Riley' }]);
    setTable('workout_days', () => ok([{ id: 'd1', day_number: 3, block_name: 'Legs' }]));
    setTable('workout_completions', (ops) =>
      ops.method === 'update'
        ? new Promise((resolve) => {
            release = () => resolve(ok(null));
          })
        : ok([completion('c1', null), completion('c2', null)]),
    );
    await renderScreen(<EffortReviewScreen />);

    const buttons = await screen.findAllByRole('button', { name: 'Score Riley 7 out of 10' });
    await fireEvent.press(buttons[0]);

    const saving = await screen.findByTestId('review-saving-c1');
    expect(saving.props.accessibilityLiveRegion).toBe('polite');
    expect(saving.props.accessibilityLabel).toBe("Saving Riley's score");
    expect(screen.queryByTestId('review-saving-c2')).toBeNull();
    // The other row stays usable while this one writes.
    expect(buttons[0].props.accessibilityState.disabled).toBe(true);
    expect(buttons[1].props.accessibilityState.disabled).toBe(false);

    await act(async () => {
      release?.();
    });
    await waitFor(() => expect(screen.queryByTestId('review-saving-c1')).toBeNull());
  });

  it('a failed save is announced and the raw error stays hidden', async () => {
    coachProfiles([{ id: 'm1', full_name: 'Riley' }]);
    setTable('workout_days', () => ok([{ id: 'd1', day_number: 3, block_name: 'Legs' }]));
    setTable('workout_completions', (ops) =>
      ops.method === 'update' ? offline() : ok([completion('c1', null)]),
    );
    await renderScreen(<EffortReviewScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Score Riley 5 out of 10' }));
    const banner = await screen.findByTestId('banner');
    expect(banner.props.accessibilityRole).toBe('alert');
    expect(screen.getByText('The score was not saved. Tap a number to try again.')).toBeTruthy();
    expect(screen.queryByText('Network request failed')).toBeNull();
  });

  it('pull-to-refresh refetches the completions', async () => {
    let loads = 0;
    coachProfiles([{ id: 'm1', full_name: 'Riley' }]);
    setTable('workout_days', () => ok([{ id: 'd1', day_number: 3, block_name: 'Legs' }]));
    setTable('workout_completions', () => {
      loads += 1;
      return ok([completion('c1', null)]);
    });
    await renderScreen(<EffortReviewScreen />);
    await screen.findByTestId('review-c1');

    await act(async () => {
      screen.getByTestId('effort-review-list').props.refreshControl.props.onRefresh();
    });
    await waitFor(() => expect(loads).toBe(2));
    expect(fakeCalls.some((call) => call.method === 'update')).toBe(false);
  });
});
