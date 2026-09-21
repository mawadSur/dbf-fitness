/**
 * Exercise illustrations.
 *
 * Screens import `ExercisePictogram` and, where they need to know which drawing
 * an exercise maps to before rendering it, `resolveExerciseImageKey`.
 */

export {
  ExercisePictogram,
  HERO_MAX_WIDTH,
  THUMB_SIZE,
  type ExercisePictogramProps,
} from './ExercisePictogram';
export {
  resolveExerciseImageKey,
  type ResolveExerciseImageInput,
} from '../../features/exercises/resolve';
export { type PictogramKey } from '../../features/exercises/pictograms';
