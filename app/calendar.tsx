import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { friendlyErrorFromMany } from '../src/components/friendlyError';
import { MilestoneToast } from '../src/components/MilestoneToast';
import { DayDetailCard } from '../src/components/progress/DayDetailCard';
import { ErrorBlock } from '../src/components/progress/ErrorBlock';
import { MonthGrid } from '../src/components/progress/MonthGrid';
import { MonthGridSkeleton } from '../src/components/progress/MonthGridSkeleton';
import {
  addMonths,
  buildMonthCells,
  compareMonths,
  countCompletedInMonth,
  groupByUtcDay,
  monthKeyOf,
  monthRange,
  monthSummary,
  utcDateKey,
  type DayCompletion,
} from '../src/components/progress/monthMath';
import { StatTiles, StatTilesSkeleton } from '../src/components/progress/StatTiles';
import { useDelayedVisible } from '../src/components/ui/useDelayedVisible';
import { EmptyState } from '../src/components/ui/EmptyState';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { ScreenShell } from '../src/components/ui/ScreenShell';
import { useMilestoneCheck } from '../src/features/milestones/useMilestoneCheck';
import { supabase } from '../src/services/supabase/client';
import { useOptionalTheme } from '../src/theme/ThemeProvider';

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

function formatAvgEffort(score: number | null): string {
  return score != null ? `${Math.round(score * 10) / 10}/10` : '—';
}

export default function CalendarScreen() {
  const router = useRouter();
  const { newlyAchievedTier } = useMilestoneCheck();
  const { tokens } = useOptionalTheme();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
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
    queryFn: async (): Promise<DayCompletion[]> => {
      const memberId = await getMemberId();
      if (!memberId) return [];

      const { data, error } = await supabase
        .from('workout_completions')
        .select('id, status, effort_score, completed_at')
        .eq('member_id', memberId)
        .order('completed_at', { ascending: false });

      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id as string,
        status: row.status as DayCompletion['status'],
        effortScore: (row.effort_score as number | null) ?? null,
        completedAt: row.completed_at as string,
      }));
    },
  });

  const stats = statsQuery.data;
  const hasError = statsQuery.isError || historyQuery.isError;
  const showStatsSkeleton = useDelayedVisible(statsQuery.isLoading);
  const showGridSkeleton = useDelayedVisible(historyQuery.isLoading);

  // Today and the current month are read off the UTC clock the server keys
  // completions by, so the ringed cell cannot disagree with "Logged for today"
  // on the workout screen. `monthOffset` (not a month key) is the state, so the
  // grid follows the clock across midnight without a re-seed.
  const { byDay, cells, month, range, currentMonth } = useMemo(() => {
    const now = new Date();
    const today = utcDateKey(now);
    const current = monthKeyOf(now);
    const grouped = groupByUtcDay(historyQuery.data ?? []);
    const viewed = addMonths(current, monthOffset);
    return {
      byDay: grouped,
      cells: buildMonthCells(viewed, grouped, today),
      month: viewed,
      range: monthRange([...grouped.keys()], current),
      currentMonth: current,
    };
  }, [historyQuery.data, monthOffset]);

  const selectedCell = selectedDateKey
    ? (cells.find((cell) => cell?.dateKey === selectedDateKey) ?? null)
    : null;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([statsQuery.refetch(), historyQuery.refetch()]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const step = (delta: number) => {
    setMonthOffset((offset) => offset + delta);
    setSelectedDateKey(null);
  };

  const tiles = [
    ...(stats
      ? [
          { label: 'Current streak', value: `${stats.current_streak}d` },
          { label: 'Completed', value: String(stats.completed_count) },
        ]
      : []),
    // "Missed" is gone on purpose: nothing ever writes a missed row, so the tile
    // always said 0 and read as "you have never skipped a day".
    { label: 'This month', value: String(countCompletedInMonth(byDay, currentMonth)) },
    ...(stats ? [{ label: 'Avg effort', value: formatAvgEffort(stats.avg_effort_score) }] : []),
  ];

  return (
    <View style={{ flex: 1 }}>
      <ScreenShell
        testID="calendar"
        refreshing={isRefreshing}
        onRefresh={handleRefresh}
        contentStyle={{ paddingTop: tokens.space.lg, gap: tokens.space.xl }}
        // The route is a modal with NO native header (`app/_layout.tsx`), so the
        // shell pays the status-bar inset exactly once and the brand header
        // below is the screen's only chrome — same as Effort, Notes and Coach.
        header={<ScreenHeader eyebrow="Progress" title="Calendar" onBack={goBack} />}
      >
        {hasError ? (
          <ErrorBlock
            message={friendlyErrorFromMany(
              [statsQuery.error, historyQuery.error],
              'Could not load your calendar.',
            )}
            onRetry={handleRefresh}
          />
        ) : null}

        {statsQuery.isLoading ? (
          showStatsSkeleton ? (
            <StatTilesSkeleton />
          ) : null
        ) : (
          <StatTiles tiles={tiles} />
        )}

        {historyQuery.isLoading ? (
          showGridSkeleton ? (
            <MonthGridSkeleton />
          ) : null
        ) : (
          <MonthGrid
            month={month}
            cells={cells}
            summary={monthSummary(countCompletedInMonth(byDay, month), month)}
            selectedDateKey={selectedDateKey}
            canGoPrev={compareMonths(month, range.first) > 0}
            canGoNext={compareMonths(month, range.last) < 0}
            onPrev={() => step(-1)}
            onNext={() => step(1)}
            onSelectDay={(cell) =>
              setSelectedDateKey((current) => (current === cell.dateKey ? null : cell.dateKey))
            }
          />
        )}

        {selectedCell ? (
          <DayDetailCard cell={selectedCell} onClose={() => setSelectedDateKey(null)} />
        ) : historyQuery.isSuccess && byDay.size === 0 ? (
          <EmptyState
            icon="calendar"
            title="No workouts logged yet"
            message="Finish a workout and its day fills in on the grid."
            actionLabel="Go to your workouts"
            onAction={() => router.replace('/workout')}
          />
        ) : null}
      </ScreenShell>

      {toastTier ? (
        <MilestoneToast tier={toastTier} visible onDismiss={() => setDismissed(true)} />
      ) : null}
    </View>
  );
}
