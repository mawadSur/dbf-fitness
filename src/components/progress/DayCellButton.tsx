import { Platform, View } from 'react-native';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import { Icon } from '../ui/Icon';
import { minTouchTarget } from '../ui/layout';
import { PressableBase } from '../ui/PressableBase';
import { Text } from '../ui/Typography';
import { dayCellLabel, type DayCell } from './monthMath';

export type DayCellButtonProps = {
  cell: DayCell;
  selected: boolean;
  onPress: (cell: DayCell) => void;
  /**
   * How far the OS may scale the day number, from `dayNumberMaxFontScale` on
   * the grid's measured column width. The grid owns it because the cell itself
   * is sized in percent and never learns its own width.
   */
  maxFontScale?: number;
};

/**
 * One day in the month grid.
 *
 * State is carried by SHAPE plus TEXT, never by colour: a completed day is a
 * FILLED disc with a check mark, today is an unfilled RING, any other day is a
 * bare number, and the selected day is a square outline around the whole cell —
 * four silhouettes that survive a greyscale screenshot. The full sentence
 * ("Tuesday 8 September, workout completed, effort 8 out of 10") is the cell's
 * accessible name, so a screen reader never has to infer it from the glyph.
 *
 * Nothing here has a fixed height: the disc grows from its padding, so a 200%
 * font scale makes the cell TALLER rather than clipping the number.
 *
 * Sideways it cannot grow — seven equal columns of a fixed-width page — so the
 * day number is capped at `maxFontScale` (what its own column can hold) and
 * pinned to one line. Without that cap React Native broke two-digit days
 * between the digits and the week rows stopped reading as dates.
 */
export function DayCellButton({ cell, selected, onPress, maxFontScale }: DayCellButtonProps) {
  const { colors, tokens } = useOptionalTheme();
  const target = minTouchTarget(Platform.OS);

  return (
    <PressableBase
      testID={`day-${cell.dateKey}`}
      onPress={() => onPress(cell)}
      accessibilityRole="button"
      accessibilityLabel={dayCellLabel(cell)}
      accessibilityState={{ selected }}
      hitSlop={4}
      // Layout NEVER goes in a style callback (design system §7, Android).
      style={{
        width: `${100 / 7}%`,
        minHeight: target,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: tokens.space.xs,
        borderRadius: tokens.radii.md,
        borderWidth: 2,
        borderColor: selected ? colors.focus : 'transparent',
        backgroundColor: selected ? colors.bgSoft : 'transparent',
      }}
    >
      <View
        style={{
          minWidth: 32,
          alignItems: 'center',
          justifyContent: 'center',
          // `space.xs`, not `space.sm`: `minWidth` already sets the disc's size
          // at normal text, so the narrower padding costs nothing there and
          // buys the number 8pt of column at 200% (`DAY_NUMBER_CHROME`).
          paddingHorizontal: tokens.space.xs,
          paddingVertical: tokens.space.xs,
          borderRadius: tokens.radii.pill,
          borderWidth: cell.isToday ? 2 : 0,
          borderColor: cell.isToday ? colors.borderStrong : 'transparent',
          backgroundColor: cell.isCompleted ? colors.cta : 'transparent',
        }}
      >
        <Text
          testID={`day-number-${cell.dateKey}`}
          role="bodySmMedium"
          tabularNums
          numberOfLines={1}
          maxFontSizeMultiplier={maxFontScale}
          color={cell.isCompleted ? colors.onCta : colors.text}
        >
          {cell.day}
        </Text>
      </View>
      {/* Reserved whether or not the check is drawn, so a completed day does not
          grow taller than its neighbours. The icon carries no label: the cell's
          own accessible name already says "workout completed". */}
      <View style={{ height: 16, justifyContent: 'center' }}>
        {cell.isCompleted ? <Icon name="check" size={16} color={colors.progressArc} /> : null}
      </View>
    </PressableBase>
  );
}
