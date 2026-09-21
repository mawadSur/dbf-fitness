import { isPictogramKey, PICTOGRAM_KEYS, type PictogramKey } from './pictograms';
import {
  deGerund,
  gerundStems,
  NAME_ALIASES,
  normalizeExerciseName,
  resolveCategory,
  resolveExerciseImageKey,
} from './resolve';

describe('normalizeExerciseName', () => {
  it.each([
    ['Push-Ups', 'push up'],
    ['  BURPEES!!  ', 'burpee'],
    ['Búrpees', 'burpee'],
    ['High Knees', 'high knee'],
    ['Mountain Climbers', 'mountain climber'],
    ['Crunches', 'crunch'],
    ['Walking Lunges', 'walking lunge'],
    ['Burpees (3 rounds)', 'burpee 3 round'],
    ['', ''],
    ['   ', ''],
    ['as', 'as'],
  ])('normalises %p to %p', (input, expected) => {
    expect(normalizeExerciseName(input)).toBe(expected);
  });
});

describe('resolveExerciseImageKey — a stored key wins', () => {
  it('uses a valid imageKey and ignores the name', () => {
    expect(resolveExerciseImageKey({ imageKey: 'plank', name: 'Burpees' })).toBe('plank');
  });

  it.each(PICTOGRAM_KEYS)('accepts the registry key %s', (key) => {
    expect(resolveExerciseImageKey({ imageKey: key, name: '' })).toBe(key);
  });

  it.each([
    ['unknown-key', 'Push-Ups', 'push-up'],
    ['', 'Push-Ups', 'push-up'],
    ['toString', 'Push-Ups', 'push-up'],
    ['constructor', 'Push-Ups', 'push-up'],
  ])('falls through an invalid imageKey %p', (imageKey, name, expected) => {
    expect(resolveExerciseImageKey({ imageKey, name })).toBe(expected);
  });

  it('falls through null and undefined image keys', () => {
    expect(resolveExerciseImageKey({ imageKey: null, name: 'Plank Hold' })).toBe('plank');
    expect(resolveExerciseImageKey({ name: 'Plank Hold' })).toBe('plank');
  });
});

describe('resolveExerciseImageKey — the seeded exercises', () => {
  it.each<[string, PictogramKey]>([
    ['Bodyweight Squats', 'bodyweight-squat'],
    ['Burpees', 'burpee'],
    ['High Knees', 'high-knees'],
    ['Mountain Climbers', 'mountain-climber'],
    ['Plank Hold', 'plank'],
    ['Push-Ups', 'push-up'],
    ['Walking Lunges', 'walking-lunge'],
  ])('%p resolves to %p', (name, expected) => {
    expect(resolveExerciseImageKey({ name })).toBe(expected);
  });
});

describe('resolveExerciseImageKey — aliases and synonyms', () => {
  it.each<[string, PictogramKey]>([
    ['push up', 'push-up'],
    ['Pushups', 'push-up'],
    ['press-ups', 'push-up'],
    ['PRESSUP', 'push-up'],
    ['Knee Push-Ups', 'push-up'],
    ['Air Squat', 'bodyweight-squat'],
    ['BW Squats', 'bodyweight-squat'],
    ['Goblet Squats', 'bodyweight-squat'],
    ['squats', 'bodyweight-squat'],
    ['Reverse Lunges', 'walking-lunge'],
    ['Split Squats', 'walking-lunge'],
    ['Static Lunge', 'walking-lunge'],
    ['lunges', 'walking-lunge'],
    ['Squat Thrusts', 'burpee'],
    ['burpee', 'burpee'],
    ['high knee', 'high-knees'],
    ['Run in Place', 'high-knees'],
    ['Running on the Spot', 'high-knees'],
    ['Mountain Climber', 'mountain-climber'],
    ['Forearm Plank', 'plank'],
    ['High Plank', 'plank'],
    ['Elbow Plank Hold', 'plank'],
  ])('%p resolves to %p', (name, expected) => {
    expect(resolveExerciseImageKey({ name })).toBe(expected);
  });

  it.each<[string, PictogramKey]>([
    ['3 x 12 Push Ups', 'push-up'],
    ['Slow tempo bodyweight squats', 'bodyweight-squat'],
    ['Incline Push-Ups (hands on bench)', 'push-up'],
    ['Walking lunges — 20 steps', 'walking-lunge'],
    ['Mountain climbers 30s', 'mountain-climber'],
    ['Plank hold, 45 seconds', 'plank'],
    ['Burpees for time', 'burpee'],
  ])('finds the movement inside extra words: %p', (name, expected) => {
    expect(resolveExerciseImageKey({ name })).toBe(expected);
  });

  it('prefers the longer phrase: a split squat is a lunge, not a squat', () => {
    expect(resolveExerciseImageKey({ name: 'Bulgarian Split Squat' })).toBe('walking-lunge');
  });
});

