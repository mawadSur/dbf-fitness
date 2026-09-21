import { View } from 'react-native';

import type { CommunityItem } from '../../features/community/screenItems';
import { useOptionalTheme } from '../../theme/ThemeProvider';
import { EmptyState, Heading, SectionHeader } from '../ui';
import { GroupRosterSection } from './GroupRosterSection';
import { GroupRow } from './GroupRow';
import type { Notice } from './NoticeBanner';

type CommunityListItemProps = {
  item: CommunityItem;
  userId: string | null;
  onNotice: (notice: Notice) => void;
  /** Takes the member to the Groups section, which is what the empty roster asks for. */
  onSeeGroups: () => void;
  onRefresh: () => void;
};

/**
 * One row of the flattened community list. Keeping the switch out of the screen
 * keeps the screen file short and lets each state be rendered on its own in a test.
 */
export function CommunityListItem({
  item,
  userId,
  onNotice,
  onSeeGroups,
  onRefresh,
}: CommunityListItemProps) {
  const { tokens } = useOptionalTheme();

  switch (item.type) {
    case 'heading':
      return item.variant === 'section' ? (
        <SectionHeader title={item.text} style={{ marginBottom: 0, paddingTop: tokens.space.lg }} />
      ) : (
        <View style={{ paddingTop: tokens.space.md, paddingBottom: tokens.space.xs }}>
          <Heading level={3}>{item.text}</Heading>
        </View>
      );

    case 'empty':
      return item.key === 'empty:people' ? (
        <EmptyState
          testID="community-empty-people"
          icon="community"
          title="You are not in a group yet"
          message={item.text}
          actionLabel="See groups"
          onAction={onSeeGroups}
        />
      ) : (
        <EmptyState
          testID="community-empty-groups"
          icon="community"
          title="No groups yet"
          message="Your coach has not set up a group yet. Check again in a moment."
          actionLabel="Check again"
          onAction={onRefresh}
        />
      );

    case 'roster':
      return (
        <View style={{ paddingBottom: tokens.space.lg }}>
          <GroupRosterSection group={item.group} userId={userId} onNotice={onNotice} />
        </View>
      );

    case 'group':
      return (
        <View style={{ paddingBottom: tokens.space.md }}>
          <GroupRow group={item.group} isMember={item.isMember} onNotice={onNotice} />
        </View>
      );
  }
}
