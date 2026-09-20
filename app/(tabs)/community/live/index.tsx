import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LiveButton } from '../../../../src/components/live/LiveButton';
import { SubscriptionBlockedPanel } from '../../../../src/components/live/SubscriptionBlockedPanel';
import {
  fetchCurrentMember,
  fetchUpcomingLiveClasses,
  type LiveClass,
} from '../../../../src/features/liveClasses/api';
import { canOpenClassFromList } from '../../../../src/features/liveClasses/joinDecision';
import {
  displayStateOf,
  STATUS_BADGE_LABEL,
  type LiveClassDisplayState,
} from '../../../../src/features/liveClasses/status';
import { formatCountdown, formatStartTime } from '../../../../src/features/liveClasses/timing';
import { useNow } from '../../../../src/features/liveClasses/useNow';
import { usePushRegistration } from '../../../../src/features/liveClasses/usePushRegistration';
import { useSubscriptionState } from '../../../../src/features/subscriptions/useSubscriptionState';

const REFETCH_INTERVAL_MS = 60_000;

export default function LiveScheduleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const now = useNow();
  usePushRegistration();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['liveClasses', 'schedule'],
    queryFn: fetchUpcomingLiveClasses,
    refetchInterval: REFETCH_INTERVAL_MS,
  });
  const memberQuery = useQuery({ queryKey: ['liveClasses', 'me'], queryFn: fetchCurrentMember });
  const subscription = useSubscriptionState();

  const classes = data ?? [];
  const info = subscription.data ?? null;
  const canOpen = canOpenClassFromList(info);
  const role = memberQuery.data?.role;
  const isCoach = role === 'coach' || role === 'admin';

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/community'));

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refetch(),
        queryClient.invalidateQueries({ queryKey: ['subscription', 'state'] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const header = (
    <View className="w-full max-w-[720px] gap-4 self-center">
      <LiveButton label="‹ Back" variant="ghost" onPress={goBack} className="self-start" accessibilityLabel="Back to community" />

      <View className="flex-row items-center justify-between gap-3">
        <Text className="flex-1 text-2xl font-bold text-slate-900" accessibilityRole="header">
          Live classes
        </Text>
        {isCoach ? (
          <LiveButton
            label="Schedule class"
            onPress={() => router.push('/community/live/new')}
            accessibilityLabel="Schedule a class"
          />
        ) : null}
      </View>

      {info && !canOpen ? (
        <SubscriptionBlockedPanel reason={info.state === 'expired' ? 'expired' : 'required'} />
      ) : null}

      {isLoading ? (
        <ActivityIndicator color="#059669" />
      ) : isError ? (
        <View className="items-center gap-2">
          <Text className="text-center text-sm text-red-600">
            {error instanceof Error ? error.message : 'Could not load live classes.'}
          </Text>
          <LiveButton label="Try again" variant="secondary" onPress={() => void refetch()} />
        </View>
      ) : classes.length === 0 ? (
        <Text className="text-sm text-slate-500">No live classes scheduled yet.</Text>
      ) : null}
    </View>
  );

  return (
    <View className="flex-1 bg-white">
      <FlatList
        data={isLoading || isError ? [] : classes}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <View className="w-full max-w-[720px] self-center pt-3">
            <LiveClassCard
              liveClass={item}
              now={now}
              canOpen={canOpen}
              onJoin={() => router.push(`/community/live/${item.id}`)}
            />
          </View>
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 40 }}
      />
    </View>
  );
}

const BADGE_STYLE: Record<LiveClassDisplayState, { container: string; text: string }> = {
  live: { container: 'bg-red-100', text: 'text-red-700' },
  'starting-soon': { container: 'bg-emerald-100', text: 'text-emerald-700' },
  scheduled: { container: 'bg-slate-100', text: 'text-slate-600' },
  ended: { container: 'bg-slate-100', text: 'text-slate-600' },
  cancelled: { container: 'bg-slate-100', text: 'text-slate-600' },
};

function LiveClassCard({
  liveClass,
  now,
  canOpen,
  onJoin,
}: {
  liveClass: LiveClass;
  now: Date;
  canOpen: boolean;
  onJoin: () => void;
}) {
  const state = displayStateOf(liveClass.status, liveClass.starts_at, now);
  const highlighted = state === 'live' || state === 'starting-soon';
  const badge = BADGE_STYLE[state];

  return (
    <View
      className={`gap-2 rounded-xl border p-4 ${
        highlighted ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-slate-50'
      }`}
    >
      {highlighted ? (
        <Text className="text-xs font-bold uppercase tracking-wide text-emerald-700">
          {state === 'live' ? 'Live now' : 'Starting soon'}
        </Text>
      ) : null}

      <View className="flex-row items-start justify-between gap-3">
        <Text className="flex-1 text-lg font-semibold text-slate-900" numberOfLines={2}>
          {liveClass.title}
        </Text>
        <View className={`rounded-full px-2 py-1 ${badge.container}`}>
          <Text className={`text-xs font-semibold ${badge.text}`}>{STATUS_BADGE_LABEL[state]}</Text>
        </View>
      </View>

      <Text className="text-sm text-slate-600">{formatStartTime(liveClass.starts_at)}</Text>
      <Text className="text-sm font-medium text-slate-900">{formatCountdown(liveClass.starts_at, now)}</Text>

      <LiveButton
        label={canOpen ? 'Join' : 'Subscription required'}
        onPress={onJoin}
        disabled={!canOpen}
        accessibilityLabel={canOpen ? `Join ${liveClass.title}` : `${liveClass.title}: subscription required`}
        className="mt-1"
      />
    </View>
  );
}
