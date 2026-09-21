/**
 * The exercise pictogram system: pure geometry, the pose registry and the
 * free-text name resolver. The React components live in
 * `src/components/exercises`.
 */

export {
  SEGMENTS,
  VIEW_BOX_SIZE,
  distance,
  jointAngle,
  poseBounds,
  project,
  resolvePose,
  segmentLengths,
  skeletonJoints,
  type Bounds,
  type JointAngles,
  type LimbJoints,
  type Point,
  type Pose,
  type Skeleton,
  type SkeletonPaths,
} from './geometry';
export {
  CATEGORY_FALLBACK,
  PICTOGRAM_KEYS,
  getPictogram,
  isPictogramKey,
  pictograms,
  type Pictogram,
  type PictogramCategory,
  type PictogramKey,
} from './pictograms';
export {
  CATEGORY_KEYWORDS,
  NAME_ALIASES,
  normalizeExerciseName,
  resolveCategory,
  resolveExerciseImageKey,
  type ResolveExerciseImageInput,
} from './resolve';