describe('resolveExerciseImageKey — category fallbacks', () => {
  it.each<[string, PictogramKey]>([
    ['Jumping Jacks', 'cardio'],
    ['Sprint intervals', 'cardio'],
    ['Skipping rope', 'cardio'],
    ['Easy jog', 'cardio'],
    ['HIIT finisher', 'cardio'],
    ['Dumbbell Shoulder Press', 'strength'],
    ['Bicep Curls', 'strength'],
    ['Bent-over Rows', 'strength'],
    ['Deadlifts', 'strength'],
    ['Chest Dips', 'strength'],
    ['Bicycle Crunches', 'core'],
    ['Russian Twists', 'core'],
    ['Glute Bridge', 'core'],
    ['Hollow Body Hold', 'core'],
    ['Dead Bug', 'core'],
    ['Hamstring Stretch', 'mobility'],
    ['Hip Opener', 'mobility'],
    ['Yoga flow', 'mobility'],
    ['Foam rolling', 'mobility'],
    ['Mobility circuit', 'mobility'],
  ])('%p falls back to %p', (name, expected) => {
    expect(resolveExerciseImageKey({ name })).toBe(expected);
  });
});

describe('resolveExerciseImageKey — the default', () => {
  it.each([
    '',
    '   ',
    '???',
    '42',
    'Coach special',
    'Secret sauce',
    'Zumba',
    '🏋️',
    'Trabalho de ombro',
  ])('%p has no signal and lands on default', (name) => {
    expect(resolveExerciseImageKey({ name })).toBe('default');
  });

  it('never throws and always returns a real key', () => {
    const names = ['', 'x', 'PUSH', 'null', 'undefined', '\u0000', 'a'.repeat(500)];
    for (const name of names) {
      const key = resolveExerciseImageKey({ name });
      expect(isPictogramKey(key)).toBe(true);
    }
  });
});

describe('resolveCategory', () => {
  it('returns null when nothing matches', () => {
    expect(resolveCategory(['zumba'])).toBeNull();
    expect(resolveCategory([])).toBeNull();
  });

  it('lets the longest keyword win over the spec order', () => {
    // "raise" is strength and "leg raise" is core; the longer one decides.
    expect(resolveCategory(['leg', 'raise'])).toBe('core');
  });
});

describe('gerunds (coaches write the activity, not the noun)', () => {
  it.each([
    ['Mountain climbing', 'mountain-climber'],
    ['Mountain Climbing', 'mountain-climber'],
    ['30s mountain climbing', 'mountain-climber'],
    ['Lunging', 'walking-lunge'],
    ['Walking lunging', 'walking-lunge'],
    ['Squatting', 'bodyweight-squat'],
    ['Planking', 'plank'],
    ['Pushing up', 'push-up'],
  ] as const)('%p resolves to %p', (name, key) => {
    expect(resolveExerciseImageKey({ name })).toBe(key);
  });

  it.each(['Jumping', 'Running', 'Skipping', 'Jogging', 'Sprinting'])(
    '%p is recognised as cardio rather than falling through to default',
    (name) => {
      const key = resolveExerciseImageKey({ name });
      expect(key).not.toBe('default');
      expect(isPictogramKey(key)).toBe(true);
    }
  );

  it('does not invent a stem for short words that merely end in -ing', () => {
    expect(gerundStems('ring')).toEqual([]);
    expect(gerundStems('swing')).toEqual([]);
    expect(deGerund('swing')).toBe('swing');
    // ...and a name made only of those still lands on default, as before.
    expect(resolveExerciseImageKey({ name: 'Swing' })).toBe('default');
  });

  it.each([
    ['climbing', 'climb'],
    ['lunging', 'lunge'],
    ['running', 'run'],
    ['skipping', 'skip'],
    ['squatting', 'squat'],
    ['jumping', 'jump'],
    ['pressing', 'press'],
    ['stretching', 'stretch'],
  ] as const)('deGerund(%p) is %p', (word, stem) => {
    expect(deGerund(word)).toBe(stem);
  });

  it('leaves an unknown -ing word on the plain stem instead of guessing', () => {
    expect(deGerund('zumbaing')).toBe('zumba');
  });

  it('changes nothing for the names that already resolved', () => {
    // A regression net: every alias must still map to its own pictogram now
    // that a second, stemmed form is tried.
    for (const [phrase, key] of Object.entries(NAME_ALIASES)) {
      expect(resolveExerciseImageKey({ name: phrase })).toBe(key);
    }
  });
});
