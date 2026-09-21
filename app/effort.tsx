import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';

import { friendlyErrorMessage } from '../src/components/friendlyError';
import {
  rankByEffort,
  withNames,
  type EffortRow,
  type EffortStat,
} from '../src/components/progress/effortRanking';
import {
  EffortSummaryCard,
  EffortSummarySkeleton,
} from '../src/components/progress/EffortSummaryCard';
import { ErrorBlock } from '../src/components/progress/ErrorBlock';
import {
  LeaderboardRow,
  LeaderboardSkeleton,
} from '../src/components/progress/LeaderboardRow';
import { useDelayedVisible } from '../src/components/ui/useDelayedVisible';
import { EmptyState } from '../src/components/ui/EmptyState';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { ScreenShell } from '../src/components/ui/ScreenShell';
import { SectionHeader } from '../src/components/ui/SectionHeader';
import { supabase } from '../src/services/supabase/client';
import { useOptionalTheme } from '../src/theme/ThemeProvider';

async function fetchLeaderboard(): Promise<EffortRow[]> {
  const { data: stats, error: statsError } = await supabase
    .from('member_workout_stats')
    .select(
      'member_id, completed_count, missed_count, total_effort_score, avg_effort_score, current_streak',
    );
  if (statsError) throw statsError;

  const statsRows = (stats ?? []) as EffortStat[];
  if (statsRows.length === 0) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in(
      'id',
      statsRows.map((row) => row.member_id),
    );
  if (profilesError) throw profilesError;

  const nameById = new Map(
    (profiles ?? []).map((profile) => [profile.id as string, profile.full_name as string]),
  );

  return rankByEffort(withNames(statsRows, nameById));
}

/**
 * Effort: a member sees their own ring, a coach sees the leaderboard.
 *
 * Which one is decided by how many rows RLS let through — exactly as before the
 * redesign — so the screen keeps one query and no role check of its own.
 */
export default function EffortScreen() {
  const router = useRouter();
  const { tokens } = useOptionalTheme();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['effort', 'leaderboard'],
    queryFn: fetchLeaderboard,
  });

  const showSkeleton = useDelayedVisible(isLoading);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  };

  const rows = data ?? [];
  const isSingleMemberView = rows.length === 1;
  // The single-member view draws its card in the header, so the list stays empty.
  const listRows = isLoading || isError || isSingleMemberView ? [] : rows;

  const renderItem = useCallback(
    ({ item, index }: { item: EffortRow; index: number }) => (
      <LeaderboardRow rank={index + 1} row={item} />
    ),
    [],
  );

  return (
    <ScreenShell
      testID="effort"
      scroll={false}
      header={
        <ScreenHeader
          eyebrow="Progress"
          title={isSingleMemberView ? 'Your effort' : 'Effort leaderboard'}
          onBack={goBack}
        />
      }
    >
      <FlatList
        testID="effort-list"
        data={listRows}
        keyExtractor={(row) => row.member_id}
        renderItem={renderItem}
        contentContainerStyle={{ gap: tokens.space.sm, paddingBottom: tokens.space.xl }}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
        ListHeaderComponent={
          <View style={{ gap: tokens.space.lg, paddingBottom: tokens.space.md }}>
            {isError ? (
              <ErrorBlock
                message={friendlyErrorMessage(error, 'Could not load effort data.')}
                onRetry={handleRefresh}
              />
            ) : isLoading ? (
              showSkeleton ? (
                <>
                  <EffortSummarySkeleton />
                  <LeaderboardSkeleton />
                </>
              ) : null
            ) : rows.length === 0 ? (
              <EmptyState
                icon="flame"
                title="No effort scores yet"
                message="Finish a workout and your coach can score the effort it took."
                actionLabel="Go to your workouts"
                onAction={() => router.replace('/workout')}
              />
            ) : isSingleMemberView ? (
              <EffortSummaryCard row={rows[0]} />
            ) : (
              <SectionHeader
                title="Ranked by average effort"
                subtitle={`${rows.length} members`}
              />
            )}
          </View>
        }
      />
    </ScreenShell>
  );
}
