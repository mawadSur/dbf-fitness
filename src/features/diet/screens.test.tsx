import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import CalendarScreen from '../../../app/calendar';
import EffortScreen from '../../../app/effort';
import EffortReviewScreen from '../../../app/effort-review';
import FoodScreen from '../../../app/(tabs)/food';
import HomeScreen from '../../../app/(tabs)/index';
import WorkoutDayScreen from '../../../app/(tabs)/workout/[dayId]';
import ExerciseDetailScreen from '../../../app/(tabs)/workout/exercise/[id]';
import WorkoutScreen from '../../../app/(tabs)/workout/index';
import { fakeCalls, resetFake, setSession, setTable } from './fakeSupabase';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = true;
let mockParams: Record<string, string> = {};
let mockMyCoach: {
  isSuccess: boolean;
  data: unknown;
  refetch: () => Promise<unknown>;
};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
    canGoBack: () => mockCanGoBack,
  }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('../../services/supabase/client', () => ({
  supabase: jest.requireActual('./fakeSupabase').fakeSupabase,
}));
jest.mock('../coaching', () => ({ useMyCoach: () => mockMyCoach }));
jest.mock('../milestones/useMilestoneCheck', () => ({
  useMilestoneCheck: () => ({ newlyAchievedTier: null, isLoading: false }),
}));

async function renderScreen(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </SafeAreaProvider>
  );
}

const ok = (data: unknown) => ({ data, error: null });
const fail = (message: string) => ({ data: null, error: new Error(message) });

beforeEach(() => {
  jest.clearAllMocks();
  resetFake();
  mockCanGoBack = true;
  mockParams = {};
  mockMyCoach = {
    isSuccess: true,
    data: null,
    refetch: () => Promise.resolve(),
  };
});

describe('HomeScreen coach nudge', () => {
  function seedHome(role: 'member' | 'coach' | 'admin') {
    setTable('profiles', () => ok({ full_name: 'Sam', role }));
    setTable('member_workout_stats', () => ok({ current_streak: 3 }));
    setTable('workout_plans', () => ok(null));
  }

  it('shows "Pick your coach" for a member without a coach and opens /coach/pick', async () => {
    seedHome('member');
    await renderScreen(<HomeScreen />);
    const card = await screen.findByRole('button', { name: 'Pick your coach' });
    await fireEvent.press(card);
    expect(mockPush).toHaveBeenCalledWith('/coach/pick');
  });

  it('hides the nudge once the member has a coach', async () => {
    seedHome('member');
    mockMyCoach = {
      isSuccess: true,
      data: { id: 'c1' },
      refetch: () => Promise.resolve(),
    };
    await renderScreen(<HomeScreen />);
    await screen.findByText('Hi, Sam');
    expect(screen.queryByRole('button', { name: 'Pick your coach' })).toBeNull();
  });

  it.each(['coach', 'admin'] as const)('never shows the nudge to a %s', async (role) => {
    seedHome(role);
    await renderScreen(<HomeScreen />);
    await screen.findByText('Hi, Sam');
    expect(screen.queryByRole('button', { name: 'Pick your coach' })).toBeNull();
  });

  it.each(['coach', 'admin'] as const)(
    'shows no error banner for a %s who has no member_workout_stats row',
    async (role) => {
      setTable('profiles', () => ok({ full_name: 'Sam', role }));
      // Members-only view: staff get zero rows (PGRST116 if the screen used .single()).
      setTable('member_workout_stats', () => ok(null));
      setTable('workout_plans', () => ok(null));
      await renderScreen(<HomeScreen />);
      await screen.findByText('Hi, Sam');
      expect(screen.queryByText('Some of your info could not be loaded.')).toBeNull();
    }
  );

  it('still shows the banner when the stats query really fails', async () => {
    setTable('profiles', () => ok({ full_name: 'Sam', role: 'member' }));
    setTable('member_workout_stats', () => fail('db down'));
    setTable('workout_plans', () => ok(null));
    await renderScreen(<HomeScreen />);
    expect(await screen.findByText('Some of your info could not be loaded.')).toBeTruthy();
  });

  it('pads the top by the safe-area inset plus 16', async () => {
    seedHome('member');
    await renderScreen(<HomeScreen />);
    await screen.findByText('Hi, Sam');
    const scroll = screen.getByTestId('home-scroll');
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle).paddingTop).toBe(47 + 16);
  });

  it('does not flash the nudge while the coach lookup is unresolved', async () => {
    seedHome('member');
    mockMyCoach = {
      isSuccess: false,
      data: undefined,
      refetch: () => Promise.resolve(),
    };
    await renderScreen(<HomeScreen />);
    await screen.findByText('Hi, Sam');
    expect(screen.queryByRole('button', { name: 'Pick your coach' })).toBeNull();
  });
});

