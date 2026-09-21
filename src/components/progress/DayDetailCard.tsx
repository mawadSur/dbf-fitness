import { Platform, View } from 'react-native';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { hitSlopFor, minTouchTarget } from '../ui/layout';
import { PressableBase } from '../ui/PressableBase';
import { Text } from '../ui/Typography';
import { dayTitle, type DayCell } from './monthMath';

export type DayDetailCardProps = {
  cell: DayCell;
  onClose: () => void;
};

function timeOfDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const hours = `${date.getUTCHours()}`.padStart(2, '0');
  const minutes = `${date.getUTCMinutes()}`.padStart(2, '0');
  return `${hours}:${minutes} UTC`;
}

/**
 * What happened on the tapped day, inline under the grid.
 *
 * Inline rather than a bottom sheet: the grid is short, a sheet would cover the
 * month the member is reading, and a `Modal` costs a second focus trap on web
 * for one line of text.
 */
export function DayDetailCard({ cell, onClose }: DayDetailCardProps) {
  const { colors, tokens } = useOptionalTheme();
  const target = minTouchTarget(Platform.OS);
  const title = dayTitle(cell.dateKey);

  return (
    <Card testID="day-detail" tone="raised" style={{ gap: tokens.space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: tokens.space.sm }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text role="h3" accessibilityRole="header">
            {title}
          </Text>
          {cell.isToday ? (
            <Text role="caption" tone="muted">
              Today
            </Text>
          ) : null}
        </View>
        <PressableBase
          testID="day-detail-close"
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={`Close ${title}`}
          hitSlop={hitSlopFor(target, Platform.OS) + 4}
          android_ripple={{ color: colors.bgSoft, borderless: true }}
          // Layout NEVER goes in a style callback (design system §7, Android).
          style={{
            width: target,
            height: target,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="x" size={20} color={colors.text} />
        </PressableBase>
      </View>

      {cell.completions.length === 0 ? (
        <Text role="body" tone="muted">
          Nothing logged on this day.
        </Text>
      ) : (
        <View style={{ gap: tokens.space.sm }}>
          {cell.completions.map((row) => (
            <View
              key={row.id}
              accessible
              accessibilityLabel={[
                title,
                row.status === 'completed' ? 'workout completed' : 'workout missed',
                row.effortScore != null
                  ? `effort ${row.effortScore} out of 10`
                  : 'no effort score yet',
              ].join(', ')}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: tokens.space.md,
              }}
            >
              <Badge
                label={row.status === 'completed' ? 'Completed' : 'Missed'}
                tone={row.status === 'completed' ? 'success' : 'warning'}
                icon={row.status === 'completed' ? 'check-circle' : 'alert-triangle'}
              />
              <View style={{ alignItems: 'flex-end' }}>
                <Text role="bodySmMedium" tabularNums>
                  {row.effortScore != null ? `${row.effortScore}/10 effort` : 'Not scored yet'}
                </Text>
                <Text role="caption" tone="muted" tabularNums>
                  {timeOfDay(row.completedAt)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}
