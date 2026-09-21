/**
 * Exercise pictogram geometry — a 2D mannequin with FIXED segment lengths.
 *
 * A pose is described only by ANGLES (degrees) plus a root position, so every
 * pose in the registry is the same figure moved, never a differently
 * proportioned one. Forward kinematics turns those angles into joint
 * coordinates inside a 100x100 box and into SVG path strings.
 *
 * ANGLE CONVENTION — SVG coordinates, so +y points DOWN:
 *   0 = right (the direction the figure faces), 90 = down, -90 = up, 180 = left.
 * Every angle is the direction of a segment from its parent joint to its child
 * joint (hip -> knee, knee -> ankle, ...), which is what keeps limb lengths
 * exact: the child is always `length` away from the parent.
 *
 * THIS FILE IS DEPENDENCY-FREE AND USES ERASABLE SYNTAX ONLY (no enums, no
 * namespaces, no parameter properties, no runtime imports) so Node's built-in
 * type stripping can import it directly — `scripts/render-pictograms.mjs`
 * depends on that to render the review contact sheet without a bundler.
 */

export type Point = { x: number; y: number };

/**
 * Segment lengths in viewBox units. The standing figure is 45 units from hip to
 * the top of the head and 35 from hip to ankle, i.e. ~80 units tall in a 100
 * unit box, which leaves room for a lunge to reach sideways and for the ground
 * line underneath.
 */
export const SEGMENTS = {
  headRadius: 7,
  /** Shoulder joint to the near edge of the head; the head centre sits at `neck + headRadius`. */
  neck: 5,
  torso: 26,
  upperArm: 15,
  forearm: 14,
  thigh: 18,
  shin: 17,
  foot: 7,
} as const;

/** Every pictogram frame is drawn in this square. */
export const VIEW_BOX_SIZE = 100;

/** The direction of each segment, in degrees, per the convention above. */
export type JointAngles = {
  /** hip -> shoulder. -90 is an upright spine. */
  torso: number;
  /** shoulder -> head centre. */
  neck: number;
  nearUpperArm: number;
  nearForearm: number;
  farUpperArm: number;
  farForearm: number;
  nearThigh: number;
  nearShin: number;
  nearFoot: number;
  farThigh: number;
  farShin: number;
  farFoot: number;
};

export type Pose = {
  /** The hip joint: every other joint is derived from it. */
  root: Point;
  /** y of the floor line for this frame. */
  ground: number;
  angles: JointAngles;
};

export type LimbJoints = {
  elbow: Point;
  wrist: Point;
  knee: Point;
  ankle: Point;
  toe: Point;
};

export type SkeletonPaths = {
  torso: string;
  nearArm: string;
  nearLeg: string;
  farArm: string;
  farLeg: string;
  ground: string;
};

