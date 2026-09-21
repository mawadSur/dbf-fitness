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

/**
 * The structured prescription columns (migration 20260921110000).
 *
 * Additive on purpose: `reps_or_duration` stays NOT NULL and stays the thing
 * every existing screen reads, and the database keeps it in step with these
 * columns via a trigger. A screen opts in by selecting
 * `EXERCISE_PRESCRIPTION_COLUMNS` as well and rendering through
 * `formatPrescription()` in src/features/workouts/prescription.ts.
 */
export const EXERCISE_PRESCRIPTION_COLUMNS =
  'prescription_mode, sets, reps_min, reps_max, seconds, rest_seconds, weight, weight_unit, distance_m, notes, exercise_key, video_url';

/** The structured half of an `exercises` row. Every field is nullable. */
export type ExercisePrescriptionColumns = {
  prescription_mode: string | null;
  sets: number | null;
  reps_min: number | null;
  reps_max: number | null;
  seconds: number | null;
  rest_seconds: number | null;
  weight: number | null;
  weight_unit: string | null;
  distance_m: number | null;
  notes: string | null;
  /** Canonical kebab-case movement key; drives pictogram lookup. */
  exercise_key: string | null;
  /** https:// only, enforced by a CHECK constraint. */
  video_url: string | null;
};

/** A list row that also carries the structured prescription. */
export type ExerciseListRowWithPrescription = ExerciseListRow & ExercisePrescriptionColumns;

/** A detail row that also carries the structured prescription. */
export type ExerciseDetailRowWithPrescription = ExerciseDetailRow & ExercisePrescriptionColumns;
