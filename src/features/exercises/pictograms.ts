/**
 * The pictogram registry: one entry per illustrated movement, each a short
 * sequence of posed frames that reads like a coaching cue ("stand → deep
 * squat").
 *
 * Only ANGLES live here — `geometry.ts` turns them into coordinates, so every
 * figure on every frame has identical limb lengths. The import below is
 * `import type`, which type stripping erases completely, so this file has no
 * runtime dependency and Node can load it straight from the review script.
 *
 * Side view, figure facing RIGHT (+x). Angle convention is documented in
 * `geometry.ts`: 0 = right, 90 = down, -90 = up.
 */

import type { JointAngles, Pose } from './geometry';

export type PictogramCategory = 'cardio' | 'strength' | 'core' | 'mobility';

export type PictogramKey =
  | 'bodyweight-squat'
  | 'burpee'
  | 'high-knees'
  | 'mountain-climber'
  | 'plank'
  | 'push-up'
  | 'walking-lunge'
  | PictogramCategory
  | 'default';

export type Pictogram = {
  key: PictogramKey;
  /** Human name for the fallback/debug surfaces; never drawn inside the art. */
  label: string;
  category: PictogramCategory;
  /** Full sentence read aloud by a screen reader in place of the drawing. */
  alt: string;
  /** 1–3 frames, read left to right as the movement. */
  frames: Pose[];
};

/** The floor line every frame shares, so a sequence sits on one ground. */
const GROUND = 90;

/** Relaxed standing figure; every pose is expressed as a diff against it. */
const STANDING: JointAngles = {
  torso: -90,
  neck: -90,
  nearUpperArm: 82,
  nearForearm: 74,
  farUpperArm: 98,
  farForearm: 106,
  nearThigh: 91,
  nearShin: 89,
  nearFoot: 0,
  farThigh: 89,
  farShin: 91,
  farFoot: 0,
};

function frame(x: number, y: number, angles: Partial<JointAngles>): Pose {
  return { root: { x, y }, ground: GROUND, angles: { ...STANDING, ...angles } };
}

/** Relaxed stand, hip at the default height. */
const STAND = frame(46, 54, {});

/**
 * Hands-on-the-floor plank on straight arms — shared by the push-up start, the
 * mountain climber and the middle of a burpee, so those three read as the same
 * body in the same place.
 */
const HIGH_PLANK: Partial<JointAngles> = {
  torso: -23.2,
  neck: -8,
  nearUpperArm: 88,
  nearForearm: 92,
  farUpperArm: 84,
  farForearm: 96,
  nearThigh: 156.8,
  nearShin: 156.8,
  nearFoot: 60,
  farThigh: 158,
  farShin: 155,
  farFoot: 60,
};

