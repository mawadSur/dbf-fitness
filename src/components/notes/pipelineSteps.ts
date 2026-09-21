import type { RecordingStatus } from '../../services/transcription/types';

/**
 * The three stages a recording passes through, for the in-flight detail panel.
 *
 * A spinner says "something is happening"; it does not say WHICH of the three
 * server stages is happening, and the pipeline can sit in one of them for
 * minutes. Naming the stages turns a wait with no information into a wait with
 * a position in it, and gives the screen reader something to announce when the
 * stage changes (`accessibilityLiveRegion` on the panel).
 */
export type PipelineStepState = 'done' | 'active' | 'pending';

export type PipelineStep = {
  key: 'upload' | 'transcribe' | 'draft';
  label: string;
  state: PipelineStepState;
};

const ORDER: { key: PipelineStep['key']; label: string }[] = [
  { key: 'upload', label: 'Upload recording' },
  { key: 'transcribe', label: 'Transcribe audio' },
  { key: 'draft', label: 'Draft the checklist' },
];

/** Which stage each status sits at: the index of the stage still in progress. */
const ACTIVE_INDEX: Record<RecordingStatus, number> = {
  uploading: 0,
  transcribing: 1,
  // A draft (or published) recording has finished every stage; the panel that
  // uses these steps is only shown while in flight, but a complete answer here
  // keeps the function total and testable.
  draft: ORDER.length,
  published: ORDER.length,
  failed: 1,
};

/**
 * The pipeline as steps, oldest first.
 *
 * `stalled` (the caller already knows a claim went stale) freezes the active
 * step as pending rather than active: nothing is moving, and an "in progress"
 * step beside a "this one is stuck" banner contradicts it.
 */
export function pipelineSteps(status: RecordingStatus, stalled = false): PipelineStep[] {
  const active = ACTIVE_INDEX[status] ?? 0;
  return ORDER.map((step, index) => ({
    ...step,
    state:
      index < active
        ? 'done'
        : index === active
          ? stalled
            ? 'pending'
            : 'active'
          : 'pending',
  }));
}

/** Short summary for assistive tech, e.g. "Step 2 of 3: Transcribe audio". */
export function pipelineProgressLabel(status: RecordingStatus): string {
  const steps = pipelineSteps(status);
  const index = steps.findIndex((step) => step.state === 'active');
  if (index < 0) return 'All steps complete';
  return `Step ${index + 1} of ${steps.length}: ${steps[index].label}`;
}
