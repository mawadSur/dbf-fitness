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

  for (const [phrase, key] of ALIASES_BY_LENGTH) {
    if (phrase === normalized) return key;
  }

  const tokens = words(normalized);
  for (const [phrase, key] of ALIASES_BY_LENGTH) {
    if (containsPhrase(tokens, phrase)) return key;
  }

  const category = resolveCategory(tokens);
  return category ? CATEGORY_FALLBACK[category] : 'default';
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
