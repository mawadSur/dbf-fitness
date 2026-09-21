import { View } from 'react-native';

import { RETRY_COPY, retryReason, statusUi } from '../../features/notes/status';
import type { RecordingDetail } from '../../features/notes/types';
import { useOptionalTheme } from '../../theme/ThemeProvider';
import { Banner, Card, Heading, Icon, Skeleton, Text } from '../ui';
import { pipelineProgressLabel, pipelineSteps, type PipelineStep } from './pipelineSteps';
import { RetryControl } from './RetryControl';
import { StatusChip } from './StatusChip';

type Props = {
  recording: RecordingDetail;
  onRefetch: () => void;
};

/** One pipeline stage: a state icon, the stage name, and its state as a WORD. */
function StepRow({ step }: { step: PipelineStep }) {
  const { colors } = useOptionalTheme();
  const tone =
    step.state === 'done' ? colors.success : step.state === 'active' ? colors.brand : colors.textMuted;
  const icon = step.state === 'done' ? 'check-circle' : step.state === 'active' ? 'clock' : 'minus';
  const word = step.state === 'done' ? 'Done' : step.state === 'active' ? 'In progress' : 'Waiting';

  return (
    <View
      testID={`pipeline-step-${step.key}`}
      accessibilityRole="text"
      // Status never by colour alone (design system §4): icon + word + name.
      accessibilityLabel={`${step.label}: ${word}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
    >
      <Icon name={icon} size={16} color={tone} />
      <Text role="bodySm" style={{ flex: 1 }} numberOfLines={2}>
        {step.label}
      </Text>
      <Text role="caption" tone={step.state === 'pending' ? 'muted' : 'secondary'}>
        {word}
      </Text>
    </View>
  );
}

/**
 * A recording the pipeline still has in hand (uploading / transcribing / drafting).
 *
 * This used to be a bare activity spinner: it says "something is happening" and nothing
 * more, while the pipeline can sit in one stage for minutes. Instead the panel NAMES the three
 * stages and marks where the work is, and a `Skeleton` reserves the shape of the checklist that is
 * coming, so the screen does not jump when it arrives (design system §2, §8).
 * `accessibilityLiveRegion` announces each stage change without the coach re-reading the screen.
 */
export function ProgressPanel({ recording, onRefetch }: Props) {
  const ui = statusUi(recording.status);
  const stalled = retryReason(recording);
  const steps = pipelineSteps(recording.status, !!stalled);

  return (
    <View style={{ padding: 16, gap: 12 }}>
      <StatusChip status={recording.status} />
      <Card tone="soft" padding={24}>
        <View
          accessibilityLiveRegion="polite"
          accessibilityLabel={stalled ? undefined : pipelineProgressLabel(recording.status)}
          style={{ gap: 12 }}
        >
          <Heading level={2}>{ui.label}</Heading>
          <Text role="body" tone="secondary">
            {ui.description}
          </Text>

          <View testID="pipeline-steps" style={{ gap: 8 }}>
            {steps.map((step) => (
              <StepRow key={step.key} step={step} />
            ))}
          </View>

          {stalled ? null : (
            // The checklist that is being written, in outline, so its arrival
            // is a fill-in rather than a jump.
            <View testID="pipeline-skeleton" style={{ gap: 8, marginTop: 4 }}>
              <Skeleton width="70%" height={16} />
              <Skeleton width="90%" height={16} />
              <Skeleton width="55%" height={16} />
            </View>
          )}

          {stalled === 'upload_incomplete' ? null : (
            <Text role="caption" tone="muted">
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
