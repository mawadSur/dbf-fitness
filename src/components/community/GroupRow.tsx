import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { joinGroup, leaveGroup } from '../../features/community/api';
import type { Group } from '../../features/community/groups';
import type { Notice } from './NoticeBanner';

type GroupRowProps = {
  group: Group;
  isMember: boolean;
  onNotice: (notice: Notice) => void;
};

export function GroupRow({ group, isMember, onNotice }: GroupRowProps) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => (isMember ? leaveGroup(group.id) : joinGroup(group.id)),
    onSuccess: () => {
      onNotice({ tone: 'success', text: isMember ? `Left ${group.name}.` : `Joined ${group.name}.` });
      void queryClient.invalidateQueries({ queryKey: ['community'] });
    },
    onError: (error) => {
      const fallback = isMember ? `Could not leave ${group.name}.` : `Could not join ${group.name}.`;
      onNotice({ tone: 'error', text: error instanceof Error ? error.message : fallback });
    },
  });

  return (
    <View className="flex-row items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <View className="min-w-0 flex-1">
        <Text className="text-base font-medium text-slate-900" numberOfLines={2}>
          {group.name}
        </Text>
        {group.description ? (
          <Text className="text-xs text-slate-600" numberOfLines={2}>
            {group.description}
          </Text>
        ) : null}
      </View>
      <Pressable
        onPress={() => mutation.mutate()}
        disabled={mutation.isPending}
        accessibilityRole="button"
        accessibilityLabel={`${isMember ? 'Leave' : 'Join'} ${group.name}`}
        accessibilityState={{ disabled: mutation.isPending, busy: mutation.isPending }}
        android_ripple={{ color: isMember ? 'rgba(15,23,42,0.12)' : 'rgba(255,255,255,0.25)' }}
        className={`min-h-[44px] min-w-[80px] shrink-0 flex-row items-center justify-center gap-2 overflow-hidden rounded-lg border px-4 py-2 active:opacity-80 ${
          isMember ? 'border-slate-300 bg-white' : 'border-emerald-700 bg-emerald-700'
        } ${mutation.isPending ? 'opacity-60' : ''}`}
      >
        {mutation.isPending ? <ActivityIndicator size="small" color={isMember ? '#475569' : '#FFFFFF'} /> : null}
        <Text className={`text-sm font-semibold ${isMember ? 'text-slate-700' : 'text-white'}`}>
          {isMember ? 'Leave' : 'Join'}
        </Text>
      </Pressable>
    </View>
  );
}
