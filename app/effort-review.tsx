import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '../src/services/supabase/client';
import { friendlyErrorMessage } from '../src/components/friendlyError';
import { colors } from '../src/theme/tokens';

const SCORE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

type AccessInfo = {
  userId: string;
  role: string;
} | null;

type CompletionRow = {
  id: string;
  member_id: string;
  workout_day_id: string;
  effort_score: number | null;
  completed_at: string;
};

type ReviewRow = CompletionRow & {
  memberName: string;
  dayLabel: string;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

async function fetchAccess(): Promise<AccessInfo> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) return null;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  if (error) throw error;

  return { userId, role: profile.role as string };
}

async function fetchCompletionsForReview(): Promise<ReviewRow[]> {
  const { data: completions, error } = await supabase
    .from('workout_completions')
    .select('id, member_id, workout_day_id, effort_score, completed_at')
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(50);
  if (error) throw error;

  const completionRows = (completions ?? []) as CompletionRow[];
  if (completionRows.length === 0) return [];

  const memberIds = [...new Set(completionRows.map((row) => row.member_id))];
  const dayIds = [...new Set(completionRows.map((row) => row.workout_day_id))];

  const [profilesResult, daysResult] = await Promise.all([
    supabase.from('profiles').select('id, full_name').in('id', memberIds),
    supabase.from('workout_days').select('id, day_number, block_name').in('id', dayIds),
  ]);
  if (profilesResult.error) throw profilesResult.error;
  if (daysResult.error) throw daysResult.error;

  const nameById = new Map(
    (profilesResult.data ?? []).map((profile) => [profile.id, profile.full_name as string])
  );
  const dayById = new Map(
    (daysResult.data ?? []).map((day) => [
      day.id,
      `Day ${day.day_number} · ${day.block_name}` as string,
    ])
  );

  return completionRows.map((row) => ({
    ...row,
    memberName: nameById.get(row.member_id) ?? 'Unknown member',
    dayLabel: dayById.get(row.workout_day_id) ?? 'Workout',
  }));
}