export const pictograms = {
  'bodyweight-squat': {
    key: 'bodyweight-squat',
    label: 'Bodyweight squat',
    category: 'strength',
    alt: 'Figure standing tall, then sitting into a deep squat: hips pushed back and below knee height, knees bent about 90 degrees, chest up and arms reaching forward.',
    frames: [
      STAND,
      // Hip crease BELOW the knee (a squat that stops level looks like a
      // half-rep), hips well behind the ankle, shins nearly vertical.
      frame(38.5, 74, {
        torso: -62,
        neck: -78,
        nearUpperArm: -8,
        nearForearm: -4,
        farUpperArm: 2,
        farForearm: 6,
        nearThigh: -4.5,
        nearShin: 105,
        farThigh: -3,
        farShin: 104,
      }),
    ],
  },
  burpee: {
    key: 'burpee',
    label: 'Burpee',
    category: 'cardio',
    alt: 'Figure crouching with both hands on the floor, then thrusting the legs back into a straight-arm plank, then jumping up with knees tucked and arms overhead.',
    frames: [
      // Crouch: hands planted in front, hips high and back, knees folded under
      // the chest with the feet behind them — the position you thrust FROM.
      frame(40, 72, {
        torso: -28,
        neck: -55,
        nearUpperArm: 90,
        nearForearm: 90,
        farUpperArm: 86,
        farForearm: 94,
        nearThigh: 40,
        nearShin: 160,
        nearFoot: 0,
        farThigh: 44,
        farShin: 156,
        farFoot: 0,
      }),
      frame(47.1, 70.2, HIGH_PLANK),
      // Jump: both feet clear of the ground line, knees tucked, arms up.
      //
      // The arms used to be thrown STRAIGHT up (-70/-110 at the shoulder),
      // which put both elbows at x≈44±5 — inside the 7-unit head circle. The
      // two strokes crossed the head and the frame read as a tangle rather
      // than as a jump ("arms sprout from behind the head"). They now leave
      // the shoulder almost horizontally (-22/-158) and turn up at the elbow,
      // so the elbows sit ~14 units out, clear of the head on both sides, and
      // the silhouette is the unmistakable arms-up shape.
      //
      // The tuck is tighter and the hip higher than before so the feet clear
      // the floor by ~13 units instead of ~18 of empty air: at 56px the old
      // frame was cropped to a 97-unit square that was mostly nothing.
      frame(44, 47, {
        nearUpperArm: -22,
        nearForearm: -80,
        farUpperArm: -158,
        farForearm: -100,
        nearThigh: 45,
        nearShin: 120,
        nearFoot: 40,
        farThigh: 50,
        farShin: 115,
        farFoot: 45,
      }),
    ],
  },
  'high-knees': {
    key: 'high-knees',
    label: 'High knees',
    category: 'cardio',
    alt: 'Figure running on the spot, driving one knee up until the thigh is parallel to the floor while the opposite arm swings forward, then swapping sides.',
    frames: [
      frame(46, 54, {
        torso: -87,
        nearUpperArm: 130,
        nearForearm: 100,
        farUpperArm: 45,
        farForearm: -40,
        nearThigh: 0,
        nearShin: 80,
        nearFoot: 40,
        farThigh: 95,
        farShin: 85,
      }),
      frame(46, 54, {
        torso: -87,
        nearUpperArm: 45,
        nearForearm: -40,
        farUpperArm: 130,
        farForearm: 100,
        nearThigh: 95,
        nearShin: 85,
        farThigh: 2,
        farShin: 80,
        farFoot: 40,
      }),
    ],
  },
  'mountain-climber': {
    key: 'mountain-climber',
    label: 'Mountain climber',
    category: 'core',
    alt: 'Figure in a straight-arm plank driving one knee in under the chest while the other leg stays extended, then swapping legs.',
    // The FAR leg drives first and the NEAR leg second, so the frame the
    // thumbnail shows (the last one) draws the tucked knee in the heavy "near"
    // ink rather than in the lighter, thinner far-side stroke. At 56px the
    // pale version of that knee was the only thing telling this tile apart
    // from the push-up, and it was the faintest mark on it.
    frames: [
      frame(47.1, 70.2, {
        ...HIGH_PLANK,
        nearThigh: 158,
        nearShin: 155,
        nearFoot: 60,
        farThigh: -5,
        farShin: 130,
        farFoot: 90,
      }),
      frame(47.1, 70.2, {
        ...HIGH_PLANK,
        nearThigh: -5,
        nearShin: 130,
        nearFoot: 90,
      }),
    ],
  },
  plank: {
    key: 'plank',
    label: 'Plank',
    category: 'core',
    alt: 'Figure setting up on forearms with knees down, then lifting into a full forearm plank: elbows under the shoulders and a straight line from head to heels.',
    frames: [
      frame(47.6, 81.8, {
        torso: -19.9,
        neck: -8,
        nearUpperArm: 90,
        nearForearm: -2,
        farUpperArm: 94,
        farForearm: 2,
        nearThigh: 160.1,
        nearShin: 180,
        nearFoot: 200,
        farThigh: 158,
        farShin: 178,
        farFoot: 198,
      }),
      // A forearm plank and the bottom of a push-up are the same straight body
      // at nearly the same height, so at 56px the two tiles were one shape.
      // The one thing that can carry the difference at that size is where the
      // HEAD sits: here it is tipped down over the hands (neck +22) and comes
      // to rest just above the forearms — the plank's "look at the floor" cue —
      // while the push-up lifts its chin well clear of them (neck -30).
      frame(42.4, 77.7, {
        torso: -10.4,
        neck: 22,
        nearUpperArm: 90,
        nearForearm: -2,
        farUpperArm: 94,
        farForearm: 2,
        nearThigh: 169.6,
        nearShin: 169.6,
        nearFoot: 60,
        farThigh: 167,
        farShin: 172,
        farFoot: 60,
      }),
    ],
  },
  'push-up': {
    key: 'push-up',
    label: 'Push-up',
    category: 'strength',
    alt: 'Figure at the top of a push-up with arms straight and the body in one line, then lowering until the elbows are bent about 90 degrees and the chest is close to the floor.',
    frames: [
      frame(47.1, 70.2, HIGH_PLANK),
      // Chin lifted (see the plank's note): the head clears the hands by a
      // head's width here and rests on them there, which is what separates the
      // two tiles at 56px.
      frame(45.8, 75.4, {
        torso: -14.24,
        neck: -30,
        nearUpperArm: 134.4,
        nearForearm: 41.5,
        farUpperArm: 137,
        farForearm: 44,
        nearThigh: 165.76,
        nearShin: 165.76,
        nearFoot: 60,
        farThigh: 167,
        farShin: 164,
        farFoot: 60,
      }),
    ],
  },
  'walking-lunge': {
    key: 'walking-lunge',
    label: 'Walking lunge',
    category: 'strength',
    alt: 'Figure standing tall, then stepping into a long lunge: front knee bent about 90 degrees over the ankle, back leg trailing with the heel lifted, chest upright.',
    frames: [
      STAND,
      // Front knee 90 degrees over the ankle; the BACK knee is also ~90 and
      // hovering just off the floor with the heel lifted, which is what tells a
      // lunge apart from a split stance.
      frame(44, 69, {
        torso: -88,
        nearUpperArm: 85,
        nearForearm: 60,
        farUpperArm: 95,
        farForearm: 120,
        nearThigh: 5,
        nearShin: 95,
        farThigh: 109.1,
        farShin: 190.3,
        farFoot: 70,
      }),
    ],
  },
  cardio: {
    key: 'cardio',
    label: 'Cardio',
    category: 'cardio',
    alt: 'Figure running: one knee swings forward while the opposite arm drives forward, then the stride swaps sides.',
    frames: [
      frame(46, 54, {
        torso: -86,
        nearUpperArm: 130,
        nearForearm: 100,
        farUpperArm: 45,
        farForearm: -40,
        nearThigh: 30,
        nearShin: 85,
        nearFoot: 40,
        farThigh: 92,
        farShin: 88,
      }),
      frame(46, 54, {
        torso: -86,
        nearUpperArm: 45,
        nearForearm: -40,
        farUpperArm: 130,
        farForearm: 100,
        nearThigh: 92,
        nearShin: 88,
        farThigh: 30,
        farShin: 85,
        farFoot: 40,
      }),
    ],
  },
  strength: {
    key: 'strength',
    label: 'Strength',
    category: 'strength',
    alt: 'Figure hinged forward at the hips with both arms hanging straight down, then rowing: both elbows driven back and up past the ribs.',
    // This was a standing biceps curl, and at 56px the thumbnail was a
    // standing figure with a 6-unit stub for a forearm — indistinguishable
    // from "person". A bent-over row is the strength cue that survives the
    // tile: a hinged torso with two elbow spikes rising behind the back is a
    // silhouette nothing else in this set has (the presses and jumps all put
    // the arms overhead, where they collide with `default` and the burpee).
    frames: [
      // Hinge, arms hanging: the weight is at the bottom.
      frame(34, 54, {
        torso: -35,
        neck: -45,
        nearUpperArm: 90,
        nearForearm: 90,
        farUpperArm: 94,
        farForearm: 86,
        nearThigh: 95,
        nearShin: 85,
        nearFoot: 0,
        farThigh: 92,
        farShin: 88,
        farFoot: 0,
      }),
      // The pull. The elbows go BACK and UP (-160 at the shoulder) and the
      // hands come to the ribs, so the spikes sit above the line of the back.
      frame(34, 54, {
        torso: -35,
        neck: -45,
        nearUpperArm: 200,
        nearForearm: 70,
        farUpperArm: 204,
        farForearm: 74,
        nearThigh: 95,
        nearShin: 85,
        nearFoot: 0,
        farThigh: 92,
        farShin: 88,
        farFoot: 0,
      }),
    ],
  },
  core: {
    key: 'core',
    label: 'Core',
    category: 'core',
    alt: 'Figure lying on its back with knees bent and feet on the floor, then curling the shoulders up off the floor into a crunch.',
    frames: [
      // Knees stacked well above the hip with the feet planted under them: at
      // the shallower angle this started with, the "bent knees" read as one
      // more zigzag in a flat line.
      frame(44, 84, {
        torso: 0,
        neck: -10,
        nearUpperArm: 180,
        nearForearm: 175,
        farUpperArm: 178,
        farForearm: 172,
        nearThigh: 230,
        nearShin: 95,
        nearFoot: 180,
        farThigh: 226,
        farShin: 92,
        farFoot: 180,
      }),
      // Same legs, shoulders curled up, hands reaching towards the knees.
      frame(44, 84, {
        torso: -35,
        neck: -50,
        nearUpperArm: 185,
        nearForearm: 175,
        farUpperArm: 181,
        farForearm: 171,
        nearThigh: 230,
        nearShin: 95,
        nearFoot: 180,
        farThigh: 226,
        farShin: 92,
        farFoot: 180,
      }),
    ],
  },
  mobility: {
    key: 'mobility',
    label: 'Mobility',
    category: 'mobility',
    alt: 'Figure standing tall, then dropping into a kneeling hip-flexor stretch: back knee down on the floor with the shin flat behind, front knee bent about 90 degrees, chest tall and one arm reaching overhead.',
    frames: [
      STAND,
      // This was a standing hip hinge for two rounds and both times it drew a
      // rectangle — a horizontal spine with the arms hanging parallel to the
      // legs has no silhouette. A kneeling hip-flexor stretch does: the back
      // shin lies flat on the floor and one arm reaches up. It also cannot be
      // confused with the walking lunge, whose back knee hovers.
      frame(44, 71, {
        torso: -90,
        neck: -90,
        nearUpperArm: -85,
        nearForearm: -80,
        farUpperArm: 100,
        farForearm: 80,
        nearThigh: 5,
        nearShin: 92,
        nearFoot: 0,
        farThigh: 100,
        farShin: 180,
        farFoot: 180,
      }),
    ],
  },
  default: {
    key: 'default',
    label: 'Exercise',
    category: 'cardio',
    alt: 'Figure standing with feet together and arms down, then jumping the feet apart and both arms up into a wide star.',
    frames: [
      STAND,
      // A star jump, mid-air. The arms form a V overhead rather than reaching
      // diagonally off one side, which is what the first draft looked like.
      frame(46, 54, {
        nearUpperArm: -55,
        nearForearm: -50,
        farUpperArm: -120,
        farForearm: -125,
        nearThigh: 62,
        nearShin: 62,
        nearFoot: 0,
        farThigh: 118,
        farShin: 118,
        farFoot: 180,
      }),
    ],
  },
} as const satisfies Record<PictogramKey, Pictogram>;

export const PICTOGRAM_KEYS = Object.keys(pictograms) as PictogramKey[];

export const CATEGORY_FALLBACK: Record<PictogramCategory, PictogramKey> = {
  cardio: 'cardio',
  strength: 'strength',
  core: 'core',
  mobility: 'mobility',
};

export function isPictogramKey(value: unknown): value is PictogramKey {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(pictograms, value);
}

export function getPictogram(key: PictogramKey): Pictogram {
  return pictograms[key];
}
