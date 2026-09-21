import { View } from 'react-native';

import type { RecordingStatus } from '../../services/transcription/types';
import { statusBadge } from '../../features/notes/status';
import { Badge } from '../ui';

/**
 * The pipeline status of one recording.
 *
 * Icon + word, never colour alone (design system §9), and the tone comes from the theme so the
 * chip reads in dark mode too.
 *
 * The wrapper exists only to keep the "Status: Draft" accessible name the screens' tests and a
 * screen reader both rely on — `Badge` names itself after its label and takes no override. An
 * accessible parent flattens its subtree, so the pair is announced once.
 */
export function StatusChip({ status }: { status: RecordingStatus }) {
  const badge = statusBadge(status);
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Status: ${badge.label}`}
      style={{ alignSelf: 'flex-start' }}
    >
      <Badge label={badge.label} tone={badge.tone} icon={badge.icon} testID={`status-chip-${status}`} />
    </View>
  );
}
