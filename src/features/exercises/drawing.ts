/**
 * What to draw for a pictogram frame, as plain data.
 *
 * The React component (`src/components/exercises/ExercisePictogram.tsx`) and the
 * review script (`scripts/render-pictograms.mjs`) both consume this, so the
 * contact sheet that gets judged by eye is the SAME drawing the app ships — a
 * second hand-rolled SVG in the script would let the two drift apart silently.
 *
 * Colours are NOT here: they are theme tokens and arrive as the `role` of each
 * shape, which the caller maps to `useTheme().colors`.
 *
 * DEPENDENCY-FREE, erasable syntax only (see `geometry.ts`) so Node's type
 * stripping can import it straight from the script.
 */

import { poseBounds, resolvePose, VIEW_BOX_SIZE, type Pose } from './geometry';
import { getPictogram, type PictogramKey } from './pictograms';

/** Which theme colour a shape takes. */
export type ShapeRole =
  /** The floor line: `borderSoft`. */
  | 'ground'
  /** The limbs on the far side of the body: `sage`. */
  | 'far'
  /** Spine, near limbs and head: `cta` in light, `brand` in dark (the "ink"). */
  | 'near';

export type PictogramShape =
  | { kind: 'path'; role: ShapeRole; d: string; width: number }
  | { kind: 'circle'; role: ShapeRole; cx: number; cy: number; r: number };

export type FrameDrawing = {
  /** Painted in order, so later shapes sit on top. */
  shapes: PictogramShape[];
  /** A viewBox cropped to this figure — see `frameViewBox`. */
  croppedViewBox: string;
};

export type PictogramDrawing = {
  key: PictogramKey;
  label: string;
  /** Full sentence for the accessible name. */
  alt: string;
  viewBox: number;
  frames: FrameDrawing[];
};

/**
 * Stroke widths in viewBox units. The spine is heaviest, the near limbs next and
 * the far limbs are drawn thinner as well as lighter, so the two sides stay
 * readable even for someone who cannot tell the two greens apart.
 */
export const STROKE = {
  torso: 7,
  nearLimb: 5.5,
  farLimb: 4.5,
  ground: 1.6,
} as const;

/** Every shape for one frame, back to front. */
export function frameDrawing(pose: Pose): FrameDrawing {
  const skeleton = resolvePose(pose);
  return {
    croppedViewBox: frameViewBox(pose),
    shapes: [
      { kind: 'path', role: 'ground', d: skeleton.paths.ground, width: STROKE.ground },
      { kind: 'path', role: 'far', d: skeleton.paths.farLeg, width: STROKE.farLimb },
      { kind: 'path', role: 'far', d: skeleton.paths.farArm, width: STROKE.farLimb },
      { kind: 'path', role: 'near', d: skeleton.paths.torso, width: STROKE.torso },
      { kind: 'path', role: 'near', d: skeleton.paths.nearLeg, width: STROKE.nearLimb },
      { kind: 'path', role: 'near', d: skeleton.paths.nearArm, width: STROKE.nearLimb },
      {
        kind: 'circle',
        role: 'near',
        cx: skeleton.head.x,
        cy: skeleton.head.y,
        r: skeleton.headRadius,
      },
    ],
  };
}

/** The whole drawing for a registry key. */
export function pictogramDrawing(key: PictogramKey): PictogramDrawing {
  const entry = getPictogram(key);
  return {
    key: entry.key,
    label: entry.label,
    alt: entry.alt,
    viewBox: VIEW_BOX_SIZE,
    frames: entry.frames.map(frameDrawing),
  };
}

/**
 * The frame a thumbnail shows: the LAST one, because that is the position the
 * movement is named after (the bottom of a push-up, the deep squat) rather than
 * the neutral stand every sequence starts from.
 */
export function keyFrameIndex(frameCount: number): number {
  return Math.max(0, frameCount - 1);
}

/**
 * A viewBox cropped to the figure, for the 56px thumbnail.
 *
 * The hero keeps the full 0 0 100 100 box so every frame in a sequence shares
 * one ground line and one scale. A thumbnail has no such neighbours, and at
 * 56px the untrimmed box left a plank as a 12px smudge in the middle of an
 * empty tile — so the thumbnail crops to the pose and squares it up, which is
 * what makes a movement recognisable at that size.
 */
export function frameViewBox(pose: Pose, padding = 6): string {
  const bounds = poseBounds(resolvePose(pose));
  const width = bounds.maxX - bounds.minX + padding * 2;
  const height = bounds.maxY - bounds.minY + padding * 2;
  const side = Math.max(width, height);
  const x = bounds.minX - padding - (side - width) / 2;
  const y = bounds.minY - padding - (side - height) / 2;
  return `${round(x)} ${round(y)} ${round(side)} ${round(side)}`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** The colour each `ShapeRole` takes, per theme. */
export type PictogramPalette = {
  near: string;
  far: string;
  /**
   * Opacity for the far-side limbs. In dark mode there is no second green in
   * the palette that clears 3:1 on the near-black background — `sage` and
   * `brand` are within 1.3:1 of each other, which rendered the figure as one
   * flat silhouette — so the far side is the brand colour held back instead.
   */
  farOpacity: number;
  ground: string;
  /**
   * Opacity for the ground line.
   *
   * The line is decorative, but "decorative" is not "invisible": on `borderSoft`
   * it measured 1.23:1 in light and 1.97:1 in dark, so a low-vision reader saw a
   * figure floating in space. `borderStrong` clears 3:1 in both themes; in dark
   * it clears it so far (11.9:1) that the floor out-shouted the figure, so the
   * dark ground is held back to land just above 3:1 and stay subordinate.
   */
  groundOpacity: number;
};

/** The subset of `ThemeColors` a pictogram needs. */
export type PictogramColors = {
  cta: string;
  brand: string;
  borderSoft: string;
  borderStrong: string;
};

/**
 * Light: near limbs are the deep-emerald CTA (16:1 on the panel) and the far
 * limbs are `brand` (3.8:1 on white, 4:1 against the near limbs). `sage` was
 * the obvious choice for the far side and is the one this started with — it is
 * 1.53:1 on white, i.e. invisible.
 */
export function pictogramPalette(colors: PictogramColors, scheme: 'light' | 'dark'): PictogramPalette {
  return scheme === 'dark'
    ? {
        near: colors.brand,
        far: colors.brand,
        farOpacity: 0.5,
        ground: colors.borderStrong,
        groundOpacity: 0.45,
      }
    : {
        near: colors.cta,
        far: colors.brand,
        farOpacity: 1,
        ground: colors.borderStrong,
        groundOpacity: 1,
      };
}
