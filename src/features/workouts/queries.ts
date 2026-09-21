/**
 * Supabase reads behind the workout screens.
 *
 * They live here rather than inside the screens so a screen file stays a
 * layout, and so the shaping they do (`planSnapshot`) is the same one Home and
 * the day list both see.
 */

import { supabase } from '../../services/supabase/client';
import {
  EXERCISE_DETAIL_COLUMNS,
  EXERCISE_LIST_COLUMNS,
  type ExerciseDetailRow,
  type ExerciseListRow,
} from '../../types/exercise';
import { utcDayRange } from './completionWindow';
import { planSnapshot, type PlanDay, type PlanSnapshot } from './planSummary';

export async function getMemberId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/** Every day of the member's plan, plus which of them are already completed. */
export type PlanOverview = {
  days: PlanDay[];
  completedDayIds: Set<string>;
  /** The first uncompleted day, i.e. the one the list emphasises. */
  todayDayId: string | null;
  snapshot: PlanSnapshot;
};

export async function fetchPlanOverview(memberId: string | null): Promise<PlanOverview> {
  const empty: PlanOverview = {
    days: [],
    completedDayIds: new Set(),
    todayDayId: null,
    snapshot: { kind: 'no-plan' },
  };
  if (!memberId) return empty;

  const { data: plan, error: planError } = await supabase
    .from('workout_plans')
    .select('id')
    .eq('member_id', memberId)
    .maybeSingle();
  if (planError) throw planError;
  if (!plan) return empty;

  const { data: dayRows, error: daysError } = await supabase
    .from('workout_days')
    .select('id, day_number, block_name, duration_minutes')
    .eq('workout_plan_id', plan.id)
    .order('day_number', { ascending: true });
  if (daysError) throw daysError;

  const days: PlanDay[] = (dayRows ?? []).map((row) => ({
    id: row.id,
    dayNumber: row.day_number,
    blockName: row.block_name,
    durationMinutes: row.duration_minutes,
  }));

  const completedDayIds = new Set<string>();
  if (days.length > 0) {
    const { data: completions, error: completionsError } = await supabase
      .from('workout_completions')
      .select('workout_day_id')
      .eq('member_id', memberId)
      .eq('status', 'completed')
      .in(
        'workout_day_id',
        days.map((day) => day.id),
      );
    if (completionsError) throw completionsError;
    for (const row of (completions ?? []) as { workout_day_id: string }[]) {
      completedDayIds.add(row.workout_day_id);
    }
  }

  const snapshot = planSnapshot(days, completedDayIds);

  return {
    days,
    completedDayIds,
    todayDayId: snapshot.kind === 'next-day' ? snapshot.day.id : null,
    snapshot,
  };
}

export type WorkoutDayDetail = {
  dayNumber: number;
  blockName: string;
  durationMinutes: number | null;
  exercises: ExerciseListRow[];
  /** Already logged during the current UTC day — the DB would reject a second insert. */
  completedToday: boolean;
};

export async function fetchWorkoutDay(dayId: string): Promise<WorkoutDayDetail> {
  const { data: day, error: dayError } = await supabase
    .from('workout_days')
    .select('day_number, block_name, duration_minutes')
    .eq('id', dayId)
    .single();
  if (dayError) throw dayError;

  const { data: exercises, error: exercisesError } = await supabase
    .from('exercises')
    .select(EXERCISE_LIST_COLUMNS)
    .eq('workout_day_id', dayId)
    .order('order_index', { ascending: true });
  if (exercisesError) throw exercisesError;

  // Mirrors the DB key (member_id, workout_day_id, (completed_at at time zone 'utc')::date)
  // from migration 20260919152200, so the button is disabled exactly when an insert
  // would 23505. Repeating the day on a later date stays allowed.
  let completedToday = false;
  const memberId = await getMemberId();
  if (memberId) {
    const { startInclusive, endExclusive } = utcDayRange();
    const { count, error: completedError } = await supabase
      .from('workout_completions')
      .select('id', { count: 'exact', head: true })
      .eq('member_id', memberId)
      .eq('workout_day_id', dayId)
      .gte('completed_at', startInclusive)
      .lt('completed_at', endExclusive);
    if (completedError) throw completedError;
    completedToday = (count ?? 0) > 0;
  }

  return {
    dayNumber: day.day_number,
    blockName: day.block_name,
    durationMinutes: day.duration_minutes ?? null,
    exercises: (exercises ?? []) as unknown as ExerciseListRow[],
    completedToday,
  };
}

export type ExerciseDetail = {
  name: string;
  repsOrDuration: string;
  detail: string | null;
  imageKey: string | null;
};

export async function fetchExercise(exerciseId: string): Promise<ExerciseDetail> {
  const { data, error } = await supabase
    .from('exercises')
    .select(EXERCISE_DETAIL_COLUMNS)
    .eq('id', exerciseId)
    .single();
  if (error) throw error;

  const row = data as unknown as ExerciseDetailRow;
  return {
    name: row.name,
    repsOrDuration: row.reps_or_duration,
    detail: row.detail,
    imageKey: row.image_key ?? null,
  };
}

/** Writes one completion plus the exercises the member ticked off. */
export async function finishWorkout(dayId: string, exerciseIds: string[]): Promise<void> {
  const memberId = await getMemberId();
  if (!memberId) throw new Error('Not signed in.');

  const { data: completion, error: completionError } = await supabase
    .from('workout_completions')
    .insert({ member_id: memberId, workout_day_id: dayId, status: 'completed' })
    .select('id')
    .single();
  if (completionError) throw completionError;

  if (exerciseIds.length === 0) return;

  const { error: exerciseError } = await supabase.from('exercise_completions').insert(
    exerciseIds.map((exerciseId) => ({
      workout_completion_id: completion.id,
      exercise_id: exerciseId,
    })),
  );
  if (exerciseError) throw exerciseError;
}
