import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '../src/services/supabase/client';
import { colors } from '../src/theme/tokens';

type LeaderboardRow = {
  member_id: string;
  completed_count: number;
  missed_count: number;
  total_effort_score: number;
  avg_effort_score: number | null;
  current_streak: number;
  fullName: string;
};

type StatsRow = {
  member_id: string;
  completed_count: number;
  missed_count: number;
  total_effort_score: number;
  avg_effort_score: number | null;
  current_streak: number;
};

function formatAvgEffort(avgEffortScore: number | null): string {
  return avgEffortScore != null ? `${Math.round(avgEffortScore * 10) / 10}/10` : '—';
}

async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  const { data: stats, error: statsError } = await supabase
    .from('member_workout_stats')
    .select(
      'member_id, completed_count, missed_count, total_effort_score, avg_effort_score, current_streak'
    );
  if (statsError) throw statsError;

  const statsRows = (stats ?? []) as StatsRow[];
  if (statsRows.length === 0) return [];

  const memberIds = statsRows.map((row) => row.member_id);
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', memberIds);
  if (profilesError) throw profilesError;

  const nameById = new Map(
    (profiles ?? []).map((profile) => [profile.id, profile.full_name as string])
  );

  const rows: LeaderboardRow[] = statsRows.map((row) => ({
    ...row,
    fullName: nameById.get(row.member_id) ?? 'Unknown member',
  }));

  rows.sort((a, b) => {
    if (a.avg_effort_score == null && b.avg_effort_score == null) return 0;
    if (a.avg_effort_score == null) return 1;
    if (b.avg_effort_score == null) return -1;
    return b.avg_effort_score - a.avg_effort_score;
  });

  return rows;
}

function BackLink({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      android_ripple={{ color: colors.primaryMuted }}
      className="min-h-[44px] justify-center self-start pr-4"
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <Text className="text-base font-semibold text-emerald-700">‹ Back</Text>
    </Pressable>
  );
}

export default function EffortScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['effort', 'leaderboard'],
    queryFn: fetchLeaderboard,
  });

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
  // The single-member view renders its card in the header, so the list itself stays empty.
  const listRows = isLoading || isError || isSingleMemberView ? [] : rows;

  return (
    <FlatList
      className="flex-1 bg-white"
      data={listRows}
      keyExtractor={(row) => row.member_id}
      contentContainerClassName="gap-2 px-6 pb-10"
      contentContainerStyle={{
        paddingTop: insets.top + 8,
        paddingBottom: insets.bottom + 24,
      }}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
      ListHeaderComponent={
        <View className="gap-4 pb-2">
          <BackLink onPress={goBack} />

          <Text accessibilityRole="header" className="text-2xl font-bold text-slate-900">
            {isSingleMemberView ? 'Your Effort' : 'Effort Leaderboard'}
          </Text>

          {isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : isError ? (
            <View className="items-center gap-2">
              <Text accessibilityRole="alert" className="text-center text-sm text-red-700">
                {error instanceof Error ? error.message : 'Could not load effort data.'}
              </Text>
              <Pressable
                onPress={() => refetch()}
                accessibilityRole="button"
                accessibilityLabel="Try again"
                android_ripple={{ color: colors.primaryMuted }}
                className="min-h-[44px] items-center justify-center px-4"
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <Text className="text-base font-semibold text-emerald-700">Try again</Text>
              </Pressable>
            </View>
          ) : rows.length === 0 ? (
            <Text className="text-sm text-slate-600">No effort data yet.</Text>
          ) : isSingleMemberView ? (
            <YourEffortCard row={rows[0]} />
          ) : null}
        </View>
      }
      renderItem={({ item, index }) => <LeaderboardRowCard rank={index + 1} row={item} />}
    />
  );
}

function YourEffortCard({ row }: { row: LeaderboardRow }) {
  return (
    <View className="gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <Text className="text-3xl font-bold text-emerald-700">
        {formatAvgEffort(row.avg_effort_score)}
      </Text>
      <Text className="text-sm text-slate-600">Average effort score</Text>

      <View className="flex-row flex-wrap gap-3 pt-2">
        <StatTile label="Completed" value={String(row.completed_count)} />
        <StatTile label="Missed" value={String(row.missed_count)} />
        <StatTile label="Streak" value={`${row.current_streak}d`} />
      </View>
    </View>
  );
}

function LeaderboardRowCard({ rank, row }: { rank: number; row: LeaderboardRow }) {
  const score = formatAvgEffort(row.avg_effort_score);
  return (
    <View
      accessible
      accessibilityLabel={`Rank ${rank}, ${row.fullName}, ${row.completed_count} completed, average effort ${score}`}
      className="flex-row items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
    >
      <View className="flex-1 flex-row items-center gap-3">
        <Text className="w-8 text-center text-sm font-semibold text-slate-600">#{rank}</Text>
        <View className="flex-1">
          <Text numberOfLines={1} className="text-sm font-medium text-slate-900">
            {row.fullName}
          </Text>
          <Text className="text-xs text-slate-600">{row.completed_count} completed</Text>
        </View>
      </View>
      <Text className="text-sm font-semibold text-emerald-700">{score}</Text>
    </View>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-[28%] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <Text className="text-xs text-slate-600">{label}</Text>
      <Text className="text-lg font-bold text-slate-900">{value}</Text>
    </View>
  );
}
