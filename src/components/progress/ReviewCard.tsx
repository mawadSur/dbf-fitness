import { View } from 'react-native';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';
import { Text } from '../ui/Typography';
import { ScorePicker } from './ScorePicker';

export type ReviewRow = {
  id: string;
  member_id: string;
  workout_day_id: string;
  effort_score: number | null;
  completed_at: string;
  memberName: string;
  dayLabel: string;
};

export function formatReviewDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export type ReviewCardProps = {
  row: ReviewRow;
  /** True while THIS row's score is being written — the others stay usable. */
  isSaving: boolean;
  onSelectScore: (score: number) => void;
};

/**
 * One completion waiting for an effort score.
 *
 * The scored/unscored state is a `Badge` (icon + word), so it never rests on
 * colour, and "Saving…" is announced from a live region on the row itself
 * rather than at the bottom of the list, where a coach would not see it.
 */
export function ReviewCard({ row, isSaving, onSelectScore }: ReviewCardProps) {
  const { tokens } = useOptionalTheme();
  const scored = row.effort_score != null;

  return (
    <Card testID={`review-${row.id}`} tone="soft" style={{ gap: tokens.space.md }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: tokens.space.md,
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text role="labelSm" numberOfLines={1}>
            {row.memberName}
          </Text>
          <Text role="caption" tone="muted" numberOfLines={2}>
            {row.dayLabel} · {formatReviewDate(row.completed_at)}
          </Text>
        </View>
        <Badge
          label={scored ? `${row.effort_score}/10` : 'Not scored'}
          tone={scored ? 'success' : 'neutral'}
          icon={scored ? 'check-circle' : 'clock'}
        />
      </View>

      <ScorePicker
        value={row.effort_score}
        subjectName={row.memberName}
        disabled={isSaving}
        onSelect={onSelectScore}
      />

      {isSaving ? (
        // The live region has to be the View: the ui `Text` deliberately exposes
        // no live-region prop, so progress is announced from its wrapper.
        <View
          testID={`review-saving-${row.id}`}
          accessible
          accessibilityLiveRegion="polite"
          accessibilityLabel={`Saving ${row.memberName}'s score`}
        >
          <Text role="caption" tone="secondary">
            Saving…
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

export function ReviewCardSkeleton() {
  const { tokens } = useOptionalTheme();

  return (
    <Card tone="soft" style={{ gap: tokens.space.md }}>
      <View style={{ gap: tokens.space.xs }}>
        <Skeleton width="45%" height={16} />
        <Skeleton width="65%" height={12} />
      </View>
      {/* Same two-rows-of-five footprint as the real picker, so the card does
          not resize when the completions arrive (§8). */}
      <View style={{ gap: tokens.space.sm }}>
        {[0, 1].map((rowIndex) => (
          <View key={rowIndex} style={{ flexDirection: 'row', gap: tokens.space.sm }}>
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton
                key={index}
                height={44}
                radius={tokens.radii.md}
                style={{ flex: 1 }}
              />
            ))}
          </View>
        ))}
      </View>
    </Card>
  );
}

export function ReviewListSkeleton({ count = 3 }: { count?: number }) {
  const { tokens } = useOptionalTheme();

  return (
    <View testID="review-list-skeleton" style={{ gap: tokens.space.md }}>
      {Array.from({ length: count }, (_, index) => (
        <ReviewCardSkeleton key={index} />
      ))}
    </View>
  );
}
