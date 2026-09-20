import { Text, View } from 'react-native';

import type { RecordingStatus } from '../../services/transcription/types';
import { statusUi, TONE_COLORS } from '../../features/notes/status';

export function StatusChip({ status }: { status: RecordingStatus }) {
  const ui = statusUi(status);
  const palette = TONE_COLORS[ui.tone];
  return (
    <View
      accessible
      accessibilityLabel={`Status: ${ui.label}`}
      style={{
        alignSelf: 'flex-start',
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
        backgroundColor: palette.background,
      }}
    >
      <Text style={{ color: palette.text, fontSize: 12, fontWeight: '700' }}>{ui.label}</Text>
    </View>
  );
}