export type Skeleton = {
  hip: Point;
  shoulder: Point;
  /** Centre of the head circle. */
  head: Point;
  headRadius: number;
  ground: number;
  near: LimbJoints;
  far: LimbJoints;
  paths: SkeletonPaths;
};

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** The point `length` away from `from` in the direction `angleDeg`. */
export function project(from: Point, angleDeg: number, length: number): Point {
  const radians = toRadians(angleDeg);
  return {
    x: from.x + Math.cos(radians) * length,
    y: from.y + Math.sin(radians) * length,
  };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Two decimals: enough precision for a 100 unit box, short enough to read. */
function n(value: number): string {
  return (Math.round(value * 100) / 100).toString();
}

function polyline(points: Point[]): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${n(point.x)} ${n(point.y)}`).join(' ');
}

function limb(
  shoulder: Point,
  hip: Point,
  angles: JointAngles,
  side: 'near' | 'far',
): LimbJoints {
  const upperArmAngle = side === 'near' ? angles.nearUpperArm : angles.farUpperArm;
  const forearmAngle = side === 'near' ? angles.nearForearm : angles.farForearm;
  const thighAngle = side === 'near' ? angles.nearThigh : angles.farThigh;
  const shinAngle = side === 'near' ? angles.nearShin : angles.farShin;
  const footAngle = side === 'near' ? angles.nearFoot : angles.farFoot;

  const elbow = project(shoulder, upperArmAngle, SEGMENTS.upperArm);
  const wrist = project(elbow, forearmAngle, SEGMENTS.forearm);
  const knee = project(hip, thighAngle, SEGMENTS.thigh);
  const ankle = project(knee, shinAngle, SEGMENTS.shin);
  const toe = project(ankle, footAngle, SEGMENTS.foot);
  return { elbow, wrist, knee, ankle, toe };
}

/** Forward kinematics: angles in, joint coordinates and SVG paths out. */
export function resolvePose(pose: Pose): Skeleton {
  const hip = pose.root;
  const shoulder = project(hip, pose.angles.torso, SEGMENTS.torso);
  const head = project(shoulder, pose.angles.neck, SEGMENTS.neck + SEGMENTS.headRadius);
  const near = limb(shoulder, hip, pose.angles, 'near');
  const far = limb(shoulder, hip, pose.angles, 'far');

  return {
    hip,
    shoulder,
    head,
    headRadius: SEGMENTS.headRadius,
    ground: pose.ground,
    near,
    far,
    paths: {
      torso: polyline([hip, shoulder]),
      nearArm: polyline([shoulder, near.elbow, near.wrist]),
      nearLeg: polyline([hip, near.knee, near.ankle, near.toe]),
      farArm: polyline([shoulder, far.elbow, far.wrist]),
      farLeg: polyline([hip, far.knee, far.ankle, far.toe]),
      ground: `M4 ${n(pose.ground)} L96 ${n(pose.ground)}`,
    },
  };
}

/** Every joint, in a stable order, for bounds checks and tests. */
export function skeletonJoints(skeleton: Skeleton): Point[] {
  return [
    skeleton.hip,
    skeleton.shoulder,
    skeleton.head,
    skeleton.near.elbow,
    skeleton.near.wrist,
    skeleton.near.knee,
    skeleton.near.ankle,
    skeleton.near.toe,
    skeleton.far.elbow,
    skeleton.far.wrist,
    skeleton.far.knee,
    skeleton.far.ankle,
    skeleton.far.toe,
  ];
}

/** The drawn extent, head circle included, so a frame can be checked for clipping. */
export function poseBounds(skeleton: Skeleton): Bounds {
  const joints = skeletonJoints(skeleton);
  const xs = joints.map((point) => point.x);
  const ys = joints.map((point) => point.y);
  xs.push(skeleton.head.x - skeleton.headRadius, skeleton.head.x + skeleton.headRadius);
  ys.push(skeleton.head.y - skeleton.headRadius, skeleton.head.y + skeleton.headRadius, skeleton.ground);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

/** Measured segment lengths — the test asserts these never vary between poses. */
export function segmentLengths(skeleton: Skeleton): Record<string, number> {
  return {
    neck: distance(skeleton.shoulder, skeleton.head) - SEGMENTS.headRadius,
    torso: distance(skeleton.hip, skeleton.shoulder),
    nearUpperArm: distance(skeleton.shoulder, skeleton.near.elbow),
    nearForearm: distance(skeleton.near.elbow, skeleton.near.wrist),
    farUpperArm: distance(skeleton.shoulder, skeleton.far.elbow),
    farForearm: distance(skeleton.far.elbow, skeleton.far.wrist),
    nearThigh: distance(skeleton.hip, skeleton.near.knee),
    nearShin: distance(skeleton.near.knee, skeleton.near.ankle),
    nearFoot: distance(skeleton.near.ankle, skeleton.near.toe),
    farThigh: distance(skeleton.hip, skeleton.far.knee),
    farShin: distance(skeleton.far.knee, skeleton.far.ankle),
    farFoot: distance(skeleton.far.ankle, skeleton.far.toe),
  };
}

/** The interior angle at a joint in degrees — used by tests to check a bend. */
export function jointAngle(a: Point, vertex: Point, b: Point): number {
  const v1 = { x: a.x - vertex.x, y: a.y - vertex.y };
  const v2 = { x: b.x - vertex.x, y: b.y - vertex.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
  if (mag === 0) return 0;
  const cos = Math.min(1, Math.max(-1, dot / mag));
  return (Math.acos(cos) * 180) / Math.PI;
}
