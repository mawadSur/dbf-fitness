import { jointAngle, resolvePose } from './geometry';
import {
  CATEGORY_FALLBACK,
  getPictogram,
  isPictogramKey,
  pictograms,
  PICTOGRAM_KEYS,
  type PictogramCategory,
} from './pictograms';

const CATEGORIES: PictogramCategory[] = ['cardio', 'strength', 'core', 'mobility'];

describe('the registry', () => {
  it('covers the seven seeded exercises plus five fallbacks', () => {
    expect(PICTOGRAM_KEYS.sort()).toEqual(
      [
        'bodyweight-squat',
        'burpee',
        'cardio',
        'core',
        'default',
        'high-knees',
        'mountain-climber',
        'mobility',
        'plank',
        'push-up',
        'strength',
        'walking-lunge',
      ].sort(),
    );
  });

  it.each(PICTOGRAM_KEYS)('%s is complete', (key) => {
    const entry = getPictogram(key);
    expect(entry.key).toBe(key);
    expect(entry.label.length).toBeGreaterThan(0);
    expect(CATEGORIES).toContain(entry.category);
    expect(entry.frames.length).toBeGreaterThanOrEqual(1);
    expect(entry.frames.length).toBeLessThanOrEqual(3);
  });

  it.each(PICTOGRAM_KEYS)('%s has a full-sentence alt text', (key) => {
    const { alt } = getPictogram(key);
    expect(alt.length).toBeGreaterThan(30);
    expect(alt.startsWith('Figure ')).toBe(true);
    expect(alt.endsWith('.')).toBe(true);
  });

  it.each(PICTOGRAM_KEYS)('%s never draws text or a face into the artwork', (key) => {
    // The frames are pure angles; there is no text channel at all. This guards
    // the invariant against someone adding one.
    const entry = getPictogram(key) as unknown as Record<string, unknown>;
    expect(Object.keys(entry).sort()).toEqual(['alt', 'category', 'frames', 'key', 'label']);
  });

  it('has a fallback pictogram for every category', () => {
    for (const category of CATEGORIES) {
      const key = CATEGORY_FALLBACK[category];
      expect(isPictogramKey(key)).toBe(true);
      expect(getPictogram(key).category).toBe(category);
    }
  });

  it('recognises only its own keys', () => {
    expect(isPictogramKey('push-up')).toBe(true);
    expect(isPictogramKey('nope')).toBe(false);
    expect(isPictogramKey('toString')).toBe(false);
    expect(isPictogramKey(undefined)).toBe(false);
    expect(isPictogramKey(null)).toBe(false);
    expect(isPictogramKey(7)).toBe(false);
  });
});

/**
 * The shape checks a coach would make. These are the poses the contact sheet was
 * iterated against, pinned so a future angle tweak cannot quietly break the cue.
 */
