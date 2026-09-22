/**
 * How a note checklist item's "sets × reps" line reads.
 *
 * The old one-liner was `${item.reps} reps`, which appended the word to
 * whatever the coach typed. A hold dictated as "30s" therefore rendered as
 * "3 sets × 30s reps" — a duration wearing a repetition's unit, which is not
 * just untidy but wrong: it tells the member to do thirty seconds thirty times.
 *
 * So the unit is READ OFF the value instead of assumed:
 *   "10"        -> "10 reps"        a plain count
 *   "8-10"      -> "8-10 reps"      a range (en dash and "8 to 10" too)
 *   "30s"       -> "30 sec"         a duration keeps its own unit, no "reps"
 *   "1:30"      -> "1:30"           a clock time is already a unit
 *   "10/side"   -> "10 reps per side"
 *   "AMRAP"     -> "AMRAP"          free text is the coach's words, untouched
 *
 * Everything here is pure so the rules can be tested without a renderer;
 * `itemSublabel` in `./checklist` is the only caller and every surface that
 * shows an item goes through it.
 *
 * Sibling rule: `src/features/workouts/repsOrDuration.ts` answers the same
 * "is this a time?" question for the exercise chip's icon. It stays separate
 * because it classifies, while this formats — and its `m`-is-a-distance caveat
 * ("400m") applies here identically: `m` is deliberately not a time unit.
 */

/** A time on the clock — "1:30", "10:00". Minutes and seconds, never a score. */
const CLOCK_TIME = /^\d{1,3}:[0-5]\d$/;

/** A number, or a range of numbers: "10", "8-10", "8 – 10", "8 to 10". */
const COUNT = /^(\d+)(?:\s*(?:[-–—]|to)\s*(\d+))?$/i;

/**
 * A number (or range) followed by a time unit, attached ("30s") or spaced
 * ("45 sec", "2 minutes"). The trailing anchor is what keeps "12 sets" from
 * reading as twelve seconds.
 */
const DURATION =
  /^(\d+(?:\.\d+)?)(?:\s*(?:[-–—]|to)\s*(\d+(?:\.\d+)?))?\s*(s|secs?|seconds?|mins?|minutes?|h|hrs?|hours?)$/i;

/** A trailing "per side" qualifier in any of the shapes coaches dictate. */
const PER_SIDE = /^(.*?)\s*(?:\/\s*|\s+(?:per|each)\s+)(sides?|legs?|arms?|hands?)\.?$/i;

/** A value that already names its own repetitions: "10 reps", "max reps". */
const TRAILING_REP_WORD = /\s*\b(?:repetitions?|reps?)\.?$/i;

/** "sec" / "min" / "hr" — abbreviations, so they never take a plural. */
function canonicalTimeUnit(raw: string): string {
  const unit = raw.toLowerCase();
  if (unit.startsWith('s')) return 'sec';
  if (unit.startsWith('m')) return 'min';
  return 'hr';
}

function repWord(count: string): string {
  return count === '1' ? 'rep' : 'reps';
}

/** "8 to 10" and "8 – 10" both settle on one spelling: "8-10". */
function joinRange(from: string, to: string | undefined): string {
  return to === undefined ? from : `${from}-${to}`;
}

/**
 * The prescription without its per-side qualifier: a count gains "reps", a
 * duration keeps its own unit, and anything unrecognised is returned as typed.
 */
function formatCore(value: string): string {
  if (CLOCK_TIME.test(value)) return value;

  const duration = DURATION.exec(value);
  if (duration) {
    const [, from, to, unit] = duration;
    return `${joinRange(from, to)} ${canonicalTimeUnit(unit)}`;
  }

  // "10 reps" is already right; it only needs the same spelling as the rest.
  if (TRAILING_REP_WORD.test(value)) {
    const head = value.replace(TRAILING_REP_WORD, '').trim();
    const counted = COUNT.exec(head);
    if (!counted) return value;
    const range = joinRange(counted[1], counted[2]);
    return `${range} ${repWord(range)}`;
  }

  const counted = COUNT.exec(value);
  if (counted) {
    const range = joinRange(counted[1], counted[2]);
    return `${range} ${repWord(range)}`;
  }

  return value;
}

/**
 * The reps half of an item's sublabel, or `null` when the coach left it blank.
 *
 * Whitespace is collapsed first so "8  -  10" and "8-10" cannot render as two
 * different prescriptions for the same exercise.
 */
export function formatPrescription(reps: string | null | undefined): string | null {
  if (typeof reps !== 'string') return null;
  const text = reps.trim().replace(/\s+/g, ' ');
  if (text === '') return null;

  const perSide = PER_SIDE.exec(text);
  if (perSide && perSide[1].trim() !== '') {
    // "legs" -> "leg": the qualifier reads as one side at a time.
    const noun = perSide[2].toLowerCase().replace(/s$/, '');
    return `${formatCore(perSide[1].trim())} per ${noun}`;
  }

  return formatCore(text);
}

export type ItemPrescription = {
  /** Whole number of sets, or absent when the item prescribes none. */
  sets?: number;
  /** Whatever the coach typed: a count, a range, a duration or free text. */
  reps?: string;
};

/**
 * The full sublabel: "4 sets × 8-10 reps", "3 sets × 30 sec", "10 reps",
 * "1 set", or `null` when the item prescribes neither.
 */
export function prescriptionLabel(item: ItemPrescription): string | null {
  const parts: string[] = [];
  if (typeof item.sets === 'number') {
    parts.push(`${item.sets} ${item.sets === 1 ? 'set' : 'sets'}`);
  }
  const reps = formatPrescription(item.reps);
  if (reps !== null) parts.push(reps);
  return parts.length > 0 ? parts.join(' × ') : null;
}
