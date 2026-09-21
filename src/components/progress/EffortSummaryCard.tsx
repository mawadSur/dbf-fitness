import { View } from 'react-native';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import { Card } from '../ui/Card';
import { ProgressRing } from '../ui/ProgressRing';
import { Skeleton } from '../ui/Skeleton';
import { Text } from '../ui/Typography';
import { avgEffortValue, type EffortRow } from './effortRanking';
import { StatTiles } from './StatTiles';

export const EFFORT_MAX = 10;

/**
 * "Your effort": one ring for the average, the other two numbers underneath.
 *
 * The ring carries the headline because average effort is a share of a fixed
 * maximum (out of 10) — the one shape that says "how far along" without reading
 * the number. The number is written out inside it and repeated in the ring's
 * accessible name, so nothing depends on seeing the arc; it is deliberately NOT
 * repeated a third time in a tile.
 *
 * Until a coach has scored anything there is NO ring. A ring drawn at zero is
 * a measurement — "0 of 10" beside the words "No effort score yet" claimed the
 * member had been scored and had scored nothing, which is the opposite of the
 * truth. Absence of data gets the shape of absence: a dash where the number
 * goes, no arc, no denominator.
 */
export function EffortSummaryCard({ row }: { row: EffortRow }) {
  const { tokens } = useOptionalTheme();
  const scored = row.avg_effort_score != null;

  return (
    <Card testID="effort-summary" tone="soft" padding={24} style={{ gap: tokens.space.lg }}>
      <View style={{ alignItems: 'center', gap: tokens.space.sm }}>
        {scored ? (
          <ProgressRing
            testID="effort-ring"
            value={avgEffortValue(row.avg_effort_score)}
            max={EFFORT_MAX}
            label="Average effort"
            valueCaption={`of ${EFFORT_MAX}`}
            size={132}
          />
        ) : (
          <View
            testID="effort-unscored"
            accessible
            accessibilityRole="text"
            accessibilityLabel="Average effort: not scored yet"
            style={{ alignItems: 'center', gap: tokens.space.xs, paddingVertical: tokens.space.md }}
          >
            {/* The dash is the value, so it is sized like one; the word beside
                it carries the meaning, because a dash alone is not a status. */}
            <Text role="display" tone="muted" align="center" accessibilityRole="none">
              —
            </Text>
            <Text role="bodySmMedium" tone="secondary" align="center">
              No effort score yet
            </Text>
          </View>
        )}
        <Text role="caption" tone="muted" align="center">
          {scored
            ? 'Your coach scores the effort each workout took.'
            : 'Your coach scores the effort once you finish a workout.'}
        </Text>
      </View>

      <StatTiles
        testID="effort-stats"
        tiles={[
          { label: 'Completed', value: String(row.completed_count) },
          { label: 'Current streak', value: `${row.current_streak}d` },
        ]}
      />
    </Card>
  );
}

/** The card's footprint while it loads, so the page does not jump (§8). */
export function EffortSummarySkeleton() {
  const { tokens } = useOptionalTheme();

  return (
    <Card testID="effort-summary-skeleton" tone="soft" padding={24} style={{ gap: tokens.space.lg }}>
      <View style={{ alignItems: 'center', gap: tokens.space.sm }}>
        <Skeleton width={132} height={132} radius={66} />
        <Skeleton width="60%" height={16} />
      </View>
      <View style={{ flexDirection: 'row', gap: tokens.space.md }}>
        <Skeleton width="45%" height={64} radius={tokens.radii.md} />
        <Skeleton width="45%" height={64} radius={tokens.radii.md} />
      </View>
    </Card>
  );
}
