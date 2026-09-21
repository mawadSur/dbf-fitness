/**
 * Which pictogram to draw for an exercise.
 *
 * Coaches type exercise names freely, so this never throws and never returns
 * "nothing": an unrecognised name lands on a category pictogram that still
 * looks deliberate, and a name with no signal at all lands on `default`.
 *
 * Resolution order:
 *   1. an `image_key` the coach (or a future picker) stored, if it is real;
 *   2. the alias table, matched on the WHOLE normalised name;
 *   3. the alias table again, matched on a run of words inside the name, so
 *      "3 x slow incline push ups" still finds the push-up;
 *   4. a keyword -> category fallback (longest keyword wins);
 *   5. `default`.
 *
 * Pure, no imports beyond types and the registry, so it is cheap to test.
 */

import {
  CATEGORY_FALLBACK,
  isPictogramKey,
  type PictogramCategory,
  type PictogramKey,
} from './pictograms';

/**
 * Lower-cases, strips accents and punctuation, and singularises each word, so
 * "Búrpees!", "burpee" and "BURPEES" all become "burpee".
 */
export function normalizeExerciseName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((word) => word.length > 0)
    .map(singularize)
    .join(' ');
}

/** Enough English plural rules for exercise names; never shortens a 1-2 letter word. */
function singularize(word: string): string {
  if (word.length <= 2) return word;
  if (/[^aeiou]ies$/.test(word)) return `${word.slice(0, -3)}y`;
  if (/(s|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (/[^s]s$/.test(word)) return word.slice(0, -1);
  return word;
}

function words(normalized: string): string[] {
  return normalized.length === 0 ? [] : normalized.split(' ');
}

/** True when `phrase`'s words appear as a contiguous run inside `tokens`. */
function containsPhrase(tokens: string[], phrase: string): boolean {
  const needle = words(phrase);
  if (needle.length === 0 || needle.length > tokens.length) return false;
  for (let start = 0; start <= tokens.length - needle.length; start += 1) {
    let matched = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (tokens[start + offset] !== needle[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

/**
 * Normalised phrase -> pictogram. Longer phrases are tried first, which is what
 * makes "split squat" a lunge rather than a squat and "squat thrust" a burpee.
 */
export const NAME_ALIASES: Record<string, PictogramKey> = {
  // Squat
  squat: 'bodyweight-squat',
  'air squat': 'bodyweight-squat',
  'bw squat': 'bodyweight-squat',
  'bodyweight squat': 'bodyweight-squat',
  'body weight squat': 'bodyweight-squat',
  'goblet squat': 'bodyweight-squat',
  'prisoner squat': 'bodyweight-squat',
  // Lunge
  lunge: 'walking-lunge',
  'walking lunge': 'walking-lunge',
  'reverse lunge': 'walking-lunge',
  'forward lunge': 'walking-lunge',
  'alternating lunge': 'walking-lunge',
  'split squat': 'walking-lunge',
  'static lunge': 'walking-lunge',
  // Push-up
  'push up': 'push-up',
  pushup: 'push-up',
  'press up': 'push-up',
  pressup: 'push-up',
  'knee push up': 'push-up',
  // Burpee
  burpee: 'burpee',
  'squat thrust': 'burpee',
  // High knees
  'high knee': 'high-knees',
  'run in place': 'high-knees',
  'running in place': 'high-knees',
  'run on the spot': 'high-knees',
  'running on the spot': 'high-knees',
  'knee up': 'high-knees',
  // Mountain climber
  'mountain climber': 'mountain-climber',
  'mountain climb': 'mountain-climber',
  // Plank
  plank: 'plank',
  'plank hold': 'plank',
  'forearm plank': 'plank',
  'front plank': 'plank',
  'elbow plank': 'plank',
  'high plank': 'plank',
};

/** Keyword -> category. The LONGEST keyword found in a name decides. */
export const CATEGORY_KEYWORDS: Record<PictogramCategory, readonly string[]> = {
  cardio: ['run', 'jog', 'jump', 'skip', 'jack', 'sprint', 'knee', 'cardio', 'hiit', 'rope', 'shuttle'],
  strength: [
    'press',
    'curl',
    'row',
    'pull',
    'push',
    'squat',
    'lunge',
    'deadlift',
    'raise',
    'lift',
    'thruster',
    'dip',
  ],
  core: ['plank', 'crunch', 'sit up', 'twist', 'bridge', 'leg raise', 'hollow', 'dead bug'],
  mobility: ['stretch', 'mobility', 'yoga', 'hip', 'opener', 'foam'],
};

/** Spec order: the tie-break when two categories match keywords of equal length. */
const CATEGORY_ORDER: readonly PictogramCategory[] = ['cardio', 'strength', 'core', 'mobility'];

/* ------------------------------------------------------------- gerunds ---- */

/**
 * Every word the alias table and the keyword table are built from.
 *
 * De-gerunding English by rule alone is guesswork ("lunging" -> "lung" or
 * "lunge"? "running" -> "runn", "rune" or "run"?). It does not have to be:
 * the only stems that matter are the ones this module can actually match, so a
 * candidate is accepted when it is a word the tables already know, and only
 * the plain drop-the-suffix form is used otherwise.
 */
const KNOWN_WORDS: ReadonlySet<string> = new Set([
  ...Object.keys(NAME_ALIASES).flatMap((phrase) => phrase.split(' ')),
  ...Object.values(CATEGORY_KEYWORDS).flatMap((keywords) =>
    keywords.flatMap((keyword) => keyword.split(' ')),
  ),
]);

/**
 * Candidate stems for an "-ing" word, in the order English forms them:
 * plain (climbing -> climb), silent-e restored (lunging -> lunge), and
 * doubled-consonant undone (running -> run, skipping -> skip).
 *
 * Words shorter than six letters are left alone: "ring", "swing" and "thing"
 * are not gerunds of anything this app draws.
 */
export function gerundStems(word: string): string[] {
  if (!/[a-z]ing$/.test(word) || word.length < 6) return [];
  const base = word.slice(0, -3);
  const stems = [base, `${base}e`];
  if (/([bcdfgklmnprstvz])\1$/.test(base)) stems.push(base.slice(0, -1));
  return stems;
}

/** The stem of an "-ing" word, preferring one the tables recognise. */
export function deGerund(word: string): string {
  const stems = gerundStems(word);
  if (stems.length === 0) return word;
  return stems.find((stem) => KNOWN_WORDS.has(stem)) ?? stems[0];
}

const ALIASES_BY_LENGTH: readonly (readonly [string, PictogramKey])[] = Object.entries(NAME_ALIASES)
  .sort((a, b) => b[0].length - a[0].length)
  .map(([phrase, key]) => [phrase, key] as const);

export type ResolveExerciseImageInput = {
  /** A stored key; wins outright when it names a real pictogram. */
  imageKey?: string | null;
  /** The coach's free-text exercise name. */
  name?: string | null;
};

/** The pictogram key for an exercise. Always returns a key that exists. */
export function resolveExerciseImageKey({ imageKey, name }: ResolveExerciseImageInput): PictogramKey {
  if (isPictogramKey(imageKey)) return imageKey;

  const normalized = normalizeExerciseName(typeof name === 'string' ? name : '');
  if (normalized.length === 0) return 'default';

  const tokens = words(normalized);
  // "Mountain climbing", "Jumping", "Lunging": coaches write the activity as
  // often as the noun, and every one of those used to fall through to the
  // `default` pictogram. The stemmed form is tried AFTER the written one at
  // each step, so nothing that already resolved changes.
  const stemmed = tokens.map(deGerund);
  const stemmedName = stemmed.join(' ');
  const forms: readonly (readonly [string, string[]])[] =
    stemmedName === normalized
      ? [[normalized, tokens]]
      : [
          [normalized, tokens],
          [stemmedName, stemmed],
        ];

  for (const [whole] of forms) {
    for (const [phrase, key] of ALIASES_BY_LENGTH) {
      if (phrase === whole) return key;
    }
  }

  for (const [, form] of forms) {
    for (const [phrase, key] of ALIASES_BY_LENGTH) {
      if (containsPhrase(form, phrase)) return key;
    }
  }

  for (const [, form] of forms) {
    const category = resolveCategory(form);
    if (category) return CATEGORY_FALLBACK[category];
  }
  return 'default';
}

/** The category whose longest keyword appears in `tokens`, or null. */
export function resolveCategory(tokens: string[]): PictogramCategory | null {
  let best: PictogramCategory | null = null;
  let bestLength = 0;

  for (const category of CATEGORY_ORDER) {
    for (const keyword of CATEGORY_KEYWORDS[category]) {
      if (keyword.length <= bestLength) continue;
      if (containsPhrase(tokens, keyword)) {
        best = category;
        bestLength = keyword.length;
      }
    }
  }

  return best;
}
