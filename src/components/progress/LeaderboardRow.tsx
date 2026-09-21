import { View } from 'react-native';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import { Card } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { Skeleton } from '../ui/Skeleton';
import { Text } from '../ui/Typography';
import { formatAvgEffort, leaderboardRowLabel, type EffortRow } from './effortRanking';

/** Only the top three get a medal glyph; everyone else gets their number. */
const MEDAL_RANKS = 3;

export type LeaderboardRowProps = { rank: number; row: EffortRow };

/**
 * One member on the effort leaderboard.
 *
 * The rank is a NUMBER in its own column, not a colour and not merely a
 * position: "#2" is written out, the top three also get a crown glyph next to
 * it, and the whole row is one accessible node that says "Rank 2, Bo, 2
 * completed, average effort 7.3/10".
 */
export function LeaderboardRow({ rank, row }: LeaderboardRowProps) {
  const { colors, tokens } = useOptionalTheme();

  return (
    <Card
      testID={`leaderboard-row-${row.member_id}`}
      tone="surface"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: tokens.space.md,
      }}
    >
      <View
        accessible
        accessibilityLabel={leaderboardRowLabel(rank, row)}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: tokens.space.md }}
      >
        <View style={{ minWidth: 40, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          {rank <= MEDAL_RANKS ? (
            <Icon name="crown" size={16} color={colors.brand} />
          ) : null}
          <Text role="bodySmMedium" tone="secondary" tabularNums>
            #{rank}
          </Text>
        </View>

        <View style={{ flex: 1, gap: 2 }}>
          <Text role="labelSm" numberOfLines={1}>
            {row.fullName}
          </Text>
          <Text role="caption" tone="muted">
            {row.completed_count} completed
          </Text>
        </View>

        <Text role="h3" tabularNums>
          {formatAvgEffort(row.avg_effort_score)}
        </Text>
      </View>
    </Card>
  );
}

/** One placeholder row, sized like the real thing. */
export function LeaderboardRowSkeleton() {
  const { tokens } = useOptionalTheme();

  return (
    <Card
      tone="surface"
      style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space.md }}
    >
      <Skeleton width={32} height={16} />
      <View style={{ flex: 1, gap: tokens.space.xs }}>
        <Skeleton width="55%" height={16} />
        <Skeleton width="30%" height={12} />
      </View>
      <Skeleton width={48} height={20} />
    </Card>
  );
}

export function LeaderboardSkeleton({ count = 4 }: { count?: number }) {
  const { tokens } = useOptionalTheme();

  return (
    <View testID="leaderboard-skeleton" style={{ gap: tokens.space.sm }}>
      {Array.from({ length: count }, (_, index) => (
        <LeaderboardRowSkeleton key={index} />
      ))}
    </View>
  );
}
