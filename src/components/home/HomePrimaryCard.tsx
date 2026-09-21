import { View } from 'react-native';

import type { HomePrimary } from '../../features/workouts/homeState';
import { nextDaySummary, startDayLabel } from '../../features/workouts/planSummary';
import {
  Button,
  Card,
  EmptyState,
  Eyebrow,
  Heading,
  HeroPanel,
  MilestoneBadge,
  Skeleton,
  Text,
} from '../ui';

export type HomePrimaryCardProps = {
  primary: HomePrimary;
  onStartDay: (dayId: string) => void;
  onPickCoach: () => void;
  /**
   * False for the first 300 ms of a load: the card keeps its full height (so
   * nothing jumps when the answer lands) but stays blank, which is what keeps
   * a cache hit from flashing a skeleton at the member.
   */
  showSkeleton?: boolean;
  testID?: string;
};

/** Widths/heights shared by the skeleton and its blank stand-in. */
const LOADING_BARS = [
  { width: 96 as const, height: 12, radius: undefined },
  { width: '70%' as const, height: 28, radius: undefined },
  { width: '45%' as const, height: 16, radius: undefined },
  { width: '100%' as const, height: 48, radius: 12 },
];

/**
 * The first thing a member sees: exactly ONE card, whatever the situation.
 *
 * Every branch either offers a real action or explains the wait — there is no
 * state here that renders a button which does nothing (design system §5).
 */
export function HomePrimaryCard({
  primary,
  onStartDay,
  onPickCoach,
  showSkeleton = true,
  testID = 'home-primary',
}: HomePrimaryCardProps) {
  switch (primary.kind) {
    case 'loading':
      return (
        <Card padding={24} testID={`${testID}-loading`}>
          <View
            style={{ gap: 12 }}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel="Loading your workout"
          >
            {LOADING_BARS.map((bar, index) =>
              showSkeleton ? (
                <Skeleton key={index} width={bar.width} height={bar.height} radius={bar.radius} />
              ) : (
                <View key={index} style={{ height: bar.height }} />
              ),
            )}
          </View>
        </Card>
      );

    case 'needs-coach':
      return (
        <Card padding={24} testID={`${testID}-needs-coach`}>
          <View style={{ gap: 8 }}>
            <Eyebrow>First step</Eyebrow>
            <Heading level={2}>Choose your coach</Heading>
            <Text tone="secondary">
              Your coach writes your plan, runs your live classes and reviews your notes.
            </Text>
            <Button
              label="Choose your coach"
              onPress={onPickCoach}
              fullWidth
              trailingIcon="arrow-right"
              style={{ marginTop: 8 }}
              testID={`${testID}-pick-coach`}
            />
          </View>
        </Card>
      );

    case 'awaiting-plan':
      return (
        <Card padding={24} testID={`${testID}-awaiting-plan`}>
          <EmptyState
            icon="clock"
            title="Your coach is preparing your plan"
            message="Nothing to do yet. We'll show your first day here as soon as it's ready."
          />
        </Card>
      );

    case 'plan-complete':
      return (
        <HeroPanel padding={24} testID={`${testID}-plan-complete`}>
          <View style={{ gap: 12, alignItems: 'flex-start' }}>
            <MilestoneBadge
              title="Plan complete"
              caption={`All ${primary.totalDays} days done`}
              icon="trophy"
              tone="success"
            />
            <Text tone="secondary">
              That is every day of your plan. Your coach will send the next one.
            </Text>
          </View>
        </HeroPanel>
      );

    case 'next-day': {
      const { day, completedCount, totalDays } = primary;
      return (
        <Card padding={24} tone="raised" testID={`${testID}-next-day`}>
          <View style={{ gap: 8 }}>
            <Eyebrow>{`Day ${day.dayNumber} of ${totalDays}`}</Eyebrow>
            <Heading level={2} numberOfLines={2}>
              {day.blockName}
            </Heading>
            <Text tone="secondary">{nextDaySummary(day)}</Text>
            <Button
              label={startDayLabel(day.dayNumber)}
              onPress={() => onStartDay(day.id)}
              fullWidth
              leadingIcon="play"
              accessibilityHint={`${completedCount} of ${totalDays} days done so far`}
              style={{ marginTop: 8 }}
              testID={`${testID}-start`}
            />
          </View>
        </Card>
      );
    }
  }
}
