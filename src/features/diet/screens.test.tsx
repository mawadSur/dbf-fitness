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
import { fakeCalls, fakeRpcCalls, resetFake, setRpc, setSession, setTable } from './fakeSupabase';

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
const mockMyCoachOptions: ({ enabled?: boolean } | undefined)[] = [];
jest.mock('../coaching', () => ({
  useMyCoach: (options?: { enabled?: boolean }) => {
    mockMyCoachOptions.push(options);
    return mockMyCoach;
  },
}));
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
  mockMyCoachOptions.length = 0;
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

  it('shows "Choose your coach" for a member without a coach and opens /coach/pick', async () => {
    seedHome('member');
    await renderScreen(<HomeScreen />);
    const card = await screen.findByRole('button', { name: 'Choose your coach' });
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
    expect(screen.queryByRole('button', { name: 'Choose your coach' })).toBeNull();
  });

  it.each(['coach', 'admin'] as const)('never asks for a coach on behalf of a %s', async (role) => {
    seedHome(role);
    await renderScreen(<HomeScreen />);
    await screen.findByText('Welcome back, Coach Sam');
    expect(mockMyCoachOptions.length).toBeGreaterThan(0);
    expect(mockMyCoachOptions.every((o) => o?.enabled === false)).toBe(true);
  });

  it('enables the coach lookup only once the profile says member', async () => {
    seedHome('member');
    await renderScreen(<HomeScreen />);
    await screen.findByText('Hi, Sam');
    expect(mockMyCoachOptions[0]?.enabled).toBe(false);
    expect(mockMyCoachOptions[mockMyCoachOptions.length - 1]?.enabled).toBe(true);
  });

  it.each(['coach', 'admin'] as const)('never shows member content to a %s', async (role) => {
    seedHome(role);
    await renderScreen(<HomeScreen />);
    await screen.findByText('Welcome back, Coach Sam');
    expect(screen.queryByRole('button', { name: 'Choose your coach' })).toBeNull();
    // The old screen congratulated staff with the member's "Plan complete".
    expect(screen.queryByText('Plan complete')).toBeNull();
    expect(screen.queryByTestId('home-streak')).toBeNull();
  });

  it('gives a coach rows to live classes, recordings and effort review', async () => {
    seedHome('coach');
    await renderScreen(<HomeScreen />);
    await screen.findByText('Welcome back, Coach Sam');
    await fireEvent.press(screen.getByTestId('staff-link-/effort-review'));
    expect(mockPush).toHaveBeenCalledWith('/effort-review');
    expect(screen.getByTestId('staff-link-/community/live')).toBeTruthy();
    expect(screen.getByTestId('staff-link-/notes')).toBeTruthy();
  });

  it('does not offer effort review to an admin', async () => {
    seedHome('admin');
    await renderScreen(<HomeScreen />);
    await screen.findByText('Welcome back, Coach Sam');
    expect(screen.queryByTestId('staff-link-/effort-review')).toBeNull();
  });

  it.each(['coach', 'admin'] as const)(
    'shows no error banner for a %s who has no member_workout_stats row',
    async (role) => {
      setTable('profiles', () => ok({ full_name: 'Sam', role }));
      // Members-only view: staff get zero rows (PGRST116 if the screen used .single()).
      setTable('member_workout_stats', () => ok(null));
      setTable('workout_plans', () => ok(null));
      await renderScreen(<HomeScreen />);
      await screen.findByText('Welcome back, Coach Sam');
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

  // ScreenShell now owns the top inset (it pads the shell, not the scroll
  // content), so nothing can scroll under the status-bar clock.
  it('keeps content clear of the status bar via the shell top inset', async () => {
    seedHome('member');
    await renderScreen(<HomeScreen />);
    await screen.findByText('Hi, Sam');
    expect(StyleSheet.flatten(screen.getByTestId('home').props.style).paddingTop).toBe(47);
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
    expect(screen.queryByRole('button', { name: 'Choose your coach' })).toBeNull();
    expect(screen.getByTestId('home-primary-loading')).toBeTruthy();
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

  it('check-ins load failure shows friendly network copy, not the raw text', async () => {
    seedFood();
    setTable('diet_checkins', () => ({
      data: null,
      error: new TypeError('Network request failed'),
    }));
    await renderScreen(<FoodScreen />);

    expect(
      await screen.findByText("Can't reach the server. Check your connection and try again.")
    ).toBeTruthy();
    expect(screen.queryByText(/Network request failed/)).toBeNull();
  });

  it('check-ins load failure with an unclassified error shows the screen fallback', async () => {
    seedFood();
    setTable('diet_checkins', () => fail('boom'));
    await renderScreen(<FoodScreen />);

    expect(
      await screen.findByText("Could not load today's check-ins. Pull down to retry.")
    ).toBeTruthy();
    expect(screen.queryByText('boom')).toBeNull();
  });

  it('toggle failure shows friendly network copy, not the raw text', async () => {
    seedFood();
    setTable('diet_checkins', (ops) =>
      ops.method === 'select'
        ? ok([{ diet_item_id: 'i1' }])
        : { data: null, error: new TypeError('Network request failed') }
    );
    await renderScreen(<FoodScreen />);
    await screen.findByText('Lean Plan');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Chicken' }));

    expect(
      await screen.findByText("Can't reach the server. Check your connection and try again.")
    ).toBeTruthy();
    expect(screen.queryByText(/Network request failed/)).toBeNull();
  });

  it('toggle failure with an unclassified error shows the screen fallback', async () => {
    seedFood();
    setTable('diet_checkins', (ops) =>
      ops.method === 'select' ? ok([{ diet_item_id: 'i1' }]) : fail('boom')
    );
    await renderScreen(<FoodScreen />);
    await screen.findByText('Lean Plan');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Chicken' }));

    expect(await screen.findByText('Could not save that change.')).toBeTruthy();
    expect(screen.queryByText('boom')).toBeNull();
  });

  it('error state offers Try again, which refetches', async () => {
    let attempts = 0;
    setTable('diet_plan_assignments', () => {
      attempts += 1;
      return attempts === 1 ? fail('boom') : ok(null);
    });
    setTable('diet_checkins', () => ok([]));
    await renderScreen(<FoodScreen />);

    expect(await screen.findByText('Could not load your diet plan.')).toBeTruthy();
    expect(screen.queryByText('boom')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/No diet plan assigned yet/)).toBeTruthy();
    expect(attempts).toBe(2);
  });

  it('reserves the list height while the plan is still loading', async () => {
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    setTable('diet_plan_assignments', async () => {
      await held;
      return ok(null);
    });
    setTable('diet_checkins', () => ok([]));
    await renderScreen(<FoodScreen />);

    // A skeleton, never a bare full-screen spinner.
    expect(screen.getByTestId('food-skeleton')).toBeTruthy();
    expect(screen.queryByTestId('food-list')).toBeNull();
    release?.();
    expect(await screen.findByText(/No diet plan assigned yet/)).toBeTruthy();
  });

  it('empty plan offers a next action instead of a dead end', async () => {
    setTable('diet_plan_assignments', () => ok(null));
    setTable('diet_checkins', () => ok([]));
    await renderScreen(<FoodScreen />);

    expect(await screen.findByTestId('food-empty')).toBeTruthy();
    expect(screen.getByText('No diet plan yet')).toBeTruthy();
    expect(screen.getByText(/Pull down to look again/)).toBeTruthy();
  });

  it('a plan with no items says so rather than showing a blank list', async () => {
    seedFood();
    setTable('diet_items', () => ok([]));
    await renderScreen(<FoodScreen />);

    expect(await screen.findByTestId('food-no-items')).toBeTruthy();
    expect(screen.getByText('0 of 0 ticked off')).toBeTruthy();
  });

  it('shows the day heading and the progress count', async () => {
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
    jest.setSystemTime(new Date('2026-09-20T09:00:00Z'));
    seedFood();
    await renderScreen(<FoodScreen />);

    expect(await screen.findByText('Sunday 20 September')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('1 of 2 ticked off')).toBeTruthy());
  });

  it('disables only the row being saved while the toggle is in flight', async () => {
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    seedFood();
    setTable('diet_checkins', async (ops) => {
      if (ops.method === 'select') return ok([{ diet_item_id: 'i1' }]);
      await held;
      return ok(null);
    });
    await renderScreen(<FoodScreen />);
    await screen.findByText('Lean Plan');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Chicken' }));

    await waitFor(() =>
      expect(
        screen.getByRole('checkbox', { name: 'Chicken' }).props.accessibilityState.disabled
      ).toBe(true)
    );
    expect(screen.getByRole('checkbox', { name: 'Oats' }).props.accessibilityState.disabled).toBe(
      false
    );
    release?.();
    await waitFor(() =>
      expect(
        screen.getByRole('checkbox', { name: 'Chicken' }).props.accessibilityState.disabled
      ).toBe(false)
    );
  });

  it('pull-to-refresh refetches the plan and the check-ins', async () => {
    seedFood();
    await renderScreen(<FoodScreen />);
    await screen.findByText('Lean Plan');
    const before = fakeCalls.filter((c) => c.table === 'diet_items').length;

    await fireEvent(screen.getByTestId('food-list'), 'refresh');

    await waitFor(() =>
      expect(fakeCalls.filter((c) => c.table === 'diet_items').length).toBeGreaterThan(before)
    );
    expect(fakeCalls.some((c) => c.table === 'diet_checkins' && c.method === 'select')).toBe(true);
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

    // One status word per row now: the old label said both "Upcoming" and
    // "today" for the same day.
    await fireEvent.press(
      await screen.findByRole('button', {
        name: 'Day 2, Pull, Today',
      })
    );
    expect(mockPush).toHaveBeenCalledWith('/workout/d2');
    expect(screen.getByRole('button', { name: 'Day 1, Push, Done, about 40 min' })).toBeTruthy();
  });

  it('keeps the list clear of the status bar via the shell top inset', async () => {
    setTable('workout_plans', () => ok({ id: 'plan' }));
    setTable('workout_days', () =>
      ok([{ id: 'd1', day_number: 1, block_name: 'Push', duration_minutes: 40 }])
    );
    setTable('workout_completions', () => ok([]));
    await renderScreen(<WorkoutScreen />);
    await screen.findByRole('button', { name: /Day 1, Push/ });
    expect(StyleSheet.flatten(screen.getByTestId('workout').props.style).paddingTop).toBe(47);
  });

  it('error state has a working Try again', async () => {
    let attempts = 0;
    setTable('workout_plans', () => {
      attempts += 1;
      return attempts === 1 ? fail('nope') : ok(null);
    });
    await renderScreen(<WorkoutScreen />);
    expect(await screen.findByText('Could not load your workout plan.')).toBeTruthy();
    expect(screen.queryByText('nope')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/hasn't assigned a workout plan/)).toBeTruthy();
  });
});

describe('Workout day and exercise error states', () => {
  it('day screen error is not a dead end: Back and Try again', async () => {
    mockParams = { dayId: 'd1' };
    setTable('workout_days', () => fail('day failed'));
    await renderScreen(<WorkoutDayScreen />);
    expect(await screen.findByText('Could not load this workout day.')).toBeTruthy();
    expect(screen.queryByText('day failed')).toBeNull();
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
    setTable('workout_completions', () => ok(null));
    setRpc('finish_workout', () =>
      ok([{ completion_id: 'comp-1', already_logged: false, completed_at: '2026-09-21T08:00:00Z' }]),
    );
    await renderScreen(<WorkoutDayScreen />);
    await fireEvent.press(await screen.findByRole('checkbox', { name: 'Bench' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Finish workout' }));

    expect(await screen.findByText(/Workout complete/)).toBeTruthy();
    // ONE atomic call now, not two client inserts that could half-apply.
    const call = fakeRpcCalls.find((c) => c.name === 'finish_workout');
    expect(call?.args).toMatchObject({ p_workout_day_id: 'd1', p_exercise_ids: ['e1'] });
    expect(typeof (call?.args as { p_client_request_id?: unknown }).p_client_request_id).toBe(
      'string',
    );
    expect(fakeCalls.some((c) => c.table === 'exercise_completions')).toBe(false);
  });

  // `finish_workout` is idempotent: a repeat for the same local day comes back
  // as a normal 200 with already_logged, NOT the 23505 the two-insert path threw.
  it('day screen treats an idempotent repeat as "already logged", not a celebration', async () => {
    mockParams = { dayId: 'd1' };
    setTable('workout_days', () => ok({ day_number: 1, block_name: 'Push' }));
    setTable('exercises', () =>
      ok([{ id: 'e1', name: 'Bench', reps_or_duration: '5x5', order_index: 1 }])
    );
    setTable('workout_completions', () => ok(null));
    setRpc('finish_workout', () =>
      ok([{ completion_id: 'comp-1', already_logged: true, completed_at: '2026-09-21T08:00:00Z' }]),
    );
    await renderScreen(<WorkoutDayScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Finish workout' }));

    expect(await screen.findByText(/already logged this workout today/)).toBeTruthy();
    expect(screen.queryByText(/Workout complete/)).toBeNull();
    expect(screen.queryByTestId('finish-error')).toBeNull();
  });

  // TEMPORARY BRIDGE guard — delete with the fallback once D1a is merged.
  it('day screen still finishes against a database without finish_workout yet', async () => {
    mockParams = { dayId: 'd1' };
    setTable('workout_days', () => ok({ day_number: 1, block_name: 'Push' }));
    setTable('exercises', () =>
      ok([{ id: 'e1', name: 'Bench', reps_or_duration: '5x5', order_index: 1 }])
    );
    setTable('workout_completions', () => ok({ id: 'comp-1' }));
    setTable('exercise_completions', () => ok(null));
    // No setRpc: the fake answers PGRST202 exactly like PostgREST does.
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

    const button = await screen.findByRole('button', { name: 'Logged for today' });
    expect(button.props.accessibilityState.disabled).toBe(true);
    expect(
      screen.getByText(/already logged this workout today/)
    ).toBeTruthy();
    await fireEvent.press(button);
    expect(fakeCalls.some((c) => c.table === 'workout_completions' && c.method === 'insert')).toBe(
      false
    );
  });

  /**
   * One chip renders both kinds of prescription, so a fixed clock glyph
   * mislabelled half the data: "12 reps" behind a clock says twelve of
   * something temporal, and reps are not a duration.
   */
  it.each([
    ['12 reps', 'icon-workout', 'icon-clock'],
    ['30s', 'icon-clock', 'icon-workout'],
  ])('badges %p with the icon that matches it', async (value, shown, hidden) => {
    mockParams = { id: 'e1' };
    setTable('exercises', () =>
      ok({ name: 'Bench', reps_or_duration: value, detail: null, image_key: null })
    );
    await renderScreen(<ExerciseDetailScreen />);
    expect(await screen.findByText(value)).toBeTruthy();
    expect(screen.getByTestId(shown, { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId(hidden, { includeHiddenElements: true })).toBeNull();
  });

  it('exercise screen error has Back and Try again', async () => {
    mockParams = { id: 'e1' };
    setTable('exercises', () => fail('ex failed'));
    await renderScreen(<ExerciseDetailScreen />);
    expect(await screen.findByText('Could not load this exercise.')).toBeTruthy();
    expect(screen.queryByText('ex failed')).toBeNull();
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
    await screen.findByText('Effort leaderboard');
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
    expect(await screen.findByText('Your effort')).toBeTruthy();
    expect(screen.getByLabelText('Average effort 8 of 10')).toBeTruthy();
    // The score is the ring's big number now, not a tile repeating "8/10".
    expect(screen.getByTestId('effort-ring')).toBeTruthy();
    expect(screen.getByText('8')).toBeTruthy();
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
    expect(await screen.findByText('Could not load effort data.')).toBeTruthy();
    expect(screen.queryByText('stats down')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No effort scores yet')).toBeTruthy();
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

  it('coach scores with 44pt selectable buttons and the score is persisted', async () => {
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
    const box = StyleSheet.flatten(seven.props.style);
    expect(box.minWidth).toBeGreaterThanOrEqual(44);
    expect(box.minHeight).toBeGreaterThanOrEqual(44);
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
  // The grid is keyed to the UTC clock, so the fixture has to live in the month
  // the screen will actually open on. The 15th is in every month and is not
  // today often enough to matter — the label regex tolerates it either way.
  const midMonth = () => {
    const now = new Date();
    const month = `${now.getUTCMonth() + 1}`.padStart(2, '0');
    return `${now.getUTCFullYear()}-${month}-15T12:00:00Z`;
  };

  it('draws exactly one brand header, and shows stats plus the month grid', async () => {
    setTable('member_workout_stats', () =>
      ok({
        current_streak: 4,
        completed_count: 9,
        missed_count: 1,
        avg_effort_score: 8.44,
      })
    );
    setTable('workout_completions', () =>
      ok([{ id: 'w1', status: 'completed', effort_score: 8, completed_at: midMonth() }])
    );
    await renderScreen(<CalendarScreen />);
    expect(await screen.findByText('4d')).toBeTruthy();
    expect(screen.getByText('8.4/10')).toBeTruthy();
    expect(screen.getByTestId('month-grid')).toBeTruthy();
    // The route used to carry a NATIVE stack header, which is the one piece of
    // chrome that does not read `useTheme()`: in dark mode it drew a hard-white
    // band over the dark-emerald page and swallowed the status-bar glyphs. The
    // screen now owns the same `ScreenHeader` every other route uses — ONE
    // "Calendar" heading, with a back control, and no system-font duplicate.
    const titles = screen.getAllByText('Calendar');
    expect(titles).toHaveLength(1);
    expect(titles[0].props.accessibilityRole).toBe('header');
    expect(screen.getByTestId('screen-header-back')).toBeTruthy();
    // The "Missed" tile is gone on purpose: nothing ever writes a missed row.
    expect(screen.queryByText('Missed')).toBeNull();
    expect(screen.getByText('This month')).toBeTruthy();
    expect(
      screen.getByLabelText(/15 \w+, (today, )?workout completed, effort 8 out of 10/)
    ).toBeTruthy();
  });

  it('shows the empty history message', async () => {
    setTable('member_workout_stats', () => ok(null));
    setTable('workout_completions', () => ok([]));
    await renderScreen(<CalendarScreen />);
    expect(await screen.findByText('No workouts logged yet')).toBeTruthy();
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
    expect(await screen.findByText('No workouts logged yet')).toBeTruthy();
  });
});