describe('FoodScreen', () => {
  const plan = { title: 'Lean Plan', description: 'Eat well', items: [] };

  function seedFood() {
    setTable('diet_plan_assignments', () => ok({ diet_plan_id: 'p1' }));
    setTable('diet_plans', () => ok({ title: plan.title, description: plan.description }));
    setTable('diet_items', () =>
      ok([
        { id: 'i1', name: 'Oats', description: 'Breakfast', order_index: 1 },
        { id: 'i2', name: 'Chicken', description: null, order_index: 2 },
      ])
    );
    setTable('diet_checkins', (ops) =>
      ops.method === 'select' ? ok([{ diet_item_id: 'i1' }]) : ok(null)
    );
  }

  afterEach(() => jest.useRealTimers());

  it('renders items with checked state and queries check-ins for the UTC day', async () => {
    jest.useFakeTimers({
      doNotFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'queueMicrotask',
        'nextTick',
        'setImmediate',
      ],
    });
    jest.setSystemTime(new Date('2026-09-19T23:30:00Z'));
    seedFood();
    await renderScreen(<FoodScreen />);

    expect(await screen.findByText('Lean Plan')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Oats' }).props.accessibilityState.checked).toBe(
        true
      )
    );
    expect(screen.getByRole('checkbox', { name: 'Chicken' }).props.accessibilityState.checked).toBe(
      false
    );
    const select = fakeCalls.find((c) => c.table === 'diet_checkins' && c.method === 'select');
    expect(select?.filters).toContainEqual(['checkin_date', '2026-09-19']);
  });

  it('checking an item inserts a check-in for today (UTC)', async () => {
    jest.useFakeTimers({
      doNotFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'queueMicrotask',
        'nextTick',
        'setImmediate',
      ],
    });
    jest.setSystemTime(new Date('2026-09-20T00:10:00Z'));
    seedFood();
    await renderScreen(<FoodScreen />);
    await screen.findByText('Lean Plan');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Chicken' }));

    await waitFor(() => expect(fakeCalls.some((c) => c.method === 'insert')).toBe(true));
    expect(fakeCalls.find((c) => c.method === 'insert')?.payload).toEqual({
      member_id: 'user-1',
      diet_item_id: 'i2',
      checkin_date: '2026-09-20',
    });
  });

  it('error state offers Try again, which refetches', async () => {
    let attempts = 0;
    setTable('diet_plan_assignments', () => {
      attempts += 1;
      return attempts === 1 ? fail('boom') : ok(null);
    });
    setTable('diet_checkins', () => ok([]));
    await renderScreen(<FoodScreen />);

    expect(await screen.findByText('boom')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/No diet plan assigned yet/)).toBeTruthy();
    expect(attempts).toBe(2);
  });
});

