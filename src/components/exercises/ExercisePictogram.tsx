import { Fragment } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import {
  keyFrameIndex,
  pictogramDrawing,
  pictogramPalette,
  type FrameDrawing,
  type PictogramPalette,
} from '../../features/exercises/drawing';
import { resolveExerciseImageKey } from '../../features/exercises/resolve';
import { useOptionalTheme } from '../../theme/ThemeProvider';
import { svgAccessibilityProps } from '../ui/a11y';
import { HeroPanel } from '../ui/HeroPanel';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Typography';

/** The 56pt tile beside a checklist row (design system §3 touch rhythm). */
export const THUMB_SIZE = 56;
/** Design system §3: content never stretches past 640. */
export const HERO_MAX_WIDTH = 640;
/** Gap between a frame and the arrow that follows it. */
const FRAME_GAP = 4;
/** The smallest a hero frame is allowed to get before it stops being readable. */
export const HERO_FRAME_MIN_SIZE = 56;

export type ExercisePictogramProps = {
  /** A stored pictogram key; ignored when it is not one the registry knows. */
  imageKey?: string | null;
  /** The exercise name as the coach typed it. */
  name: string;
  /** `hero` = the sequence on the detail screen; `thumb` = the 56pt list tile. */
  variant: 'hero' | 'thumb';
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** One posed frame. Purely decorative: the variant above names the whole thing. */
function Frame({
  frame,
  palette,
  size,
  viewBox,
  testID,
}: {
  frame: FrameDrawing;
  palette: PictogramPalette;
  /** A fixed side in points, or `'100%'` to fill an aspect-ratio'd cell. */
  size: number | string;
  viewBox: string;
  testID: string;
}) {
  return (
    <Svg width={size} height={size} viewBox={viewBox} testID={testID} {...svgAccessibilityProps()}>
      {frame.shapes.map((shape, index) => {
        const color = shape.role === 'ground' ? palette.ground : palette[shape.role];
        const opacity =
          shape.role === 'far'
            ? palette.farOpacity
            : shape.role === 'ground'
              ? palette.groundOpacity
              : 1;
        return shape.kind === 'circle' ? (
          <Circle
            key={index}
            cx={shape.cx}
            cy={shape.cy}
            r={shape.r}
            fill={color}
            fillOpacity={opacity}
          />
        ) : (
          <Path
            key={index}
            d={shape.d}
            stroke={color}
            strokeOpacity={opacity}
            strokeWidth={shape.width}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        );
      })}
    </Svg>
  );
}

/**
 * The vector illustration for an exercise.
 *
 * Every figure comes from one mannequin with fixed limb lengths
 * (`src/features/exercises/geometry.ts`), so the whole set looks like one
 * family, and an unknown exercise name degrades to a category drawing rather
 * than to a blank box. Nothing loads: this is synchronous vector output, so
 * there is no skeleton and no layout jump when a list scrolls.
 */
export function ExercisePictogram({ imageKey, name, variant, style, testID }: ExercisePictogramProps) {
  const { colors, scheme } = useOptionalTheme();
  const key = resolveExerciseImageKey({ imageKey, name });
  const drawing = pictogramDrawing(key);
  const palette = pictogramPalette(colors, scheme);

  if (variant === 'thumb') {
    const index = keyFrameIndex(drawing.frames.length);
    return (
      <View
        testID={testID ?? 'exercise-pictogram-thumb'}
        // Decorative: the exercise name always sits next to the tile, so
        // announcing the drawing as well would read the row out twice.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          {
            width: THUMB_SIZE,
            height: THUMB_SIZE,
            borderRadius: 12,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: colors.borderSoft,
            backgroundColor: colors.bgSoft,
            alignItems: 'center',
            justifyContent: 'center',
          },
          style,
        ]}
      >
        <Frame
          frame={drawing.frames[index]}
          palette={palette}
          size={THUMB_SIZE}
          // Cropped to the figure: the full 100-unit box left a plank as a
          // smudge in the middle of an otherwise empty 56pt tile.
          viewBox={drawing.frames[index].croppedViewBox}
          testID="exercise-pictogram-frame-0"
        />
      </View>
    );
  }

  const count = drawing.frames.length;

  return (
    <HeroPanel
      padding={16}
      testID={testID ?? 'exercise-pictogram-hero'}
      style={[{ maxWidth: HERO_MAX_WIDTH, width: '100%' }, style]}
    >
      {/*
        The frames used to be drawn at a placeholder 96pt until `onLayout`
        reported the panel width, then re-drawn at the real size — a visible
        jump of the whole hero on every exercise screen. Now each frame is a
        flex cell with `aspectRatio: 1`, so its height follows from its width
        in the SAME layout pass: the space is reserved before anything is
        painted and nothing moves afterwards (design system §8).
      */}
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Illustration: ${drawing.alt}`}
        style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' }}
      >
        {drawing.frames.map((frame, index) => (
          <Fragment key={index}>
            {index > 0 ? (
              // Arrows sit OUTSIDE the flex cells so every frame gets the same
              // width; inside them the first frame would be one arrow wider.
              <View style={{ paddingHorizontal: FRAME_GAP, alignSelf: 'center' }}>
                <Icon name="chevron-right" size={20} color={colors.textMuted} />
              </View>
            ) : null}
            <View style={{ flex: 1, alignItems: 'center' }}>
              <View
                testID={`exercise-pictogram-cell-${index}`}
                style={{ width: '100%', aspectRatio: 1, minWidth: HERO_FRAME_MIN_SIZE }}
              >
                <Frame
                  frame={frame}
                  palette={palette}
                  size="100%"
                  viewBox={`0 0 ${drawing.viewBox} ${drawing.viewBox}`}
                  testID={`exercise-pictogram-frame-${index}`}
                />
              </View>
              {count > 1 ? (
                <Text role="caption" color={colors.textMuted}>
                  {index + 1}
                </Text>
              ) : null}
            </View>
          </Fragment>
        ))}
      </View>
    </HeroPanel>
  );
}
