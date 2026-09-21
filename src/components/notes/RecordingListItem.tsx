import { View } from 'react-native';

import { RETRY_COPY, retryReason } from '../../features/notes/status';
import type { RecordingSummary } from '../../features/notes/types';
import { useOptionalTheme } from '../../theme/ThemeProvider';
import { Button, Card, Icon, PressableBase, Text } from '../ui';
import { StatusChip } from './StatusChip';

export function formatRecordingDate(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

type Props = {
  recording: RecordingSummary;
  showStatus: boolean;
  onPress: () => void;
  onRetry?: () => void;
  retrying?: boolean;
};

export function RecordingListItem({ recording, showStatus, onPress, onRetry, retrying = false }: Props) {
  const { colors } = useOptionalTheme();
  const title = recording.classTitle ?? 'Class recording';
  const date = formatRecordingDate(recording.classStartsAt ?? recording.createdAt);
  // Not just 'failed': a recording whose pipeline hand-off was lost, or whose run was killed
  // mid-transcription, is equally stuck and equally fixed by re-running the function.
  const reason = retryReason(recording);

  return (
    <Card padding={16}>
      <View style={{ gap: 12 }}>
        <PressableBase
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`Open ${title}`}
          android_ripple={{ color: colors.bgSoft }}
          pressFeedback={0.75}
          // Layout NEVER goes in a style callback — see `PressableBase`.
          style={{ minHeight: 44, gap: 6, justifyContent: 'center' }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text role="label" numberOfLines={2} style={{ flex: 1 }}>
              {title}
            </Text>
            <Icon name="chevron-right" size={20} color={colors.textMuted} />
          </View>
          {date ? (
            <Text role="bodySm" tone="muted">
              {date}
            </Text>
          ) : null}
          {showStatus ? <StatusChip status={recording.status} /> : null}
          {showStatus && reason ? (
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
              <Icon name="alert-triangle" size={16} color={colors.danger} />
              <Text role="bodySm" tone="danger" numberOfLines={3} style={{ flex: 1 }}>
                {(reason === 'failed' ? recording.errorMessage : null) ?? RETRY_COPY[reason].explanation}
              </Text>
            </View>
          ) : null}
        </PressableBase>
        {onRetry && reason ? (
          <Button
            label={RETRY_COPY[reason].label}
            variant="secondary"
            loading={retrying}
            onPress={onRetry}
            accessibilityLabel={`Retry ${title}`}
            fullWidth
          />
        ) : null}
      </View>
    </Card>
  );
}
