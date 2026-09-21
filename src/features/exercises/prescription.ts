import type { IconName } from '../../components/ui/icons';
import { isDuration } from '../workouts/repsOrDuration';

/**
 * The structured prescription columns the database is growing (`exercises`).
 *
 * Every field is optional here because this formatter has to render rows
 * written by the OLD client too — those carry nothing but `reps_or_duration`,
 * a free-text string — and rows written mid-migration, where the mode is set
 * but a bound has not been backfilled yet.
 */
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

export type PrescriptionInput = {
  /** Legacy free text; still `NOT NULL` in the database, so it is always a fallback. */
  repsOrDuration?: string | null;
  prescriptionMode?: PrescriptionMode | string | null;
  sets?: number | null;
  repsMin?: number | null;
  repsMax?: number | null;
  seconds?: number | null;
  restSeconds?: number | null;
  weight?: number | null;
  weightUnit?: 'kg' | 'lb' | string | null;
  distanceM?: number | null;
  notes?: string | null;
};

/** What the chip on an exercise renders. */
export type FormattedPrescription = {
  /** The chip's text, e.g. "3 x 8-12 reps". Never empty. */
  text: string;
  /** Clock ONLY for time; a rep count gets the workout mark, distance a route mark. */
  icon: IconName;
  /** True when the prescription is measured in time rather than repetitions. */
  timeBased: boolean;
  /** Secondary line: rest and load, when the coach set them. Empty string when not. */
  detail: string;
};

function isPositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isMode(value: unknown): value is PrescriptionMode {
  return typeof value === 'string' && (PRESCRIPTION_MODES as readonly string[]).includes(value);
}

/** "45s", "1:30", "2 min" — a duration a human reads at a glance. */
export function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (rest === 0) return `${minutes} min`;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

/** "400 m" / "1.5 km" — metres until a kilometre reads better. */
export function formatDistance(metres: number): string {
  if (metres < 1000) return `${metres} m`;
  const km = metres / 1000;
  return `${Number.isInteger(km) ? km : Number(km.toFixed(2))} km`;
}

function setsPrefix(sets: number | null | undefined): string {
  return isPositive(sets) ? `${sets} × ` : '';
}

function repRange(min: number | null | undefined, max: number | null | undefined): string | null {
  if (isPositive(min) && isPositive(max) && max !== min) return `${min}–${max}`;
  if (isPositive(min)) return String(min);
  if (isPositive(max)) return String(max);
  return null;
}

/** Load and rest, when the coach set them — the secondary line under the chip. */
function detailOf(input: PrescriptionInput): string {
  const parts: string[] = [];
  if (isPositive(input.weight)) {
    const unit = input.weightUnit === 'lb' ? 'lb' : 'kg';
    parts.push(`${input.weight} ${unit}`);
  }
  if (isPositive(input.restSeconds)) parts.push(`${formatSeconds(input.restSeconds)} rest`);
  return parts.join(' · ');
}

/**
 * The text and ICON for one exercise's prescription, from either shape.
 *
 * Two things this fixes at once:
 *
 * 1. Every rep count was badged with a CLOCK. "12 reps" behind a clock glyph
 *    says twelve of something temporal, and reps are not a duration. The icon
 *    is now read off the MEANING of the prescription, not off the chip.
 * 2. The database is growing structured columns (`prescription_mode`, `sets`,
 *    `reps_min`/`reps_max`, `seconds`, …). Rows written before that migration —
 *    and rows any old client still writes — carry only the free-text
 *    `reps_or_duration`. Both shapes arrive through the same screen, so both
 *    are formatted here, structured first and the legacy string as the fallback.
 *
 * A structured row whose mode is set but whose numbers are missing falls back
 * to the legacy text rather than rendering "× reps": a half-migrated row shows
 * what the coach actually typed instead of a hole.
 */
export function formatPrescription(input: PrescriptionInput): FormattedPrescription {
  const legacy = (input.repsOrDuration ?? '').trim();
  const detail = detailOf(input);
  const mode = isMode(input.prescriptionMode) ? input.prescriptionMode : null;

  const fallback = (): FormattedPrescription => {
    const text = legacy || 'Prescription to come';
    const timeBased = legacy.length > 0 && isDuration(legacy);
    return { text, icon: timeBased ? 'clock' : 'workout', timeBased, detail };
  };

  if (!mode) return fallback();

  const sets = setsPrefix(input.sets);

  if (mode === 'seconds') {
    if (!isPositive(input.seconds)) return fallback();
    return {
      text: `${sets}${formatSeconds(input.seconds)}`,
      icon: 'clock',
      timeBased: true,
      detail,
    };
  }

  if (mode === 'distance') {
    if (!isPositive(input.distanceM)) return fallback();
    return {
      text: `${sets}${formatDistance(input.distanceM)}`,
      icon: 'arrow-right',
      timeBased: false,
      detail,
    };
  }

  if (mode === 'amrap') {
    // "As many reps as possible" is a rep count with no ceiling, so it keeps the
    // rep mark; the time cap, when there is one, is spelled out beside it.
    const cap = isPositive(input.seconds) ? ` in ${formatSeconds(input.seconds)}` : '';
    return { text: `${sets}AMRAP${cap}`, icon: 'workout', timeBased: false, detail };
  }

  if (mode === 'notes') {
    const text = (input.notes ?? '').trim() || legacy;
    if (!text) return fallback();
    return { text, icon: 'info', timeBased: false, detail };
  }

  // 'reps', 'range' and 'per_side' are all rep counts; only the suffix differs.
  const range = repRange(input.repsMin, input.repsMax);
  if (!range) return fallback();
  const suffix = mode === 'per_side' ? ' reps each side' : ' reps';
  return { text: `${sets}${range}${suffix}`, icon: 'workout', timeBased: false, detail };
}
