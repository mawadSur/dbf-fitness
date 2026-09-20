import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GroupRosterSection } from '../../../src/components/community/GroupRosterSection';
import { GroupRow } from '../../../src/components/community/GroupRow';
import { NoticeBanner, type Notice } from '../../../src/components/community/NoticeBanner';
import { ScrollIntoViewContext } from '../../../src/components/community/ScrollIntoView';
import { useListScrollIntoView } from '../../../src/components/community/useListScrollIntoView';
import { fetchGroups, getMemberId } from '../../../src/features/community/api';
import { splitGroups } from '../../../src/features/community/groups';
import { buildCommunityItems, type CommunityItem } from '../../../src/features/community/screenItems';

/** 'padding' on both platforms: edge-to-edge Android no longer resizes the window for the keyboard. */
const KEYBOARD_BEHAVIOR = 'padding' as const;

export default function CommunityScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const listRef = useRef<FlatList<CommunityItem>>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { onScroll, scrollIntoView } = useListScrollIntoView(listRef);

  const meQuery = useQuery({ queryKey: ['community', 'me'], queryFn: getMemberId });
  const groupsQuery = useQuery({ queryKey: ['community', 'groups'], queryFn: fetchGroups });

  const { mine, discover } = useMemo(
    () => splitGroups(groupsQuery.data?.groups ?? [], new Set(groupsQuery.data?.memberGroupIds ?? [])),
    [groupsQuery.data]
  );
  const items = useMemo(() => buildCommunityItems(mine, discover), [mine, discover]);
  const userId = meQuery.data ?? null;

  // The current-user lookup gates presence: if it fails we must say so rather than render the
  // whole roster as Offline, which is indistinguishable from nobody being online.
  const isLoading = meQuery.isLoading || groupsQuery.isLoading;
  const loadError = meQuery.error ?? groupsQuery.error;
  const retry = () => {
    void meQuery.refetch();
    void groupsQuery.refetch();
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Refetches every active community query: me, groups and each group's roster.
      await queryClient.invalidateQueries({ queryKey: ['community'] });
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);

  const renderItem = ({ item }: { item: CommunityItem }) => {
    switch (item.type) {
      case 'heading':
        return item.variant === 'section' ? (
          <Text accessibilityRole="header" className="pb-3 pt-3 text-lg font-semibold text-slate-900">
            {item.text}
          </Text>
        ) : (
          <Text accessibilityRole="header" className="pb-3 pt-2 text-sm font-semibold text-slate-600">
            {item.text}
          </Text>
        );
      case 'empty':
        return <Text className="pb-3 text-sm text-slate-600">{item.text}</Text>;
      case 'roster':
        return (
          <View className="pb-4">
            <GroupRosterSection group={item.group} userId={userId} onNotice={setNotice} />
          </View>
        );
      case 'group':
        return (
          <View className="pb-3">
            <GroupRow group={item.group} isMember={item.isMember} onNotice={setNotice} />
          </View>
        );
    }
  };

  const header = (
    <View className="gap-6 pb-3">
      <View className="gap-1">
        <Text accessibilityRole="header" className="text-2xl font-bold text-slate-900">
          Community
        </Text>
        <Text className="text-sm text-slate-600">The people you train with.</Text>
      </View>

      <Link href="/community/live" asChild>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Live classes"
          android_ripple={{ color: 'rgba(255,255,255,0.25)' }}
          className="min-h-[56px] flex-row items-center justify-between gap-3 overflow-hidden rounded-xl bg-emerald-700 px-5 py-4 active:opacity-80"
        >
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-lg font-bold text-white">Live classes</Text>
            <Text className="text-sm text-emerald-50">Train together with your coach, live.</Text>
          </View>
          <Text className="text-2xl font-bold text-white">›</Text>
        </Pressable>
      </Link>

      {notice ? <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} /> : null}

      {isLoading ? (
        <ActivityIndicator color="#047857" accessibilityLabel="Loading community" />
      ) : loadError ? (
        <View className="items-center gap-2">
          <Text accessibilityRole="alert" className="text-center text-sm text-red-700">
            {loadError instanceof Error ? loadError.message : 'Could not load your community.'}
          </Text>
          <Pressable
            onPress={retry}
            accessibilityRole="button"
            android_ripple={{ color: 'rgba(4,120,87,0.15)' }}
            className="min-h-[44px] min-w-[44px] items-center justify-center px-4 active:opacity-80"
          >
            <Text className="text-sm font-semibold text-emerald-700">Try again</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  return (
    <ScrollIntoViewContext.Provider value={scrollIntoView}>
      <KeyboardAvoidingView className="flex-1 bg-white" behavior={KEYBOARD_BEHAVIOR}>
        <FlatList
          ref={listRef}
          testID="community-list"
          data={isLoading || loadError ? [] : items}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          ListHeaderComponent={header}
          onScroll={onScroll}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
          className="flex-1"
          contentContainerStyle={{
            paddingTop: insets.top + 16,
            paddingHorizontal: 24,
            paddingBottom: 40,
          }}
        />
      </KeyboardAvoidingView>
    </ScrollIntoViewContext.Provider>
  );
}
