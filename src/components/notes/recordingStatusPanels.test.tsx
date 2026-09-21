import { screen } from '@testing-library/react-native';
import { readFileSync } from 'fs';
import { join } from 'path';

import type { RecordingDetail } from '../../features/notes/types';
import type { RecordingStatus } from '../../services/transcription/types';
import { BOTH_THEMES, renderInTheme } from '../ui/testing';
import { ProgressPanel } from './RecordingStatusPanels';

// `RetryControl` pulls in the Supabase client (and through it AsyncStorage's
// native module), which does not exist under Jest. The panel's own behaviour is
// what is under test; the retry control has its own coverage. `jest.mock` is
// hoisted above the imports, so these still take effect.
jest.mock('../../features/notes/api', () => ({ retryTranscription: jest.fn() }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}));

function recording(overrides: Partial<RecordingDetail> = {}): RecordingDetail {
  return {
    id: 'rec-1',
    liveClassId: 'class-1',
    status: 'transcribing' as RecordingStatus,
    hasFile: true,
    claimedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    errorMessage: null,
    ...overrides,
  } as RecordingDetail;
}

describe('ProgressPanel', () => {
  it('names the three pipeline stages instead of showing a bare spinner', async () => {
    await renderInTheme(<ProgressPanel recording={recording()} onRefetch={() => {}} />);

    expect(await screen.findByTestId('pipeline-steps')).toBeTruthy();
    for (const key of ['upload', 'transcribe', 'draft']) {
      expect(screen.getByTestId(`pipeline-step-${key}`)).toBeTruthy();
    }
  });

  it('no longer reaches for ActivityIndicator at all', () => {
    // The regression was a bare spinner as the whole content. Guarding the
    // source keeps it from creeping back in a later edit of this panel.
    const source = readFileSync(join(__dirname, 'RecordingStatusPanels.tsx'), 'utf8');
    expect(source).not.toContain('ActivityIndicator');
  });

  it('states each stage in words, not by colour alone', async () => {
    await renderInTheme(<ProgressPanel recording={recording()} onRefetch={() => {}} />);

    expect(screen.getByTestId('pipeline-step-upload').props.accessibilityLabel).toBe(
      'Upload recording: Done'
    );
    expect(screen.getByTestId('pipeline-step-transcribe').props.accessibilityLabel).toBe(
      'Transcribe audio: In progress'
    );
    expect(screen.getByTestId('pipeline-step-draft').props.accessibilityLabel).toBe(
      'Draft the checklist: Waiting'
    );
  });

  it('reserves the shape of the checklist that is coming', async () => {
    await renderInTheme(<ProgressPanel recording={recording()} onRefetch={() => {}} />);
    expect(screen.getByTestId('pipeline-skeleton')).toBeTruthy();
  });

  it('drops the skeleton and freezes the stage when the pipeline is stuck', async () => {
    // A file-less 'uploading' row older than the stall window is stalled.
    const stuck = recording({
      status: 'uploading',
      hasFile: false,
      claimedAt: null,
      createdAt: new Date(Date.now() - 6 * 60 * 60_000).toISOString(),
    });
    await renderInTheme(<ProgressPanel recording={stuck} onRefetch={() => {}} />);

    expect(screen.queryByTestId('pipeline-skeleton')).toBeNull();
    expect(screen.getByTestId('pipeline-step-upload').props.accessibilityLabel).toBe(
      'Upload recording: Waiting'
    );
    expect(screen.getByText('This one is stuck')).toBeTruthy();
  });

  it.each(BOTH_THEMES)('renders in the %s theme', async (scheme) => {
    await renderInTheme(<ProgressPanel recording={recording()} onRefetch={() => {}} />, scheme);
    expect(await screen.findByTestId('pipeline-steps')).toBeTruthy();
  });
});
