import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MilestoneToast } from '../src/components/MilestoneToast';
import { useMilestoneCheck } from '../src/features/milestones/useMilestoneCheck';
import { supabase } from '../src/services/supabase/client';
import { colors } from '../src/theme/tokens';

type CompletionRow = {
  id: string;
  status: 'completed' | 'missed';
  effort_score: number | null;
  completed_at: string;
};

type StatsRow = {
  current_streak: number;
  completed_count: number;
  missed_count: number;
  avg_effort_score: number | null;
};

async function getMemberId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export default function CalendarScreen() {
  const { newlyAchievedTier } = useMilestoneCheck();
  const insets = useSafeAreaInsets();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const toastTier = dismissed ? null : newlyAchievedTier;

  const statsQuery = useQuery({
    queryKey: ['calendar', 'stats'],
    queryFn: async (): Promise<StatsRow | null> => {
      const memberId = await getMemberId();
      if (!memberId) return null;

      const { data, error } = await supabase
        .from('member_workout_stats')
        .select('current_streak, completed_count, missed_count, avg_effort_score')
        .eq('member_id', memberId)
        // Members-only view: staff have no row, which is not an error.
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });

  const historyQuery = useQuery({
    queryKey: ['calendar', 'history'],
    queryFn: async (): Promise<CompletionRow[]> => {
      const memberId = await getMemberId();
      if (!memberId) return [];

      const { data, error } = await supabase
        .from('workout_completions')
        .select('id, status, effort_score, completed_at')
        .eq('member_id', memberId)
        .order('completed_at', { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
  });

  const stats = statsQuery.data;
  const history = historyQuery.data ?? [];
  const hasError = statsQuery.isError || historyQuery.isError;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([statsQuery.refetch(), historyQuery.refetch()]);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <View className="flex-1 bg-white">
      {toastTier && (
        <MilestoneToast tier={toastTier} visible onDismiss={() => setDismissed(true)} />
      )}

      {/* The modal's native header already shows "Calendar", so the body starts with the stats. */}
      <FlatList
        className="flex-1"
        data={history}
        keyExtractor={(row) => row.id}
        contentContainerClassName="gap-2 px-6"
        contentContainerStyle={{
          paddingTop: 16,
          paddingBottom: insets.bottom + 24,
        }}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
        ListHeaderComponent={
          <View className="gap-6 pb-2">
            {hasError ? (
              <View
                accessibilityLiveRegion="polite"
                className="items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4"
              >
                <Text accessibilityRole="alert" className="text-center text-sm text-red-700">
                  Could not load your calendar.
                </Text>
                <Pressable
                  onPress={handleRefresh}
                  accessibilityRole="button"
                  accessibilityLabel="Try again"
                  android_ripple={{ color: '#FECACA' }}
                  className="min-h-[44px] items-center justify-center px-4"
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                >
                  <Text className="text-base font-semibold text-emerald-700">Try again</Text>
                </Pressable>
              </View>
            ) : null}

            {statsQuery.isLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : stats ? (
              <View className="flex-row flex-wrap gap-3">
                <StatTile label="Current streak" value={`${stats.current_streak}d`} />
                <StatTile label="Completed" value={String(stats.completed_count)} />
                <StatTile label="Missed" value={String(stats.missed_count)} />
                <StatTile
                  label="Avg effort"
                  value={
                    stats.avg_effort_score != null
                      ? `${Math.round(stats.avg_effort_score * 10) / 10}/10`
                      : '—'
                  }
                />
              </View>
            ) : null}

            <Text accessibilityRole="header" className="text-lg font-semibold text-slate-900">
              History
            </Text>
          </View>
        }
        ListEmptyComponent={
          historyQuery.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : historyQuery.isError ? null : (
            <Text className="text-sm text-slate-600">No workouts logged yet.</Text>
          )
        }
        renderItem={({ item: row }) => {
          const statusLabel = row.status === 'completed' ? 'Completed' : 'Missed';
          return (
            <View
              accessible
              accessibilityLabel={`${formatDate(row.completed_at)}, ${statusLabel}${
                row.effort_score != null ? `, effort ${row.effort_score} out of 10` : ''
              }`}
              className="flex-row items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <View className="flex-1">
                <Text numberOfLines={1} className="text-sm font-medium text-slate-900">
                  {formatDate(row.completed_at)}
                </Text>
                <Text className="text-xs text-slate-600">{statusLabel}</Text>
              </View>
              {row.effort_score != null && (
                <Text className="text-sm font-semibold text-emerald-700">
                  {row.effort_score}/10
                </Text>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-[45%] flex-1 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <Text className="text-xs text-slate-600">{label}</Text>
      <Text className="text-xl font-bold text-slate-900">{value}</Text>
    </View>
  );
}
