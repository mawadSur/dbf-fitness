import { Pressable, Text, View } from 'react-native';

import { RETRY_COPY, retryReason } from '../../features/notes/status';
import type { RecordingSummary } from '../../features/notes/types';
import { NotesButton } from './NotesButton';
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
  const title = recording.classTitle ?? 'Class recording';
  const date = formatRecordingDate(recording.classStartsAt ?? recording.createdAt);
  // Not just 'failed': a recording whose pipeline hand-off was lost, or whose run was killed
  // mid-transcription, is equally stuck and equally fixed by re-running the function.
  const reason = retryReason(recording);

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: '#E2E8F0',
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Open ${title}`}
        android_ripple={{ color: '#E2E8F0' }}
        style={({ pressed }) => ({
          minHeight: 64,
          padding: 16,
          gap: 6,
          opacity: pressed ? 0.75 : 1,
        })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, fontWeight: '600', color: '#0F172A' }}>
            {title}
          </Text>
          {showStatus ? <StatusChip status={recording.status} /> : null}
        </View>
        {date ? <Text style={{ fontSize: 13, color: '#475569' }}>{date}</Text> : null}
        {showStatus && reason ? (
          <Text numberOfLines={2} style={{ fontSize: 13, color: '#B91C1C' }}>
            {(reason === 'failed' ? recording.errorMessage : null) ?? RETRY_COPY[reason].explanation}
          </Text>
        ) : null}
      </Pressable>
      {onRetry && reason ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
          <NotesButton
            label={RETRY_COPY[reason].label}
            variant="secondary"
            busy={retrying}
            onPress={onRetry}
            accessibilityLabel={`Retry ${title}`}
          />
        </View>
      ) : null}
    </View>
  );
}
