import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl } from 'react-native';

import { useOptionalTheme } from '../../../src/theme/ThemeProvider';
import { CommunityHeader } from '../../../src/components/community/CommunityHeader';
import { CommunityListItem } from '../../../src/components/community/CommunityListItem';
import type { Notice } from '../../../src/components/community/NoticeBanner';
import { ScrollIntoViewContext } from '../../../src/components/community/ScrollIntoView';
import { useListScrollIntoView } from '../../../src/components/community/useListScrollIntoView';
import { ScreenHeader, ScreenShell } from '../../../src/components/ui';
import { fetchGroups, getMemberId } from '../../../src/features/community/api';
import { splitGroups } from '../../../src/features/community/groups';
import { buildCommunityItems, type CommunityItem } from '../../../src/features/community/screenItems';

const keyExtractor = (item: CommunityItem) => item.key;

export default function CommunityScreen() {
  const router = useRouter();
  const { colors } = useOptionalTheme();
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
  const retry = useCallback(() => {
    void meQuery.refetch();
    void groupsQuery.refetch();
  }, [meQuery, groupsQuery]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Refetches every active community query: me, groups and each group's roster.
      await queryClient.invalidateQueries({ queryKey: ['community'] });
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);

  const seeGroups = useCallback(() => {
    const index = items.findIndex((item) => item.key === 'heading:groups');
    if (index >= 0) listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0 });
  }, [items]);

  const renderItem = useCallback(
    ({ item }: { item: CommunityItem }) => (
      <CommunityListItem
        item={item}
        userId={userId}
        onNotice={setNotice}
        onSeeGroups={seeGroups}
        onRefresh={() => void onRefresh()}
      />
    ),
    [userId, seeGroups, onRefresh]
  );

  return (
    <ScrollIntoViewContext.Provider value={scrollIntoView}>
      <ScreenShell
        testID="community"
        insideTabs
        scroll={false}
        keyboardAvoiding
        contentStyle={{ paddingBottom: 0 }}
        header={<ScreenHeader title="Community" eyebrow="Your people" />}
      >
        <FlatList
          ref={listRef}
          testID="community-list"
          style={{ flex: 1 }}
          data={isLoading || loadError ? [] : items}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ListHeaderComponent={
            <CommunityHeader
              notice={notice}
              onDismissNotice={() => setNotice(null)}
              onOpenLiveClasses={() => router.push('/community/live')}
              isLoading={isLoading}
              loadError={loadError}
              onRetry={retry}
            />
          }
          onScroll={onScroll}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
              tintColor={colors.brand}
              colors={[colors.brand]}
            />
          }
          contentContainerStyle={{ paddingBottom: 32 }}
        />
      </ScreenShell>
    </ScrollIntoViewContext.Provider>
  );
}
