/**
 * Rendering a structured prescription.
 *
 * `exercises` now carries the prescription twice: as the structured columns a
 * coach edits (`prescription_mode`, `sets`, `reps_min`…) and as the legacy
 * `reps_or_duration` TEXT every existing screen reads. The database keeps the
 * two in step with a trigger, and `public.format_prescription_text()` is the
 * function that does the rendering there.
 *
 * This module is the SAME renderer in TypeScript. It exists so a screen can
 * show a prescription it has only just edited — before a round trip — and get
 * character-for-character what the server would have stored. Any change here
 * has to be mirrored in migration 20260921110000, and vice versa.
 *
 * `formatPrescription()` is the entry point for display code: hand it an
 * exercise row of EITHER shape and it renders the structure when it is there
 * and falls back to the legacy text when it is not.
 */

/** The prescription kinds `exercises.prescription_mode` allows. */
export type PrescriptionMode =
  | 'reps'
  | 'range'
  | 'seconds'
  | 'per_side'
  | 'amrap'
  | 'distance'
  | 'notes';

export const PRESCRIPTION_MODES: readonly PrescriptionMode[] = [
  'reps',
  'range',
  'seconds',
  'per_side',
  'amrap',
  'distance',
  'notes',
];

/** The structured columns, named as the draft jsonb names them. */
export type Prescription = {
  mode: PrescriptionMode;
  sets?: number | null;
  reps_min?: number | null;
  reps_max?: number | null;
  seconds?: number | null;
  rest_seconds?: number | null;
  weight?: number | null;
  weight_unit?: 'kg' | 'lb' | null;
  distance_m?: number | null;
  notes?: string | null;
};

/**
 * An exercise row as the screens see it: the legacy text is always present,
 * the structured columns are present once the row has been through the
 * prescription migration.
 */
export type PrescribedExercise = {
  reps_or_duration?: string | null;
  prescription_mode?: string | null;
  sets?: number | null;
  reps_min?: number | null;
  reps_max?: number | null;
  seconds?: number | null;
  rest_seconds?: number | null;
  weight?: number | null;
  weight_unit?: string | null;
  distance_m?: number | null;
  notes?: string | null;
};

function isMode(value: unknown): value is PrescriptionMode {
  return typeof value === 'string' && (PRESCRIPTION_MODES as readonly string[]).includes(value);
}

/**
 * Durations read as minutes when they divide evenly: "2 min" beats "120s".
 * Mirrors the same branch in format_prescription_text().
 */
function duration(seconds: number | null | undefined): string | null {
  if (seconds == null) return null;
  return seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds}s`;
}

/** Postgres renders the weight with trim_scale + FM9990.99: no trailing zeros. */
function weightText(weight: number, unit: string | null | undefined): string {
  const rounded = Math.round(weight * 100) / 100;
  return ` @ ${String(rounded)}${unit ?? 'kg'}`;
}

function distanceText(metres: number): string {
  return metres >= 1000 && metres % 1000 === 0 ? `${metres / 1000}km` : `${metres}m`;
}

function core(p: Prescription): string | null {
  const dur = duration(p.seconds);
  const min = p.reps_min ?? null;
  const max = p.reps_max ?? null;

  switch (p.mode) {
    case 'reps':
      return min == null ? null : `${min} reps`;
    case 'range':
      return min == null || max == null ? null : `${min}-${max} reps`;
    case 'seconds':
      return dur;
    case 'per_side':
      if (min != null && max != null) return `${min}-${max} reps/side`;
      if (min != null) return `${min} reps/side`;
      return dur == null ? null : `${dur}/side`;
    case 'amrap':
      return dur == null ? 'AMRAP' : `AMRAP ${dur}`;
    case 'distance':
      return p.distance_m == null ? null : distanceText(p.distance_m);
    case 'notes': {
      const trimmed = (p.notes ?? '').trim();
      return trimmed === '' ? null : trimmed;
    }
    default:
      return null;
  }
}

/**
 * The TypeScript twin of `public.format_prescription_text()`.
 *
 * Returns `null` for a structure that cannot be rendered — mode 'reps' with no
 * rep count, say. That is not a formatting failure to paper over: it is the
 * same incomplete prescription the database refuses to publish, and the caller
 * should show the legacy text (or nothing) rather than invent a number.
 */
export function formatPrescriptionText(prescription: Prescription | null | undefined): string | null {
  if (!prescription || !isMode(prescription.mode)) return null;

  let text = core(prescription);
  if (text == null) return null;

  // AMRAP is one open-ended block and 'notes' is verbatim coach text; neither
  // takes a machine-made set prefix.
  if (prescription.sets != null && prescription.mode !== 'amrap' && prescription.mode !== 'notes') {
    text = `${prescription.sets}x${text}`;
  }

  if (prescription.weight != null && prescription.mode !== 'notes') {
    text += weightText(prescription.weight, prescription.weight_unit);
  }

  return text;
}

/** Reads the structured columns off a row, or null when the row has none. */
export function prescriptionOf(exercise: PrescribedExercise | null | undefined): Prescription | null {
  if (!exercise || !isMode(exercise.prescription_mode)) return null;
  const unit = exercise.weight_unit === 'kg' || exercise.weight_unit === 'lb' ? exercise.weight_unit : null;
  return {
    mode: exercise.prescription_mode,
    sets: exercise.sets ?? null,
    reps_min: exercise.reps_min ?? null,
    reps_max: exercise.reps_max ?? null,
    seconds: exercise.seconds ?? null,
    rest_seconds: exercise.rest_seconds ?? null,
    weight: exercise.weight ?? null,
    weight_unit: unit,
    distance_m: exercise.distance_m ?? null,
    notes: exercise.notes ?? null,
  };
}

/**
 * What to print on the chip, for a row of either shape.
 *
 * Structure wins when it renders, because it is what the coach actually set;
 * `reps_or_duration` is the fallback for rows written by an older client and
 * for structures too incomplete to render.
 */
export function formatPrescription(exercise: PrescribedExercise | null | undefined): string {
  const fromStructure = formatPrescriptionText(prescriptionOf(exercise));
  if (fromStructure != null) return fromStructure;
  return (exercise?.reps_or_duration ?? '').trim();
}

/**
 * True when the prescription is measured in TIME — the one question the chip
 * icon needs answered (a clock badge on "12 reps" contradicts the value).
 * Modes decide it when they are present; otherwise the caller should fall back
 * to `isDuration(reps_or_duration)` from ./repsOrDuration.
 */
export function isTimeBasedPrescription(exercise: PrescribedExercise | null | undefined): boolean | null {
  const p = prescriptionOf(exercise);
  if (!p) return null;
  if (p.mode === 'seconds') return true;
  if (p.mode === 'amrap') return p.seconds != null;
  if (p.mode === 'per_side') return p.reps_min == null && p.seconds != null;
  return false;
}

/** Rest between sets, for the screens that show it. Null when not prescribed. */
export function formatRest(exercise: PrescribedExercise | null | undefined): string | null {
  const rest = prescriptionOf(exercise)?.rest_seconds ?? null;
  if (rest == null || rest <= 0) return null;
  return `${duration(rest)} rest`;
}