describe('the poses read as the movement', () => {
  it('push-up: straight body at the top, elbows about 90 degrees at the bottom', () => {
    const [top, bottom] = pictograms['push-up'].frames.map(resolvePose);
    expect(jointAngle(top.shoulder, top.near.elbow, top.near.wrist)).toBeGreaterThan(170);
    const bent = jointAngle(bottom.shoulder, bottom.near.elbow, bottom.near.wrist);
    expect(bent).toBeGreaterThan(70);
    expect(bent).toBeLessThan(110);
    // Hip stays on the line between shoulder and ankle: no sagging, no piking.
    expect(jointAngle(bottom.shoulder, bottom.hip, bottom.near.knee)).toBeGreaterThan(165);
  });

  it('plank: forearms down, neutral spine, hips in line', () => {
    const plank = resolvePose(pictograms.plank.frames[1]);
    // Elbow under the shoulder (within a head radius horizontally).
    expect(Math.abs(plank.near.elbow.x - plank.shoulder.x)).toBeLessThan(7);
    // Forearm flat on the floor: wrist and elbow at nearly the same height.
    expect(Math.abs(plank.near.wrist.y - plank.near.elbow.y)).toBeLessThan(2);
    expect(jointAngle(plank.shoulder, plank.hip, plank.near.knee)).toBeGreaterThan(165);
  });

  it('bodyweight squat: hips below knee height and behind the ankle, chest up', () => {
    const [stand, deep] = pictograms['bodyweight-squat'].frames.map(resolvePose);
    expect(jointAngle(stand.hip, stand.near.knee, stand.near.ankle)).toBeGreaterThan(170);
    expect(deep.hip.y).toBeGreaterThan(deep.near.knee.y);
    expect(deep.hip.x).toBeLessThan(deep.near.ankle.x);
    expect(deep.shoulder.y).toBeLessThan(deep.hip.y);
    const knee = jointAngle(deep.hip, deep.near.knee, deep.near.ankle);
    expect(knee).toBeGreaterThan(55);
    expect(knee).toBeLessThan(110);
  });

  it('walking lunge: long stride, both knees bent, torso upright', () => {
    const lunge = resolvePose(pictograms['walking-lunge'].frames[1]);
    expect(lunge.near.ankle.x - lunge.far.ankle.x).toBeGreaterThan(20);
    for (const side of [lunge.near, lunge.far]) {
      const knee = jointAngle(lunge.hip, side.knee, side.ankle);
      expect(knee).toBeGreaterThan(55);
      expect(knee).toBeLessThan(125);
    }
    // Upright chest: the shoulder sits nearly straight above the hip.
    expect(Math.abs(lunge.shoulder.x - lunge.hip.x)).toBeLessThan(4);
  });

  it('high knees: the driven thigh reaches hip height, opposite arm forward', () => {
    const [first, second] = pictograms['high-knees'].frames.map(resolvePose);
    expect(Math.abs(first.near.knee.y - first.hip.y)).toBeLessThan(4);
    expect(first.near.knee.x).toBeGreaterThan(first.hip.x);
    // Opposite arm: the far wrist leads while the near knee is up.
    expect(first.far.wrist.x).toBeGreaterThan(first.hip.x);
    // Frame two swaps sides.
    expect(Math.abs(second.far.knee.y - second.hip.y)).toBeLessThan(4);
  });

  it('mountain climber: plank hands down, one knee driven under the chest', () => {
    const [a, b] = pictograms['mountain-climber'].frames.map(resolvePose);
    for (const frame of [a, b]) {
      expect(jointAngle(frame.shoulder, frame.near.elbow, frame.near.wrist)).toBeGreaterThan(165);
      expect(frame.near.wrist.y).toBeGreaterThan(frame.shoulder.y);
    }
    // Driven knee is forward of the hip and tucked up towards the chest.
    expect(a.near.knee.x).toBeGreaterThan(a.hip.x);
    expect(a.near.knee.y).toBeLessThan(a.hip.y + 4);
    expect(b.far.knee.x).toBeGreaterThan(b.hip.x);
  });

  it('burpee: crouch with hands down, then a plank, then a jump off the floor', () => {
    const [crouch, plank, jump] = pictograms.burpee.frames.map(resolvePose);
    expect(crouch.near.wrist.y).toBeGreaterThan(crouch.hip.y);
    expect(jointAngle(crouch.hip, crouch.near.knee, crouch.near.ankle)).toBeLessThan(110);
    // The figure faces right, so in the plank the feet trail BEHIND the hands.
    expect(plank.near.ankle.x).toBeLessThan(plank.shoulder.x);
    expect(plank.near.wrist.y).toBeGreaterThan(plank.shoulder.y);
    // Jump: arms overhead and both feet clear of the ground line.
    expect(jump.near.wrist.y).toBeLessThan(jump.head.y);
    expect(jump.near.ankle.y).toBeLessThan(jump.ground - 2);
    expect(jump.far.ankle.y).toBeLessThan(jump.ground - 2);
  });

  it('every multi-frame pictogram actually changes between frames', () => {
    for (const key of PICTOGRAM_KEYS) {
      const frames = pictograms[key].frames;
      if (frames.length < 2) continue;
      const signatures = frames.map((pose) => JSON.stringify(resolvePose(pose).paths));
      expect(new Set(signatures).size).toBe(frames.length);
    }
  });
});
