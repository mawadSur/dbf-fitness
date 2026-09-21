import { View } from 'react-native';

import { isInFlight } from '../../features/notes/status';
import type { RecordingDetail } from '../../features/notes/types';
import { EmptyState } from '../ui';
import { DraftEditor } from './DraftEditor';
import { MemberChecklist } from './MemberChecklist';
import { FailedPanel, ProgressPanel } from './RecordingStatusPanels';
import { StatusChip } from './StatusChip';

type Props = {
  recording: RecordingDetail;
  onRefetch: () => void;
};

/** Coach view of one recording, chosen by the status the database reports. */
export function CoachRecordingView({ recording, onRefetch }: Props) {
  if (isInFlight(recording.status)) return <ProgressPanel recording={recording} onRefetch={onRefetch} />;
  if (recording.status === 'failed') return <FailedPanel recording={recording} onRefetch={onRefetch} />;
  if (recording.status === 'draft') return <DraftEditor recording={recording} onRefetch={onRefetch} />;

  // published: read-only.
  return recording.checklist ? (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <StatusChip status="published" />
      </View>
      <MemberChecklist
        readOnly
        checklist={recording.checklist}
        checkedKeys={new Set()}
        onToggle={() => undefined}
      />
    </View>
  ) : (
    <View style={{ padding: 16, gap: 12 }}>
      <StatusChip status="published" />
      <EmptyState
        icon="file-text"
        title="This note has no checklist content"
        message="Nothing was drafted from this recording, so there is nothing for your members to do."
      />
    </View>
  );
}
