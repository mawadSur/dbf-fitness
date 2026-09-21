import {
  distance,
  jointAngle,
  poseBounds,
  project,
  resolvePose,
  segmentLengths,
  skeletonJoints,
  SEGMENTS,
  VIEW_BOX_SIZE,
  type Pose,
} from './geometry';
import { pictograms, PICTOGRAM_KEYS } from './pictograms';

const EVERY_FRAME: [string, number, Pose][] = PICTOGRAM_KEYS.flatMap((key) =>
  pictograms[key].frames.map((pose, index): [string, number, Pose] => [key, index, pose]),
);

describe('project', () => {
  it('walks the exact distance in the given direction (+y is down)', () => {
    expect(project({ x: 0, y: 0 }, 0, 10)).toEqual({ x: 10, y: 0 });
    const down = project({ x: 0, y: 0 }, 90, 10);
    expect(down.x).toBeCloseTo(0, 10);
    expect(down.y).toBeCloseTo(10, 10);
    const up = project({ x: 0, y: 0 }, -90, 10);
    expect(up.y).toBeCloseTo(-10, 10);
  });
});

describe('jointAngle', () => {
  it('measures the interior angle at the vertex', () => {
    expect(jointAngle({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90, 6);
    expect(jointAngle({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: -1, y: 0 })).toBeCloseTo(180, 6);
    expect(jointAngle({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBe(0);
  });
});

describe('every pictogram frame', () => {
  it.each(EVERY_FRAME)('%s frame %i keeps every limb length exact', (_key, _index, pose) => {
    const measured = segmentLengths(resolvePose(pose));
    const expected: Record<string, number> = {
      neck: SEGMENTS.neck,
      torso: SEGMENTS.torso,
      nearUpperArm: SEGMENTS.upperArm,
      nearForearm: SEGMENTS.forearm,
      farUpperArm: SEGMENTS.upperArm,
      farForearm: SEGMENTS.forearm,
      nearThigh: SEGMENTS.thigh,
      nearShin: SEGMENTS.shin,
      nearFoot: SEGMENTS.foot,
      farThigh: SEGMENTS.thigh,
      farShin: SEGMENTS.shin,
      farFoot: SEGMENTS.foot,
    };
    for (const [name, length] of Object.entries(expected)) {
      expect(measured[name]).toBeCloseTo(length, 2);
    }
  });

  it.each(EVERY_FRAME)('%s frame %i stays inside the viewBox', (_key, _index, pose) => {
    const bounds = poseBounds(resolvePose(pose));
    expect(bounds.minX).toBeGreaterThanOrEqual(0);
    expect(bounds.minY).toBeGreaterThanOrEqual(0);
    expect(bounds.maxX).toBeLessThanOrEqual(VIEW_BOX_SIZE);
    expect(bounds.maxY).toBeLessThanOrEqual(VIEW_BOX_SIZE);
  });

  it.each(EVERY_FRAME)('%s frame %i has no NaN joint or path', (_key, _index, pose) => {
    const skeleton = resolvePose(pose);
    for (const joint of skeletonJoints(skeleton)) {
      expect(Number.isFinite(joint.x)).toBe(true);
      expect(Number.isFinite(joint.y)).toBe(true);
    }
    for (const path of Object.values(skeleton.paths)) {
      expect(path).not.toMatch(/NaN|Infinity|undefined/);
      expect(path.length).toBeGreaterThan(0);
    }
  });

  it.each(EVERY_FRAME)('%s frame %i stands on (or above) its ground line', (_key, _index, pose) => {
    const skeleton = resolvePose(pose);
    // A jump leaves the floor, so this is only an upper bound: nothing may sink
    // more than a stroke width below the line the frame is drawn on.
    for (const joint of skeletonJoints(skeleton)) {
      expect(joint.y).toBeLessThanOrEqual(pose.ground + 2.5);
    }
  });
});

describe('near and far ordering', () => {
  it.each(EVERY_FRAME)('%s frame %i draws far limbs from the same shoulder and hip', (_key, _index, pose) => {
    const skeleton = resolvePose(pose);
    expect(skeleton.paths.nearArm.startsWith(skeleton.paths.farArm.split(' L')[0])).toBe(true);
    expect(skeleton.paths.nearLeg.startsWith(skeleton.paths.farLeg.split(' L')[0])).toBe(true);
  });

  it('keeps the far side distinguishable from the near side in at least one joint', () => {
    for (const key of PICTOGRAM_KEYS) {
      const anyFrameSplitsSides = pictograms[key].frames.some((pose) => {
        const { near, far } = resolvePose(pose);
        return distance(near.knee, far.knee) > 0.5 || distance(near.elbow, far.elbow) > 0.5;
      });
      expect(anyFrameSplitsSides).toBe(true);
    }
  });
});

describe('poseBounds', () => {
  it('includes the head circle and the ground line, not just the joints', () => {
    const pose = pictograms['bodyweight-squat'].frames[0];
    const skeleton = resolvePose(pose);
    const bounds = poseBounds(skeleton);
    expect(bounds.minY).toBeLessThanOrEqual(skeleton.head.y - skeleton.headRadius);
    expect(bounds.maxY).toBeGreaterThanOrEqual(skeleton.ground);
  });
});
