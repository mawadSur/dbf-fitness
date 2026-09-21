import { PixelRatio, View } from 'react-native';

import { Card, ProgressRing, Skeleton, Text } from '../ui';

/** Above this OS font scale a ring beside two lines of text stops fitting. */
export const STACK_FONT_SCALE = 1.3;

/** Compact enough to sit under the primary card without competing with it. */
const RING_SIZE = 76;

export type StreakRowProps = {
  /** `null` while the stats query is open. */
  currentStreak: number | null;
  goal: number;
  /** Injectable so the stacking rule is testable without an OS setting. */
  fontScale?: number;
  testID?: string;
};

export function streakCaption(currentStreak: number, goal: number): string {
  if (currentStreak <= 0) return `Finish a workout to start your ${goal}-day streak.`;
  if (currentStreak === 1) return `1 day in a row. ${goal - 1} to go.`;
  if (currentStreak >= goal) return `${currentStreak} days in a row. Goal reached.`;
  return `${currentStreak} days in a row. ${goal - currentStreak} to go.`;
}

/**
 * The streak, demoted from hero to a supporting row (redesign stage 2).
 *
 * At 130% text and above the ring and the copy stack instead of sitting side by
 * side, so neither is squeezed to an unreadable column (§9).
 */
export function StreakRow({
  currentStreak,
  goal,
  fontScale = PixelRatio.getFontScale(),
  testID = 'home-streak',
}: StreakRowProps) {
  const stacked = fontScale >= STACK_FONT_SCALE;

  if (currentStreak === null) {
    return (
      <Card testID={`${testID}-loading`}>
        <View style={{ flexDirection: stacked ? 'column' : 'row', alignItems: 'center', gap: 16 }}>
          <Skeleton width={RING_SIZE} height={RING_SIZE} radius={RING_SIZE / 2} />
          <View style={{ flex: stacked ? undefined : 1, gap: 8, width: stacked ? '100%' : undefined }}>
            <Skeleton width="55%" height={16} />
            <Skeleton width="80%" height={14} />
          </View>
        </View>
      </Card>
    );
  }

  return (
    <Card testID={testID}>
      <View
        style={{
          flexDirection: stacked ? 'column' : 'row',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <ProgressRing
          value={currentStreak}
          max={goal}
          label="Day streak"
          size={RING_SIZE}
          strokeWidth={8}
          showLabel={false}
        />
        <View
          style={{
            flex: stacked ? undefined : 1,
            width: stacked ? '100%' : undefined,
            gap: 2,
          }}
        >
          <Text role="label">Day streak</Text>
          <Text role="bodySm" tone="muted" align={stacked ? 'center' : undefined}>
            {streakCaption(currentStreak, goal)}
          </Text>
        </View>
      </View>
    </Card>
  );
}
