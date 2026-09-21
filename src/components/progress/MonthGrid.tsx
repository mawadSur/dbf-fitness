import { useState } from 'react';
import { Platform, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import { Icon } from '../ui/Icon';
import { CONTENT_MAX_WIDTH, hitSlopFor, minTouchTarget, screenGutter } from '../ui/layout';
import { PressableBase } from '../ui/PressableBase';
import { Text } from '../ui/Typography';
import { DayCellButton } from './DayCellButton';
import { dayNumberMaxFontScale } from './fontScale';
import {
  WEEKDAY_INITIALS,
  WEEKDAY_NAMES,
  monthTitle,
  type DayCell,
  type GridCell,
  type MonthKey,
} from './monthMath';

export type MonthGridProps = {
  month: MonthKey;
  cells: readonly GridCell[];
  /** Text summary shown under the grid — the count in words. */
  summary: string;
  selectedDateKey: string | null;
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSelectDay: (cell: DayCell) => void;
};

function MonthStepper({
  direction,
  label,
  disabled,
  onPress,
}: {
  direction: 'prev' | 'next';
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors, tokens } = useOptionalTheme();
  const target = minTouchTarget(Platform.OS);

  return (
    <PressableBase
      testID={`month-${direction}`}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={hitSlopFor(target, Platform.OS) + 4}
      pressFeedback={disabled ? 'none' : 'ds'}
      android_ripple={disabled ? undefined : { color: colors.bgSoft, borderless: true }}
      // Layout NEVER goes in a style callback (design system §7, Android).
      style={{
        width: target,
        height: target,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: tokens.radii.md,
        borderWidth: 1,
        borderColor: disabled ? colors.borderSoft : colors.borderStrong,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Icon
        name={direction === 'prev' ? 'chevron-left' : 'chevron-right'}
        size={20}
        color={disabled ? colors.textMuted : colors.text}
      />
    </PressableBase>
  );
}

/**
 * A real month grid: seven Monday-first columns, a stepper header and a text
 * summary underneath.
 *
 * The summary is not decoration. The grid says "12 filled discs" in a shape
 * language; the sentence says "12 workouts in September" in words, which is what
 * a screen reader reads out first and what a member reads when the discs are too
 * small to count.
 */
export function MonthGrid({
  month,
  cells,
  summary,
  selectedDateKey,
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
  onSelectDay,
}: MonthGridProps) {
  const { colors, tokens } = useOptionalTheme();
  const { width } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);

  // The grid is seven equal columns, so the day number's ceiling is a property
  // of the ROW's width. The window-derived estimate (the shell's centred 640
  // column, minus its gutter) is what the first frame uses so nothing is ever
  // drawn uncapped; `onLayout` replaces it with the real width for any host
  // that is not the standard screen shell (the gallery, a split view).
  const estimatedWidth = Math.min(width, CONTENT_MAX_WIDTH) - screenGutter(width) * 2;
  const rowWidth = measuredWidth ?? estimatedWidth;
  const maxFontScale = dayNumberMaxFontScale(rowWidth / 7);

  const onRowLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    setMeasuredWidth((current) => (current === next ? current : next));
  };

  return (
    <View testID="month-grid" style={{ gap: tokens.space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space.md }}>
        <MonthStepper
          direction="prev"
          label="Previous month"
          disabled={!canGoPrev}
          onPress={onPrev}
        />
        <Text role="h3" align="center" style={{ flex: 1 }} accessibilityRole="header">
          {monthTitle(month)}
        </Text>
        <MonthStepper direction="next" label="Next month" disabled={!canGoNext} onPress={onNext} />
      </View>

      {/* Decorative: every cell already names its own weekday out loud. */}
      <View
        style={{ flexDirection: 'row' }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {WEEKDAY_INITIALS.map((initial, index) => (
          <Text
            key={WEEKDAY_NAMES[index]}
            role="caption"
            tone="muted"
            align="center"
            style={{ width: `${100 / 7}%` }}
          >
            {initial}
          </Text>
        ))}
      </View>

      <View
        onLayout={onRowLayout}
        style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: tokens.space.xs }}
      >
        {cells.map((cell, index) =>
          cell ? (
            <DayCellButton
              key={cell.dateKey}
              cell={cell}
              selected={cell.dateKey === selectedDateKey}
              onPress={onSelectDay}
              maxFontScale={maxFontScale}
            />
          ) : (
            <View
              // Padding cells have no date of their own, so the grid index is
              // the only stable identity available.
              key={`pad-${index}`}
              style={{ width: `${100 / 7}%` }}
            />
          ),
        )}
      </View>

      <Text role="bodySmMedium" color={colors.textSecondary} testID="month-summary">
        {summary}
      </Text>
    </View>
  );
}
