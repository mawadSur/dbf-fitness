import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { fetchRoster } from '../../features/community/api';
import type { Group } from '../../features/community/groups';
import { mergeRosterWithPresence } from '../../features/community/roster';
import { useGroupPresence } from '../../features/community/useGroupPresence';
import { friendlyErrorMessage } from '../friendlyError';
import type { Notice } from './NoticeBanner';
import { PersonRow } from './PersonRow';

type GroupRosterSectionProps = {
  group: Group;
  userId: string | null;
  onNotice: (notice: Notice) => void;
};

export function GroupRosterSection({ group, userId, onNotice }: GroupRosterSectionProps) {
  const rosterQuery = useQuery({
    queryKey: ['community', 'roster', group.id],
    queryFn: () => fetchRoster(group.id),
  });
  const onlineIds = useGroupPresence(group.id, userId);

  const entries = useMemo(
    () => mergeRosterWithPresence(rosterQuery.data ?? [], onlineIds),
    [rosterQuery.data, onlineIds]
  );
  const onlineCount = entries.filter((entry) => entry.online).length;

  return (
    <View className="gap-2">
      <View className="flex-row items-baseline justify-between">
        <Text accessibilityRole="header" className="min-w-0 flex-1 text-base font-semibold text-slate-900" numberOfLines={1}>
          {group.name}
        </Text>
        {entries.length > 0 ? (
          <Text className="shrink-0 pl-3 text-xs text-slate-600">
            {onlineCount} of {entries.length} online
          </Text>
        ) : null}
      </View>

      {rosterQuery.isLoading ? (
        <ActivityIndicator color="#047857" accessibilityLabel={`Loading ${group.name}`} />
      ) : rosterQuery.isError ? (
        <View className="items-start gap-2">
          <Text accessibilityRole="alert" className="text-sm text-red-700">
            {friendlyErrorMessage(rosterQuery.error, 'Could not load this group.')}
          </Text>
          <Pressable
            onPress={() => void rosterQuery.refetch()}
            accessibilityRole="button"
            android_ripple={{ color: 'rgba(4,120,87,0.15)' }}
            className="min-h-[44px] min-w-[44px] justify-center active:opacity-80"
          >
            <Text className="text-sm font-semibold text-emerald-700">Try again</Text>
          </Pressable>
        </View>
      ) : entries.length === 0 ? (
        <Text className="text-sm text-slate-600">No one else is in this group yet.</Text>
      ) : (
        <View className="gap-2">
          {entries.map((entry) => (
            <PersonRow key={entry.memberId} entry={entry} onNotice={onNotice} />
          ))}
        </View>
      )}
    </View>
  );
}
