import { View } from 'react-native';

import {
  DAY_STATUS_META,
  dayRowLabel,
  dayStatus,
  durationCopy,
  type PlanDay,
} from '../../features/workouts/planSummary';
import { Badge, Card, Eyebrow, Heading, Text } from '../ui';

export type DayCardProps = {
  day: PlanDay;
  isCompleted: boolean;
  isToday: boolean;
  onPress: (dayId: string) => void;
  testID?: string;
};

/**
 * One day in the plan list.
 *
 * Today is emphasised by the raised surface AND by its badge, so the emphasis
 * survives greyscale and does not depend on the tint (§4).
 */
export function DayCard({ day, isCompleted, isToday, onPress, testID }: DayCardProps) {
  const status = dayStatus({ isCompleted, isToday });
  const meta = DAY_STATUS_META[status];
  const duration = durationCopy(day.durationMinutes);

  return (
    <Card
      tone={isToday ? 'raised' : 'surface'}
      onPress={() => onPress(day.id)}
      accessibilityLabel={dayRowLabel(day, status)}
      testID={testID}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Eyebrow tone={isToday ? 'brand' : 'muted'}>{`Day ${day.dayNumber}`}</Eyebrow>
          <Heading level={3} numberOfLines={2}>
            {day.blockName}
          </Heading>
          {duration ? (
            <Text role="bodySm" tone="muted">
              {duration}
            </Text>
          ) : null}
        </View>
        <Badge label={meta.label} tone={meta.tone} icon={meta.icon} />
      </View>
    </Card>
  );
}
