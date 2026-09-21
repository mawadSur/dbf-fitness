import { pipelineProgressLabel, pipelineSteps } from './pipelineSteps';

describe('pipelineSteps', () => {
  it('marks upload as the active step while uploading', () => {
    expect(pipelineSteps('uploading').map((step) => step.state)).toEqual([
      'active',
      'pending',
      'pending',
    ]);
  });

  it('marks upload done and transcription active while transcribing', () => {
    expect(pipelineSteps('transcribing').map((step) => step.state)).toEqual([
      'done',
      'active',
      'pending',
    ]);
  });

  it('has every step done once a draft exists', () => {
    for (const status of ['draft', 'published'] as const) {
      expect(pipelineSteps(status).every((step) => step.state === 'done')).toBe(true);
    }
  });

  it('freezes the active step when the pipeline is stalled', () => {
    // Nothing is moving: an "in progress" step next to "this one is stuck"
    // would contradict the banner.
    expect(pipelineSteps('transcribing', true).map((step) => step.state)).toEqual([
      'done',
      'pending',
      'pending',
    ]);
    expect(pipelineSteps('uploading', true).some((step) => step.state === 'active')).toBe(false);
  });

  it('keeps the same three stages in the same order for every status', () => {
    const keys = ['upload', 'transcribe', 'draft'];
    for (const status of ['uploading', 'transcribing', 'draft', 'published', 'failed'] as const) {
      expect(pipelineSteps(status).map((step) => step.key)).toEqual(keys);
    }
  });

  it('names a step for every stage (nothing unlabelled reaches the UI)', () => {
    for (const step of pipelineSteps('uploading')) {
      expect(step.label.length).toBeGreaterThan(0);
    }
  });
});

describe('pipelineProgressLabel', () => {
  it('positions the active step for assistive tech', () => {
    expect(pipelineProgressLabel('uploading')).toBe('Step 1 of 3: Upload recording');
    expect(pipelineProgressLabel('transcribing')).toBe('Step 2 of 3: Transcribe audio');
  });

  it('reports completion when nothing is active', () => {
    expect(pipelineProgressLabel('published')).toBe('All steps complete');
  });
});
