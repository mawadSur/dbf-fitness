import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';

import { friendlyErrorMessage } from '../src/components/friendlyError';
import { ErrorBlock } from '../src/components/progress/ErrorBlock';
import {
  ReviewCard,
  ReviewListSkeleton,
  type ReviewRow,
} from '../src/components/progress/ReviewCard';
import { useDelayedVisible } from '../src/components/ui/useDelayedVisible';
import { Banner } from '../src/components/ui/Banner';
import { EmptyState } from '../src/components/ui/EmptyState';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { ScreenShell } from '../src/components/ui/ScreenShell';
import { supabase } from '../src/services/supabase/client';
import { useOptionalTheme } from '../src/theme/ThemeProvider';

/** Unchanged: the newest 50 completions are what a coach reviews in one sitting. */
const REVIEW_LIMIT = 50;

type AccessInfo = { userId: string; role: string } | null;

type CompletionRow = {
  id: string;
  member_id: string;
  workout_day_id: string;
  effort_score: number | null;
  completed_at: string;
};

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
    .limit(REVIEW_LIMIT);
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
    (profilesResult.data ?? []).map((profile) => [profile.id, profile.full_name as string]),
  );
  const dayById = new Map(
    (daysResult.data ?? []).map((day) => [day.id, `Day ${day.day_number} · ${day.block_name}`]),
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
  const { tokens } = useOptionalTheme();
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

  const showAccessSkeleton = useDelayedVisible(accessQuery.isLoading);
  const showListSkeleton = useDelayedVisible(completionsQuery.isLoading);
  const savingId = scoreMutation.isPending ? scoreMutation.variables?.completionId : undefined;

  const renderItem = useCallback(
    ({ item }: { item: ReviewRow }) => (
      <ReviewCard
        row={item}
        isSaving={savingId === item.id}
        onSelectScore={(effortScore) =>
          scoreMutation.mutate({ completionId: item.id, effortScore })
        }
      />
    ),
    [savingId, scoreMutation],
  );

  const header = <ScreenHeader eyebrow="Coaching" title="Effort review" onBack={goBack} />;

  if (accessQuery.isLoading || accessQuery.isError || !isCoach) {
    return (
      <ScreenShell testID="effort-review" header={header} contentStyle={{ gap: tokens.space.lg }}>
        {accessQuery.isError ? (
          <ErrorBlock
            message={friendlyErrorMessage(accessQuery.error, 'Could not check your access.')}
            onRetry={() => accessQuery.refetch()}
          />
        ) : accessQuery.isLoading ? (
          showAccessSkeleton ? (
            <ReviewListSkeleton count={2} />
          ) : null
        ) : (
          // No second "Go back" here: the header already owns that action, and two
          // controls with the same name is one ambiguous target for a screen reader.
          <EmptyState
            icon="lock"
            title="Coaches only"
            message="This screen is only available to coaches."
            actionLabel="Go to your workouts"
            onAction={() => router.replace('/workout')}
          />
        )}
      </ScreenShell>
    );
  }

  const rows = completionsQuery.data ?? [];

  return (
    <ScreenShell testID="effort-review" scroll={false} header={header}>
      <FlatList
        testID="effort-review-list"
        data={completionsQuery.isLoading || completionsQuery.isError ? [] : rows}
        keyExtractor={(row) => row.id}
        renderItem={renderItem}
        contentContainerStyle={{ gap: tokens.space.md, paddingBottom: tokens.space.xl }}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
        ListHeaderComponent={
          scoreMutation.isError ? (
            <View style={{ paddingBottom: tokens.space.md }}>
              <Banner
                tone="danger"
                title={friendlyErrorMessage(scoreMutation.error, 'Could not save that score.')}
                message="The score was not saved. Tap a number to try again."
              />
            </View>
          ) : null
        }
        ListEmptyComponent={
          completionsQuery.isError ? (
            <ErrorBlock
              message={friendlyErrorMessage(completionsQuery.error, 'Could not load completions.')}
              onRetry={() => completionsQuery.refetch()}
            />
          ) : completionsQuery.isLoading ? (
            showListSkeleton ? (
              <ReviewListSkeleton />
            ) : null
          ) : (
            <EmptyState
              icon="clock"
              title="Nothing to review yet"
              message="Completed workouts show up here as soon as your members log them."
            />
          )
        }
      />
    </ScreenShell>
  );
}
