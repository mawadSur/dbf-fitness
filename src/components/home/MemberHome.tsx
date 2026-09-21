import { View } from 'react-native';

import type { HomePrimary } from '../../features/workouts/homeState';
import { AffirmationCard } from '../AffirmationCard';
import { ListRow, SectionHeader } from '../ui';
import { HomePrimaryCard } from './HomePrimaryCard';
import { StreakRow } from './StreakRow';

/** The 30-day streak goal Home measures against. */
export const STREAK_GOAL = 30;

const MEMBER_LINKS = [
  { label: 'Calendar', subtitle: 'Your history and effort scores', href: '/calendar', icon: 'calendar' },
  { label: 'Effort', subtitle: 'How the group is doing', href: '/effort', icon: 'trophy' },
  { label: 'Workout notes', subtitle: 'Recordings and coach notes', href: '/notes', icon: 'file-text' },
] as const;

export type MemberHomeProps = {
  primary: HomePrimary;
  /** `null` while the stats query is open. */
  currentStreak: number | null;
  showSkeleton: boolean;
  onStartDay: (dayId: string) => void;
  onPickCoach: () => void;
  onOpen: (href: string) => void;
};

/**
 * Home for a member: one primary action, then the supporting material.
 *
 * The order is the whole point of the redesign — the workout leads, the streak
 * and the affirmation support it, and the shortcuts come last.
 */
export function MemberHome({
  primary,
  currentStreak,
  showSkeleton,
  onStartDay,
  onPickCoach,
  onOpen,
}: MemberHomeProps) {
  return (
    <View style={{ gap: 24 }}>
      <HomePrimaryCard
        primary={primary}
        onStartDay={onStartDay}
        onPickCoach={onPickCoach}
        showSkeleton={showSkeleton}
      />

      <StreakRow currentStreak={currentStreak} goal={STREAK_GOAL} />

      <AffirmationCard />

      <View>
        <SectionHeader title="Keep an eye on" />
        <View style={{ gap: 8 }}>
          {MEMBER_LINKS.map((link) => (
            <ListRow
              key={link.href}
              title={link.label}
              subtitle={link.subtitle}
              icon={link.icon}
              onPress={() => onOpen(link.href)}
              testID={`home-link-${link.href}`}
            />
          ))}
        </View>
      </View>
    </View>
  );
}
