/**
 * Exercise row shapes shared by the workout screens.
 *
 * `image_key` is the only addition the redesign makes to the table's read
 * surface: it names which vector pictogram to draw. It is nullable on purpose —
 * a coach typing a new exercise never fills it in, and
 * `resolveExerciseImageKey` falls back to the exercise NAME (and then to a
 * category default) so a row without a key still gets an intentional drawing.
 */

/** A row of `public.exercises` as the day detail reads it. */
export type ExerciseListRow = {
  id: string;
  name: string;
  reps_or_duration: string;
  order_index: number;
  image_key: string | null;
};

/** A row of `public.exercises` as the exercise detail reads it. */
export type ExerciseDetailRow = {
  name: string;
  reps_or_duration: string;
  detail: string | null;
  image_key: string | null;
};

/** The columns the day detail selects, in one place so the two stay in step. */
export const EXERCISE_LIST_COLUMNS = 'id, name, reps_or_duration, order_index, image_key';

/** The columns the exercise detail selects. */
export const EXERCISE_DETAIL_COLUMNS = 'name, reps_or_duration, detail, image_key';
