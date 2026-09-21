import { ActivityIndicator, View } from 'react-native';

import { RETRY_COPY, retryReason, statusUi } from '../../features/notes/status';
import type { RecordingDetail } from '../../features/notes/types';
import { useOptionalTheme } from '../../theme/ThemeProvider';
import { Banner, Card, Heading, Text } from '../ui';
import { RetryControl } from './RetryControl';
import { StatusChip } from './StatusChip';

type Props = {
  recording: RecordingDetail;
  onRefetch: () => void;
};

/**
 * A recording the pipeline still has in hand (uploading / transcribing / drafting).
 *
 * The spinner is the one place a bare `ActivityIndicator` belongs: nothing is on screen to skeleton
 * — the work is happening on a server, and the panel says in words what stage it is at, so the
 * spinner is decoration on top of text rather than the message itself. `accessibilityLiveRegion`
 * announces each stage change without the coach having to re-read the screen.
 */
export function ProgressPanel({ recording, onRefetch }: Props) {
  const { colors } = useOptionalTheme();
  const ui = statusUi(recording.status);
  const stalled = retryReason(recording);

  return (
    <View style={{ padding: 16, gap: 12 }}>
      <StatusChip status={recording.status} />
      <Card tone="soft" padding={24}>
        <View accessibilityLiveRegion="polite" style={{ gap: 12, alignItems: 'center' }}>
          {stalled ? null : (
            <ActivityIndicator
              color={colors.brand}
              size="large"
              accessibilityLabel={`${ui.label}, in progress`}
            />
          )}
          <Heading level={2} align="center">
            {ui.label}
          </Heading>
          <Text role="body" tone="secondary" align="center">
            {ui.description}
          </Text>
          {stalled === 'upload_incomplete' ? null : (
            <Text role="caption" tone="muted" align="center">
              This page updates on its own. You can leave and come back.
            </Text>
          )}
        </View>
      </Card>
      {stalled ? (
        <View style={{ gap: 8 }}>
          <Banner tone="warning" title="This one is stuck" message={RETRY_COPY[stalled].explanation} />
          <RetryControl
            recordingId={recording.id}
            liveClassId={recording.liveClassId}
            reason={stalled}
            onRefetch={onRefetch}
          />
        </View>
      ) : null}
    </View>
  );
}

/** A recording whose transcription failed outright. */
export function FailedPanel({ recording, onRefetch }: Props) {
  return (
    <View style={{ padding: 16, gap: 12 }}>
      <StatusChip status="failed" />
      <Heading level={2}>{statusUi('failed').description}</Heading>
      {recording.errorMessage ? (
        <Banner tone="danger" title="What went wrong" message={recording.errorMessage} />
      ) : null}
      <RetryControl
        recordingId={recording.id}
        liveClassId={recording.liveClassId}
        reason="failed"
        onRefetch={onRefetch}
      />
    </View>
  );
}