export default function EffortReviewScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const accessQuery = useQuery({
    queryKey: ['effort', 'review', 'access'],
    queryFn: fetchAccess,
  });

  const coachId = accessQuery.data?.userId ?? null;
  const isCoach = accessQuery.data?.role === 'coach';

  const completionsQuery = useQuery({
    queryKey: ['effort', 'review', coachId],
    queryFn: fetchCompletionsForReview,
    enabled: isCoach,
  });

  const scoreMutation = useMutation({
    mutationFn: async ({
      completionId,
      effortScore,
    }: {
      completionId: string;
      effortScore: number;
    }) => {
      if (!coachId) throw new Error('Not signed in.');

      const { error } = await supabase
        .from('workout_completions')
        .update({ effort_score: effortScore, scored_by: coachId })
        .eq('id', completionId);
      if (error) throw error;
    },
    onSuccess: () => {
      // Effort review lists and the leaderboard/calendar stats all derive from
      // workout_completions, so refresh everything downstream of a score change.
      queryClient.invalidateQueries({ queryKey: ['effort'] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
    },
  });

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await (isCoach ? completionsQuery.refetch() : accessQuery.refetch());
    } finally {
      setIsRefreshing(false);
    }
  };

  if (accessQuery.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (accessQuery.isError) {
    return (
      <View className="flex-1 bg-white px-6" style={{ paddingTop: insets.top + 8 }}>
        <BackLink onPress={goBack} />
        <View className="flex-1 items-center justify-center gap-2">
          <Text accessibilityRole="alert" className="text-center text-base text-red-700">
            {friendlyErrorMessage(accessQuery.error, 'Could not check your access.')}
          </Text>
          <RetryButton onPress={() => accessQuery.refetch()} />
        </View>
      </View>
    );
  }

  if (!isCoach) {
    return (
      <View className="flex-1 bg-white px-6" style={{ paddingTop: insets.top + 8 }}>
        <BackLink onPress={goBack} />
        <View className="flex-1 items-center justify-center gap-4">
          <Text className="text-center text-base text-slate-600">
            This screen is only available to coaches.
          </Text>
        </View>
      </View>
    );
  }

  const rows = completionsQuery.data ?? [];

  return (
    <FlatList
      className="flex-1 bg-white"
      data={completionsQuery.isLoading || completionsQuery.isError ? [] : rows}
      keyExtractor={(row) => row.id}
      contentContainerClassName="gap-3 px-6"
      contentContainerStyle={{
        paddingTop: insets.top + 8,
        paddingBottom: insets.bottom + 24,
      }}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
      ListHeaderComponent={
        <View className="gap-4 pb-1">
          <BackLink onPress={goBack} />
          <Text accessibilityRole="header" className="text-2xl font-bold text-slate-900">
            Effort Review
          </Text>
        </View>
      }
      ListEmptyComponent={
        completionsQuery.isLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : completionsQuery.isError ? (
          <View className="items-center gap-2">
            <Text accessibilityRole="alert" className="text-center text-sm text-red-700">
              {friendlyErrorMessage(completionsQuery.error, 'Could not load completions.')}
            </Text>
            <RetryButton onPress={() => completionsQuery.refetch()} />
          </View>
        ) : (
          <Text className="text-sm text-slate-600">No completed workouts to review yet.</Text>
        )
      }
      ListFooterComponent={
        scoreMutation.isError ? (
          <Text
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            className="pt-3 text-center text-sm text-red-700"
          >
            {friendlyErrorMessage(scoreMutation.error, 'Could not save that score.')}
          </Text>
        ) : null
      }
      renderItem={({ item: row }) => (
        <CompletionCard
          row={row}
          isSaving={scoreMutation.isPending && scoreMutation.variables?.completionId === row.id}
          onSelectScore={(effortScore) =>
            scoreMutation.mutate({ completionId: row.id, effortScore })
          }
        />
      )}
    />
  );
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

function RetryButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Try again"
      android_ripple={{ color: colors.primaryMuted }}
      className="min-h-[44px] items-center justify-center px-4"
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <Text className="text-base font-semibold text-emerald-700">Try again</Text>
    </Pressable>
  );
}

function CompletionCard({
  row,
  isSaving,
  onSelectScore,
}: {
  row: ReviewRow;
  isSaving: boolean;
  onSelectScore: (effortScore: number) => void;
}) {
  return (
    <View className="gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1">
          <Text numberOfLines={1} className="text-sm font-medium text-slate-900">
            {row.memberName}
          </Text>
          <Text numberOfLines={2} className="text-xs text-slate-600">
            {row.dayLabel} · {formatDate(row.completed_at)}
          </Text>
        </View>
        <Text className="text-sm font-semibold text-emerald-700">
          {row.effort_score != null ? `${row.effort_score}/10` : 'Not scored'}
        </Text>
      </View>

      <View className="flex-row flex-wrap gap-2">
        {SCORE_OPTIONS.map((option) => {
          const isSelected = row.effort_score === option;
          return (
            <Pressable
              key={option}
              disabled={isSaving}
              onPress={() => onSelectScore(option)}
              accessibilityRole="button"
              accessibilityLabel={`Score ${row.memberName} ${option} out of 10`}
              accessibilityState={{ selected: isSelected, disabled: isSaving }}
              android_ripple={{ color: colors.primaryMuted, borderless: true }}
              className={`h-11 w-11 items-center justify-center rounded-full ${
                isSelected ? 'bg-emerald-700' : 'border border-slate-300 bg-white'
              } ${isSaving ? 'opacity-50' : ''}`}
            >
              <Text
                className={`text-sm font-semibold ${isSelected ? 'text-white' : 'text-slate-700'}`}
              >
                {option}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {isSaving ? (
        <Text accessibilityLiveRegion="polite" className="text-xs text-slate-600">
          Saving…
        </Text>
      ) : null}
    </View>
  );
}
