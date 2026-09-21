import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { View } from 'react-native';

import { fetchRoster } from '../../features/community/api';
import type { Group } from '../../features/community/groups';
import { mergeRosterWithPresence } from '../../features/community/roster';
import { useGroupPresence } from '../../features/community/useGroupPresence';
import { useOptionalTheme } from '../../theme/ThemeProvider';
import { friendlyErrorMessage } from '../friendlyError';
import { Banner, Button, EmptyState, SectionHeader, Skeleton } from '../ui';
import type { Notice } from './NoticeBanner';
import { PersonRow } from './PersonRow';
import { useDelayedVisible } from '../ui/useDelayedVisible';

type GroupRosterSectionProps = {
  group: Group;
  userId: string | null;
  onNotice: (notice: Notice) => void;
};

/** Two placeholder cards, so the list does not jump when the roster arrives. */
function RosterSkeleton() {
  const { colors, tokens } = useOptionalTheme();
  return (
    <View testID="roster-skeleton" style={{ gap: tokens.space.md }}>
      {[0, 1].map((row) => (
        <View
          key={row}
          style={{
            gap: tokens.space.sm,
            padding: tokens.space.lg,
            borderRadius: tokens.radii.lg,
            borderWidth: 1,
            borderColor: colors.borderSoft,
          }}
        >
          <Skeleton width="60%" height={20} />
          <Skeleton width="30%" height={14} />
        </View>
      ))}
    </View>
  );
}

/** The roster of one group the member belongs to, with presence and the safety actions. */
export function GroupRosterSection({ group, userId, onNotice }: GroupRosterSectionProps) {
  const { tokens } = useOptionalTheme();
  const rosterQuery = useQuery({
    queryKey: ['community', 'roster', group.id],
    queryFn: () => fetchRoster(group.id),
  });
  const onlineIds = useGroupPresence(group.id, userId);
  const showSkeleton = useDelayedVisible(rosterQuery.isLoading);

  const entries = useMemo(
    () => mergeRosterWithPresence(rosterQuery.data ?? [], onlineIds),
    [rosterQuery.data, onlineIds]
  );
  const onlineCount = entries.filter((entry) => entry.online).length;

  return (
    <View style={{ gap: tokens.space.md }}>
      <SectionHeader
        title={group.name}
        subtitle={entries.length > 0 ? `${onlineCount} of ${entries.length} online` : undefined}
        style={{ marginBottom: 0 }}
      />

      {rosterQuery.isLoading ? (
        showSkeleton ? (
          <RosterSkeleton />
        ) : null
      ) : rosterQuery.isError ? (
        <View style={{ gap: tokens.space.md }}>
          <Banner
            tone="danger"
            title="Group did not load"
            message={friendlyErrorMessage(rosterQuery.error, 'Could not load this group.')}
          />
          <Button
            label="Try again"
            variant="secondary"
            onPress={() => void rosterQuery.refetch()}
            accessibilityLabel={`Try loading ${group.name} again`}
          />
        </View>
      ) : entries.length === 0 ? (
        <EmptyState
          testID={`roster-empty-${group.id}`}
          icon="community"
          title="No one else here yet"
          message="You are the first in this group. Invite a training partner, then check again."
          actionLabel="Check again"
          onAction={() => void rosterQuery.refetch()}
        />
      ) : (
        <View style={{ gap: tokens.space.md }}>
          {entries.map((entry) => (
            <PersonRow key={entry.memberId} entry={entry} onNotice={onNotice} />
          ))}
        </View>
      )}
    </View>
  );
}
