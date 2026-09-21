import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { View } from 'react-native';

import { fetchRoster, joinGroup, leaveGroup } from '../../features/community/api';
import type { Group } from '../../features/community/groups';
import { useOptionalTheme } from '../../theme/ThemeProvider';
import { friendlyErrorMessage } from '../friendlyError';
import { Button, Card, Icon, Text } from '../ui';
import type { Notice } from './NoticeBanner';

type GroupRowProps = {
  group: Group;
  isMember: boolean;
  onNotice: (notice: Notice) => void;
};

/** "You and 3 others" — the roster excludes the caller, so the count adds them back. */
export function memberCountLabel(rosterSize: number): string {
  if (rosterSize <= 0) return 'Just you so far';
  return rosterSize === 1 ? 'You and 1 other' : `You and ${rosterSize} others`;
}

/**
 * One group card: name, description, how many people are in it, and the single
 * join/leave action. The count is only knowable for a group you are in (fellow
 * members are the only rows the roster window exposes), so a Discover card says
 * nothing about size rather than guessing.
 */
export function GroupRow({ group, isMember, onNotice }: GroupRowProps) {
  const queryClient = useQueryClient();
  const { colors } = useOptionalTheme();

  // Same query key as the roster section, so a member's group costs one fetch, not two.
  const roster = useQuery({
    queryKey: ['community', 'roster', group.id],
    queryFn: () => fetchRoster(group.id),
    enabled: isMember,
  });

  const mutation = useMutation({
    mutationFn: () => (isMember ? leaveGroup(group.id) : joinGroup(group.id)),
    onSuccess: () => {
      onNotice({ tone: 'success', text: isMember ? `Left ${group.name}.` : `Joined ${group.name}.` });
      void queryClient.invalidateQueries({ queryKey: ['community'] });
    },
    onError: (error) => {
      const fallback = isMember ? `Could not leave ${group.name}.` : `Could not join ${group.name}.`;
      onNotice({ tone: 'error', text: friendlyErrorMessage(error, fallback) });
    },
  });

  const count = isMember && roster.data ? memberCountLabel(roster.data.length) : null;

  return (
    <Card testID={`group-card-${group.id}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text role="label" numberOfLines={2}>
            {group.name}
          </Text>
          {group.description ? (
            <Text role="bodySm" tone="muted" numberOfLines={2}>
              {group.description}
            </Text>
          ) : null}
          {count ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="community" size={16} color={colors.textSecondary} />
              <Text role="caption" tone="secondary">
                {count}
              </Text>
            </View>
          ) : null}
        </View>
        <Button
          testID={`group-action-${group.id}`}
          label={isMember ? 'Leave' : 'Join'}
          variant={isMember ? 'secondary' : 'primary'}
          onPress={() => mutation.mutate()}
          disabled={mutation.isPending}
          loading={mutation.isPending}
          accessibilityLabel={`${isMember ? 'Leave' : 'Join'} ${group.name}`}
          style={{ flexShrink: 0 }}
        />
      </View>
    </Card>
  );
}