describe('WorkoutScreen', () => {
  it('lists days with accessible labels and opens one', async () => {
    setTable('workout_plans', () => ok({ id: 'plan' }));
    setTable('workout_days', () =>
      ok([
        { id: 'd1', day_number: 1, block_name: 'Push', duration_minutes: 40 },
        { id: 'd2', day_number: 2, block_name: 'Pull', duration_minutes: null },
      ])
    );
    setTable('workout_completions', () => ok([{ workout_day_id: 'd1' }]));
    await renderScreen(<WorkoutScreen />);

    await fireEvent.press(
      await screen.findByRole('button', {
        name: 'Day 2, Pull, Upcoming, today',
      })
    );
    expect(mockPush).toHaveBeenCalledWith('/workout/d2');
    expect(screen.getByRole('button', { name: 'Day 1, Push, Completed' })).toBeTruthy();
  });

  it('pads the list top by the safe-area inset plus 16', async () => {
    setTable('workout_plans', () => ok({ id: 'plan' }));
    setTable('workout_days', () =>
      ok([{ id: 'd1', day_number: 1, block_name: 'Push', duration_minutes: 40 }])
    );
    setTable('workout_completions', () => ok([]));
    await renderScreen(<WorkoutScreen />);
    await screen.findByRole('button', { name: /Day 1, Push/ });
    const list = screen.getByTestId('workout-list');
    expect(StyleSheet.flatten(list.props.contentContainerStyle).paddingTop).toBe(47 + 16);
  });

  it('error state has a working Try again', async () => {
    let attempts = 0;
    setTable('workout_plans', () => {
      attempts += 1;
      return attempts === 1 ? fail('nope') : ok(null);
    });
    await renderScreen(<WorkoutScreen />);
    expect(await screen.findByText('nope')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/hasn't assigned a workout plan/)).toBeTruthy();
  });
});

describe('Workout day and exercise error states', () => {
  it('day screen error is not a dead end: Back and Try again', async () => {
    mockParams = { dayId: 'd1' };
    setTable('workout_days', () => fail('day failed'));
    await renderScreen(<WorkoutDayScreen />);
    expect(await screen.findByText('day failed')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Go back' }));
    expect(mockBack).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('day screen finishes a workout with the checked exercises', async () => {
    mockParams = { dayId: 'd1' };
    setTable('workout_days', () => ok({ day_number: 1, block_name: 'Push' }));
    setTable('exercises', () =>
      ok([{ id: 'e1', name: 'Bench', reps_or_duration: '5x5', order_index: 1 }])
    );
    setTable('workout_completions', () => ok({ id: 'comp-1' }));
    setTable('exercise_completions', () => ok(null));
    await renderScreen(<WorkoutDayScreen />);
    await fireEvent.press(await screen.findByRole('checkbox', { name: 'Bench' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Finish workout' }));

    expect(await screen.findByText(/Workout complete/)).toBeTruthy();
    expect(fakeCalls.find((c) => c.table === 'exercise_completions')?.payload).toEqual([
      { workout_completion_id: 'comp-1', exercise_id: 'e1' },
    ]);
  });

  // Regression guard for migration 20260919152200's one-completion-per-UTC-day key:
  // the mobile polish must keep the button disabled when the insert would 23505.
  it('day screen blocks a second finish on the same UTC day', async () => {
    mockParams = { dayId: 'd1' };
    setTable('workout_days', () => ok({ day_number: 1, block_name: 'Push' }));
    setTable('exercises', () =>
      ok([{ id: 'e1', name: 'Bench', reps_or_duration: '5x5', order_index: 1 }])
    );
    setTable('workout_completions', () => ({ data: null, error: null, count: 1 }));
    await renderScreen(<WorkoutDayScreen />);

    const button = await screen.findByRole('button', { name: 'Finish workout' });
    expect(button.props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('Logged for today')).toBeTruthy();
    await fireEvent.press(button);
    expect(fakeCalls.some((c) => c.table === 'workout_completions' && c.method === 'insert')).toBe(
      false
    );
  });

  it('exercise screen error has Back and Try again', async () => {
    mockParams = { id: 'e1' };
    setTable('exercises', () => fail('ex failed'));
    await renderScreen(<ExerciseDetailScreen />);
    expect(await screen.findByText('ex failed')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Go back' }));
    expect(mockBack).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});

describe('EffortScreen', () => {
  const stat = (id: string, avg: number | null) => ({
    member_id: id,
    completed_count: 2,
    missed_count: 0,
    total_effort_score: 10,
    avg_effort_score: avg,
    current_streak: 1,
  });

  it('ranks by average effort with unscored members last and shows names', async () => {
    setTable('member_workout_stats', () => ok([stat('a', null), stat('b', 7.25), stat('c', 9)]));
    setTable('profiles', () =>
      ok([
        { id: 'a', full_name: 'Alex' },
        { id: 'b', full_name: 'Bo' },
        { id: 'c', full_name: 'Cy' },
      ])
    );
    await renderScreen(<EffortScreen />);
    await screen.findByText('Effort Leaderboard');
    const rows = await screen.findAllByLabelText(/^Rank \d/);
    expect(rows.map((row) => row.props.accessibilityLabel)).toEqual([
      'Rank 1, Cy, 2 completed, average effort 9/10',
      'Rank 2, Bo, 2 completed, average effort 7.3/10',
      'Rank 3, Alex, 2 completed, average effort —',
    ]);
  });

  it('single member sees their own card', async () => {
    setTable('member_workout_stats', () => ok([stat('a', 8)]));
    setTable('profiles', () => ok([{ id: 'a', full_name: 'Alex' }]));
    await renderScreen(<EffortScreen />);
    expect(await screen.findByText('Your Effort')).toBeTruthy();
    expect(screen.getByText('8/10')).toBeTruthy();
  });

  it('Back uses history, or falls back home on a cold start', async () => {
    setTable('member_workout_stats', () => ok([]));
    await renderScreen(<EffortScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Go back' }));
    expect(mockBack).toHaveBeenCalled();

    mockCanGoBack = false;
    await fireEvent.press(screen.getByRole('button', { name: 'Go back' }));
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('error state offers Try again', async () => {
    let attempts = 0;
    setTable('member_workout_stats', () => {
      attempts += 1;
      return attempts === 1 ? fail('stats down') : ok([]);
    });
    await renderScreen(<EffortScreen />);
    expect(await screen.findByText('stats down')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No effort data yet.')).toBeTruthy();
  });
});

describe('EffortReviewScreen', () => {
  it('non-coaches get a Back button instead of a dead end', async () => {
    setTable('profiles', () => ok({ role: 'member' }));
    await renderScreen(<EffortReviewScreen />);
    expect(await screen.findByText('This screen is only available to coaches.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Go back' }));
    expect(mockBack).toHaveBeenCalled();
  });

  it('coach scores with 44pt selectable chips and the score is persisted', async () => {
    setTable('profiles', (ops) =>
      ops.filters.some(([col]) => col === 'id') &&
      ops.filters.length === 1 &&
      !Array.isArray(ops.payload)
        ? ok({ role: 'coach', full_name: 'Casey' })
        : ok([{ id: 'm1', full_name: 'Riley With A Very Long Name' }])
    );
    setTable('workout_completions', (ops) =>
      ops.method === 'update'
        ? ok(null)
        : ok([
            {
              id: 'c1',
              member_id: 'm1',
              workout_day_id: 'd1',
              effort_score: 4,
              completed_at: '2026-09-18T10:00:00Z',
            },
          ])
    );
    setTable('workout_days', () => ok([{ id: 'd1', day_number: 3, block_name: 'Legs' }]));
    await renderScreen(<EffortReviewScreen />);

    const seven = await screen.findByRole('button', {
      name: 'Score Riley With A Very Long Name 7 out of 10',
    });
    expect(seven.props.className ?? '').toContain('h-11 w-11');
    expect(
      screen.getByRole('button', {
        name: 'Score Riley With A Very Long Name 4 out of 10',
      }).props.accessibilityState.selected
    ).toBe(true);
    await fireEvent.press(seven);

    await waitFor(() => expect(fakeCalls.some((c) => c.method === 'update')).toBe(true));
    const update = fakeCalls.find((c) => c.method === 'update');
    expect(update?.payload).toEqual({ effort_score: 7, scored_by: 'user-1' });
    expect(update?.filters).toContainEqual(['id', 'c1']);
  });
});

describe('CalendarScreen', () => {
  it('has no duplicate in-body title and shows stats plus history', async () => {
    setTable('member_workout_stats', () =>
      ok({
        current_streak: 4,
        completed_count: 9,
        missed_count: 1,
        avg_effort_score: 8.44,
      })
    );
    setTable('workout_completions', () =>
      ok([
        {
          id: 'w1',
          status: 'completed',
          effort_score: 8,
          completed_at: '2026-09-18T12:00:00Z',
        },
      ])
    );
    await renderScreen(<CalendarScreen />);
    expect(await screen.findByText('4d')).toBeTruthy();
    expect(screen.getByText('8.4/10')).toBeTruthy();
    expect(screen.getByText('History')).toBeTruthy();
    expect(screen.queryByText('Calendar')).toBeNull();
    expect(screen.getByLabelText(/Completed, effort 8 out of 10$/)).toBeTruthy();
  });

  it('shows the empty history message', async () => {
    setTable('member_workout_stats', () => ok(null));
    setTable('workout_completions', () => ok([]));
    await renderScreen(<CalendarScreen />);
    expect(await screen.findByText('No workouts logged yet.')).toBeTruthy();
  });

  it('error state offers Try again that refetches both queries', async () => {
    let attempts = 0;
    setTable('member_workout_stats', () => {
      attempts += 1;
      return attempts === 1 ? fail('x') : ok(null);
    });
    setTable('workout_completions', () => ok([]));
    await renderScreen(<CalendarScreen />);
    expect(await screen.findByText('Could not load your calendar.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByText('Could not load your calendar.')).toBeNull());
  });

  it('signed-out user shows empty history, not a crash', async () => {
    setSession(null);
    setTable('workout_completions', () => ok([]));
    await renderScreen(<CalendarScreen />);
    expect(await screen.findByText('No workouts logged yet.')).toBeTruthy();
  });
});
