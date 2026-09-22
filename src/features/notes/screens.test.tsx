import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import NotesIndexScreen from '../../../app/notes';
import RecordingDetailScreen from '../../../app/notes/[recordingId]';
import UploadScreen from '../../../app/notes/upload';
import {
  fetchCheckedKeys,
  fetchCoachClassById,
  fetchCoachClasses,
  fetchCoachRecordings,
  fetchNotesViewer,
  fetchPublishedRecordings,
  fetchRecordingDetail,
  publishNote,
  retryTranscription,
  saveEditedContent,
  setItemChecked,
} from './api';
import { RecordingUploadError, uploadRecording } from '../../services/recordings';
import { TRANSCRIPTION_LEASE_MS } from '../../services/transcription/types';
import { pickRecordingFile } from './pickRecordingFile';
import type { RecordingDetail, RecordingSummary } from './types';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = { recordingId: 'rec-1' };

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack, canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: jest.fn(),
}));

jest.mock('./api', () => ({
  fetchNotesViewer: jest.fn(),
  fetchCoachRecordings: jest.fn(),
  fetchPublishedRecordings: jest.fn(),
  fetchRecordingDetail: jest.fn(),
  fetchCoachClasses: jest.fn(),
  fetchCoachClassById: jest.fn(),
  fetchCheckedKeys: jest.fn(),
  setItemChecked: jest.fn(),
  saveEditedContent: jest.fn(),
  publishNote: jest.fn(),
  retryTranscription: jest.fn(),
}));

let mockSub: { data?: unknown; isLoading: boolean; isFetching: boolean; refetch: jest.Mock } = {
  isLoading: false,
  isFetching: false,
  refetch: jest.fn(),
};
jest.mock('../subscriptions/useSubscriptionState', () => ({
  useSubscriptionState: () => mockSub,
}));

const subInfo = (state: string, extra: Record<string, unknown> = {}) => ({
  state,
  currentPeriodEnd: null,
  daysOverdue: 0,
  graceDaysLeft: 0,
  ...extra,
});

jest.mock('./pickRecordingFile', () => ({
  pickRecordingFile: jest.fn(),
  resolveMimeType: jest.fn(),
}));

jest.mock('../../services/recordings', () => ({
  RecordingUploadError: class RecordingUploadError extends Error {},
  recordingUploadErrorMessage: () => 'upload error',
  uploadRecording: jest.fn(),
  validateRecordingFile: jest.fn(),
}));

const COACH = { id: 'coach-1', role: 'coach' as const, isCoach: true };
const MEMBER = { id: 'member-1', role: 'member' as const, isCoach: false };

const CHECKLIST = {
  title: 'Saturday Conditioning',
  items: [
    { key: 'warmup', text: 'Row 500m easy', kind: 'note' as const },
    { key: 'squat-1', text: 'Back squat', kind: 'exercise' as const, sets: 4, reps: '8-10' },
    { key: 'finisher', text: 'Burpees', kind: 'exercise' as const },
  ],
};

function summary(overrides: Partial<RecordingSummary> = {}): RecordingSummary {
  return {
    id: 'rec-1',
    status: 'draft',
    errorMessage: null,
    createdAt: '2026-09-19T10:00:00Z',
    liveClassId: 'class-1',
    classTitle: 'Saturday Conditioning',
    classStartsAt: '2026-09-19T09:00:00Z',
    hasFile: true,
    claimedAt: null,
    ...overrides,
  };
}

/** A lease stamped just now: a run really is in progress. */
const liveClaim = () => new Date().toISOString();
/** A lease older than TRANSCRIPTION_LEASE_MS: the run that took it is never coming back. */
const deadClaim = () => new Date(Date.now() - TRANSCRIPTION_LEASE_MS - 1000).toISOString();

function detail(overrides: Partial<RecordingDetail> = {}): RecordingDetail {
  return { ...summary(), noteId: 'note-1', checklist: CHECKLIST, publishedAt: null, ...overrides };
}

async function renderScreen(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { recordingId: 'rec-1' };
  mockSub = { data: subInfo('active'), isLoading: false, isFetching: false, refetch: jest.fn() };
  (fetchCoachClassById as jest.Mock).mockResolvedValue(null);
  (fetchNotesViewer as jest.Mock).mockResolvedValue(COACH);
  (fetchCheckedKeys as jest.Mock).mockResolvedValue([]);
  (setItemChecked as jest.Mock).mockResolvedValue(undefined);
  (saveEditedContent as jest.Mock).mockResolvedValue(undefined);
  (publishNote as jest.Mock).mockResolvedValue(undefined);
  (retryTranscription as jest.Mock).mockResolvedValue(undefined);
});

describe('recording detail: coach, per status', () => {
  it('uploading shows progress and polling copy', async () => {
    (fetchRecordingDetail as jest.Mock).mockResolvedValue(
      detail({ status: 'uploading', hasFile: false, createdAt: new Date().toISOString(), noteId: null, checklist: null })
    );
    await renderScreen(<RecordingDetailScreen />);
    expect(await screen.findByText('Your recording is being uploaded.')).toBeTruthy();
    expect(screen.getByLabelText('Status: Uploading')).toBeTruthy();
    expect(screen.getByText(/updates on its own/)).toBeTruthy();
    // Nothing to retry while the file is still going up.
    expect(screen.queryByLabelText('Retry transcription')).toBeNull();
  });

  it('transcribing shows a spinner panel', async () => {
    (fetchRecordingDetail as jest.Mock).mockResolvedValue(
      detail({ status: 'transcribing', claimedAt: liveClaim(), noteId: null, checklist: null })
    );
    await renderScreen(<RecordingDetailScreen />);
    expect(await screen.findByLabelText('Status: Transcribing')).toBeTruthy();
    expect(screen.getByText(/Turning the recording into a checklist/)).toBeTruthy();
    expect(screen.queryByLabelText('Retry transcription')).toBeNull();
  });

  it('uploading with the file already up offers Retry transcription (lost hand-off)', async () => {
    (fetchRecordingDetail as jest.Mock).mockResolvedValue(
      detail({ status: 'uploading', hasFile: true, fileSeenAt: Date.now() - 120_000, noteId: null, checklist: null })
    );
    await renderScreen(<RecordingDetailScreen />);
    expect(await screen.findByText(/the notes never started/)).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Retry transcription'));
    await waitFor(() => expect(retryTranscription).toHaveBeenCalledWith('rec-1'));
  });

  it('transcribing with an expired lease offers Retry transcription (killed run)', async () => {
    (fetchRecordingDetail as jest.Mock).mockResolvedValue(
      detail({ status: 'transcribing', claimedAt: deadClaim(), noteId: null, checklist: null })
    );
    await renderScreen(<RecordingDetailScreen />);
    expect(await screen.findByText(/running far too long/)).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Retry transcription'));
    await waitFor(() => expect(retryTranscription).toHaveBeenCalledWith('rec-1'));
  });

  it('a rejected stalled-retry surfaces a typed message instead of failing silently', async () => {
    (fetchRecordingDetail as jest.Mock).mockResolvedValue(
      detail({ status: 'transcribing', claimedAt: deadClaim(), noteId: null, checklist: null })
    );
    (retryTranscription as jest.Mock).mockRejectedValue(new Error('nope'));
    await renderScreen(<RecordingDetailScreen />);
    await fireEvent.press(await screen.findByLabelText('Retry transcription'));
    expect(await screen.findByText(/Something went wrong on our side/)).toBeTruthy();
  });

  it('draft shows the editable checklist; edit, save and inline-confirm publish (no Alert)', async () => {
    (fetchRecordingDetail as jest.Mock).mockResolvedValue(detail());
    await renderScreen(<RecordingDetailScreen />);

    const first = await screen.findByLabelText('Text for item 1');
    expect(first.props.value).toBe('Row 500m easy');
    expect(screen.getByLabelText('Sets for item 2').props.value).toBe('4');

    await fireEvent.changeText(first, 'Bike 10 min');
    await fireEvent.press(screen.getByLabelText('Save changes'));
    await waitFor(() =>
      expect(saveEditedContent).toHaveBeenCalledWith('note-1', expect.stringContaining('Bike 10 min'))
    );
    expect(await screen.findByText('Changes saved.')).toBeTruthy();

    // Publish requires an explicit second tap.
    await fireEvent.press(screen.getByLabelText('Publish'));
    expect(publishNote).not.toHaveBeenCalled();
    expect(screen.getByText(/Your members will see it right away/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Confirm publish'));
    await waitFor(() => expect(publishNote).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Published. Your members can see it now.')).toBeTruthy();
  });

  it('draft: cancelling the confirm publishes nothing; an empty item blocks publish', async () => {
    (fetchRecordingDetail as jest.Mock).mockResolvedValue(detail());
    await renderScreen(<RecordingDetailScreen />);
    await screen.findByLabelText('Text for item 1');

    await fireEvent.press(screen.getByLabelText('Publish'));
    await fireEvent.press(screen.getByLabelText('Cancel'));
    expect(publishNote).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Publish')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Add note'));
    await fireEvent.press(screen.getByLabelText('Publish'));
    expect(await screen.findByText(/Item 4 is empty/)).toBeTruthy();
    expect(screen.queryByLabelText('Confirm publish')).toBeNull();
  });

  it('draft without a noteId refetches itself and never tells the coach to pull to refresh', async () => {
    (fetchRecordingDetail as jest.Mock).mockResolvedValue(detail({ noteId: null }));
    await renderScreen(<RecordingDetailScreen />);
    await screen.findByLabelText('Text for item 1');
    const before = (fetchRecordingDetail as jest.Mock).mock.calls.length;

    await fireEvent.press(screen.getByLabelText('Publish'));
    await fireEvent.press(screen.getByLabelText('Confirm publish'));

    expect(await screen.findByText(/no draft to save yet/)).toBeTruthy();
    expect(screen.queryByText(/pull to refresh/i)).toBeNull();
    expect(publishNote).not.toHaveBeenCalled();
    await waitFor(() =>
      expect((fetchRecordingDetail as jest.Mock).mock.calls.length).toBeGreaterThan(before)
    );
  });

  it('draft: delete, move and kind-toggle controls are present and work', async () => {
    (fetchRecordingDetail as jest.Mock).mockResolvedValue(detail());
    await renderScreen(<RecordingDetailScreen />);
    await screen.findByLabelText('Text for item 1');

    await fireEvent.press(screen.getByLabelText('Move item 2 up'));
    expect(screen.getByLabelText('Text for item 1').props.value).toBe('Back squat');
    await fireEvent.press(screen.getByLabelText('Delete item 1'));
    expect(screen.getByLabelText('Text for item 1').props.value).toBe('Row 500m easy');
    expect(screen.getAllByLabelText(/^Text for item/)).toHaveLength(2);
  });

  it('failed shows the error and Retry calls the function again', async () => {
    (fetchRecordingDetail as jest.Mock).mockResolvedValue(
      detail({ status: 'failed', errorMessage: 'ASR provider timed out', noteId: null, checklist: null })
    );
    await renderScreen(<RecordingDetailScreen />);
    expect(await screen.findByText('ASR provider timed out')).toBeTruthy();
    expect(screen.getByLabelText('Status: Failed')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Retry'));
    await waitFor(() => expect(retryTranscription).toHaveBeenCalledWith('rec-1'));
  });

  it('failed: a rejected retry surfaces a typed message', async () => {
    (fetchRecordingDetail as jest.Mock).mockResolvedValue(
      detail({ status: 'failed', noteId: null, checklist: null })
    );
    (retryTranscription as jest.Mock).mockRejectedValue(new Error('boom'));
    await renderScreen(<RecordingDetailScreen />);
    await fireEvent.press(await screen.findByLabelText('Retry'));
    expect(await screen.findByText(/Something went wrong on our side/)).toBeTruthy();
  });

  it('published is a read-only view with no editor and no ticking', async () => {
    (fetchRecordingDetail as jest.Mock).mockResolvedValue(
      detail({ status: 'published', publishedAt: '2026-09-19T12:00:00Z' })
    );
    await renderScreen(<RecordingDetailScreen />);
    expect(await screen.findByText('Back squat')).toBeTruthy();
    expect(screen.getByLabelText('Status: Published')).toBeTruthy();
    expect(screen.queryByLabelText('Text for item 1')).toBeNull();
    expect(screen.queryByLabelText('Publish')).toBeNull();
    expect(screen.queryByText(/of 3 done/)).toBeNull();
  });
});

describe('recording detail: member checklist', () => {
  beforeEach(() => {
    (fetchNotesViewer as jest.Mock).mockResolvedValue(MEMBER);
  });

  it('shows progress and persists a tick optimistically', async () => {
    (fetchRecordingDetail as jest.Mock).mockResolvedValue(detail({ status: 'published' }));
    // A stateful fake server, so the post-mutation refetch agrees with the write.
    const serverKeys = new Set(['warmup']);
    (fetchCheckedKeys as jest.Mock).mockImplementation(async () => [...serverKeys]);
    (setItemChecked as jest.Mock).mockImplementation(async (_note: string, key: string, checked: boolean) => {
      if (checked) serverKeys.add(key);
      else serverKeys.delete(key);
    });
    await renderScreen(<RecordingDetailScreen />);

    expect(await screen.findByText('1 of 3 done')).toBeTruthy();
    expect(screen.getByText('4 sets × 8-10 reps')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Back squat'));
    expect(await screen.findByText('2 of 3 done')).toBeTruthy();
    await waitFor(() => expect(setItemChecked).toHaveBeenCalledWith('note-1', 'squat-1', true));

    await fireEvent.press(screen.getByLabelText('Row 500m easy'));
    await waitFor(() => expect(setItemChecked).toHaveBeenCalledWith('note-1', 'warmup', false));
    expect(await screen.findByText('1 of 3 done')).toBeTruthy();
  });

  it('rolls the tick back and says so when the save fails', async () => {
    (fetchRecordingDetail as jest.Mock).mockResolvedValue(detail({ status: 'published' }));
    (setItemChecked as jest.Mock).mockRejectedValue(new Error('offline'));
    await renderScreen(<RecordingDetailScreen />);

    await screen.findByText('0 of 3 done');
    await fireEvent.press(screen.getByLabelText('Burpees'));
    expect(await screen.findByText('Could not save that check. Try again.')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('0 of 3 done')).toBeTruthy());
  });

  it('never shows an unpublished note or editor to a member', async () => {
    (fetchRecordingDetail as jest.Mock).mockResolvedValue(detail({ status: 'draft' }));
    await renderScreen(<RecordingDetailScreen />);
    expect(await screen.findByText('Not published yet')).toBeTruthy();
    expect(screen.queryByLabelText('Text for item 1')).toBeNull();
  });

  it('shows a not-available state when the recording is not visible', async () => {
    (fetchRecordingDetail as jest.Mock).mockResolvedValue(null);
    await renderScreen(<RecordingDetailScreen />);
    expect(await screen.findByText('Recording not available')).toBeTruthy();
  });
});

describe('recording detail: load error', () => {
  it('offers retry', async () => {
    (fetchRecordingDetail as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await renderScreen(<RecordingDetailScreen />);
    expect(await screen.findByText('Could not load this recording')).toBeTruthy();
    (fetchRecordingDetail as jest.Mock).mockResolvedValue(detail({ status: 'failed', noteId: null, checklist: null }));
    await fireEvent.press(screen.getByLabelText('Try again'));
    expect(await screen.findByLabelText('Status: Failed')).toBeTruthy();
  });
});

describe('notes list', () => {
  it('coach sees every one of the five statuses, an upload CTA, and retry only where it helps', async () => {
    (fetchCoachRecordings as jest.Mock).mockResolvedValue([
      summary({ id: 'a', status: 'uploading', hasFile: false, createdAt: new Date().toISOString(), classTitle: 'A' }),
      summary({ id: 'b', status: 'transcribing', claimedAt: liveClaim(), classTitle: 'B' }),
      summary({ id: 'c', status: 'draft', classTitle: 'C' }),
      summary({ id: 'd', status: 'published', classTitle: 'D' }),
      summary({ id: 'e', status: 'failed', classTitle: 'E', errorMessage: 'nope' }),
    ]);
    await renderScreen(<NotesIndexScreen />);

    for (const label of ['Uploading', 'Transcribing', 'Draft', 'Published', 'Failed']) {
      expect(await screen.findByLabelText(`Status: ${label}`)).toBeTruthy();
    }
    expect(screen.getAllByLabelText(/^Retry /)).toHaveLength(1);

    await fireEvent.press(screen.getByLabelText('Upload recording'));
    expect(mockPush).toHaveBeenCalledWith('/notes/upload');

    await fireEvent.press(screen.getByLabelText('Open C'));
    expect(mockPush).toHaveBeenCalledWith('/notes/c');

    await fireEvent.press(screen.getByLabelText('Retry E'));
    await waitFor(() => expect(retryTranscription).toHaveBeenCalledWith('e'));
  });

  it('coach can retry recordings stranded mid-pipeline from the list', async () => {
    (fetchCoachRecordings as jest.Mock).mockResolvedValue([
      // File uploaded, hand-off to the function lost: still says 'uploading'.
      summary({ id: 'stranded', status: 'uploading', hasFile: true, fileSeenAt: Date.now() - 120_000, classTitle: 'Stranded' }),
      // Claimed 20 minutes ago by a run the runtime killed.
      summary({ id: 'stuck', status: 'transcribing', claimedAt: deadClaim(), classTitle: 'Stuck' }),
    ]);
    await renderScreen(<NotesIndexScreen />);

    expect(await screen.findByText(/the notes never started/)).toBeTruthy();
    expect(screen.getByText(/running far too long/)).toBeTruthy();
    expect(screen.getAllByLabelText(/^Retry /)).toHaveLength(2);

    await fireEvent.press(screen.getByLabelText('Retry Stranded'));
    await waitFor(() => expect(retryTranscription).toHaveBeenCalledWith('stranded'));

    await fireEvent.press(screen.getByLabelText('Retry Stuck'));
    await waitFor(() => expect(retryTranscription).toHaveBeenCalledWith('stuck'));
  });

  it('coach empty state', async () => {
    (fetchCoachRecordings as jest.Mock).mockResolvedValue([]);
    await renderScreen(<NotesIndexScreen />);
    expect(await screen.findByText('No recordings yet')).toBeTruthy();
  });

  it('member sees published notes only, without status chips or coach actions', async () => {
    (fetchNotesViewer as jest.Mock).mockResolvedValue(MEMBER);
    (fetchPublishedRecordings as jest.Mock).mockResolvedValue([summary({ status: 'published' })]);
    await renderScreen(<NotesIndexScreen />);
    expect(await screen.findByText('Saturday Conditioning')).toBeTruthy();
    expect(screen.queryByLabelText(/^Status:/)).toBeNull();
    expect(screen.queryByLabelText('Upload recording')).toBeNull();
    expect(fetchCoachRecordings).not.toHaveBeenCalled();
  });

  it('member empty state and error retry', async () => {
    (fetchNotesViewer as jest.Mock).mockResolvedValue(MEMBER);
    (fetchPublishedRecordings as jest.Mock).mockResolvedValueOnce([]);
    const view = await renderScreen(<NotesIndexScreen />);
    expect(await screen.findByText('No workout notes yet')).toBeTruthy();
    await view.unmount();

    (fetchPublishedRecordings as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await renderScreen(<NotesIndexScreen />);
    expect(await screen.findByText('Could not load recordings')).toBeTruthy();
  });
});

describe('upload screen', () => {
  it('members get a "coaches only" state', async () => {
    (fetchNotesViewer as jest.Mock).mockResolvedValue(MEMBER);
    await renderScreen(<UploadScreen />);
    expect(await screen.findByText('Coaches only')).toBeTruthy();
    expect(fetchCoachClasses).not.toHaveBeenCalled();
  });

  it('coach: preselects the ?classId= class and enables upload only with a file', async () => {
    mockParams = { classId: 'class-2' };
    (fetchCoachClasses as jest.Mock).mockResolvedValue([
      { id: 'class-1', title: 'Monday Strength', starts_at: '2026-09-14T09:00:00Z', status: 'ended' },
      { id: 'class-2', title: 'Saturday Conditioning', starts_at: '2026-09-19T09:00:00Z', status: 'ended' },
    ]);
    await renderScreen(<UploadScreen />);
    const radio = await screen.findByLabelText('Saturday Conditioning');
    expect(radio.props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('Monday Strength').props.accessibilityState.selected).toBe(false);
    expect(screen.getByLabelText('Upload recording').props.accessibilityState.disabled).toBe(true);
  });

  it('coach: a lost pipeline hand-off offers Retry transcription, never a second upload', async () => {
    mockParams = { classId: 'class-1' };
    (fetchCoachClasses as jest.Mock).mockResolvedValue([
      { id: 'class-1', title: 'Monday Strength', starts_at: '2026-09-14T09:00:00Z', status: 'ended' },
    ]);
    (pickRecordingFile as jest.Mock).mockResolvedValue({
      kind: 'picked',
      file: { uri: 'file:///a.mp4', name: 'a.mp4', mimeType: 'video/mp4', size: 1024 },
    });
    // The upload succeeded; only the invocation of the Edge Function failed, so the row and the
    // object already exist and carry recordingId.
    // The mocked class ignores its constructor args, so the fields are assigned explicitly.
    const handoffFailure = Object.assign(
      new RecordingUploadError('transcribe_failed', 'could not start the transcription', 'rec-9'),
      { code: 'transcribe_failed', recordingId: 'rec-9' }
    );
    (uploadRecording as jest.Mock).mockRejectedValue(handoffFailure);

    await renderScreen(<UploadScreen />);
    await fireEvent.press(await screen.findByLabelText('Choose video or audio file'));
    await waitFor(() => expect(screen.getByText(/a\.mp4/)).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('Upload recording'));

    // The CTA must stop being "Upload recording": tapping that again would create a second
    // recordings row and a second object for the same file.
    const retryButton = await screen.findByLabelText('Retry transcription');
    expect(screen.queryByLabelText('Upload recording')).toBeNull();
    expect(uploadRecording).toHaveBeenCalledTimes(1);

    await fireEvent.press(retryButton);
    await waitFor(() => expect(retryTranscription).toHaveBeenCalledWith('rec-9'));
    expect(uploadRecording).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/notes/rec-9'));
  });

  it('coach: a ?classId= that is not theirs is ignored with a notice', async () => {
    mockParams = { classId: 'someone-elses' };
    (fetchCoachClasses as jest.Mock).mockResolvedValue([
      { id: 'class-1', title: 'Monday Strength', starts_at: '2026-09-14T09:00:00Z', status: 'ended' },
    ]);
    await renderScreen(<UploadScreen />);
    expect(await screen.findByText(/not one of yours/)).toBeTruthy();
    expect(screen.getByLabelText('Monday Strength').props.accessibilityState.selected).toBe(false);
  });
});


describe('subscription gating', () => {
  it('list: expired member sees the panel, not the empty state, and no fetch', async () => {
    (fetchNotesViewer as jest.Mock).mockResolvedValue(MEMBER);
    (fetchPublishedRecordings as jest.Mock).mockResolvedValue([]);
    mockSub = { ...mockSub, data: subInfo('expired') };
    await renderScreen(<NotesIndexScreen />);
    expect(await screen.findByText('Your membership has lapsed')).toBeTruthy();
    expect(screen.queryByText('No workout notes yet')).toBeNull();
    expect(fetchPublishedRecordings).not.toHaveBeenCalled();
  });

  it('list: none member is told to subscribe', async () => {
    (fetchNotesViewer as jest.Mock).mockResolvedValue(MEMBER);
    mockSub = { ...mockSub, data: subInfo('none') };
    await renderScreen(<NotesIndexScreen />);
    expect(await screen.findByText('Workout notes are for members')).toBeTruthy();
    // Store builds carry no purchase call to action — only the neutral membership line and
    // the support mailto (see src/components/subscription/billing.ts).
    expect(screen.getByTestId('membership-support')).toBeTruthy();
    expect(screen.queryByText('Subscribe')).toBeNull();
  });

  it('list: grace member sees the banner above their notes', async () => {
    (fetchNotesViewer as jest.Mock).mockResolvedValue(MEMBER);
    (fetchPublishedRecordings as jest.Mock).mockResolvedValue([summary({ status: 'published' })]);
    mockSub = { ...mockSub, data: subInfo('grace', { daysOverdue: 3, graceDaysLeft: 7 }) };
    await renderScreen(<NotesIndexScreen />);
    expect(await screen.findByText('Payment overdue')).toBeTruthy();
    expect(await screen.findByLabelText('Open Saturday Conditioning')).toBeTruthy();
  });

  it('list: coach is unaffected even when the state says expired', async () => {
    mockSub = { ...mockSub, data: subInfo('expired') };
    (fetchCoachRecordings as jest.Mock).mockResolvedValue([]);
    await renderScreen(<NotesIndexScreen />);
    expect(await screen.findByText('No recordings yet')).toBeTruthy();
  });

  it('detail: expired member gets the panel, never a blank or raw error', async () => {
    (fetchNotesViewer as jest.Mock).mockResolvedValue(MEMBER);
    (fetchRecordingDetail as jest.Mock).mockResolvedValue(null);
    mockSub = { ...mockSub, data: subInfo('expired') };
    await renderScreen(<RecordingDetailScreen />);
    expect(await screen.findByText('Your membership has lapsed')).toBeTruthy();
    expect(screen.queryByText('Recording not available')).toBeNull();
  });

  it('detail: grace member sees the banner with the checklist', async () => {
    (fetchNotesViewer as jest.Mock).mockResolvedValue(MEMBER);
    (fetchRecordingDetail as jest.Mock).mockResolvedValue(detail({ status: 'published' }));
    mockSub = { ...mockSub, data: subInfo('grace', { daysOverdue: 2, graceDaysLeft: 8 }) };
    await renderScreen(<RecordingDetailScreen />);
    expect(await screen.findByText('Payment overdue')).toBeTruthy();
    expect(await screen.findByText('Back squat')).toBeTruthy();
  });
});

describe('abandoned upload and lost hand-off', () => {
  it('file-less uploading row older than the cutoff says the upload never completed and re-routes to upload', async () => {
    (fetchRecordingDetail as jest.Mock).mockResolvedValue(
      detail({
        status: 'uploading',
        hasFile: false,
        createdAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
        noteId: null,
        checklist: null,
      })
    );
    await renderScreen(<RecordingDetailScreen />);
    expect(await screen.findByText(/upload never completed/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Retry upload'));
    expect(mockPush).toHaveBeenCalledWith('/notes/upload?classId=class-1');
    expect(retryTranscription).not.toHaveBeenCalled();
  });

  it('fresh file within the hand-off window shows no "never started" alarm', async () => {
    (fetchRecordingDetail as jest.Mock).mockResolvedValue(
      detail({ status: 'uploading', hasFile: true, fileSeenAt: Date.now() - 5_000, noteId: null, checklist: null })
    );
    await renderScreen(<RecordingDetailScreen />);
    expect(await screen.findByLabelText('Status: Uploading')).toBeTruthy();
    expect(screen.queryByText(/never started/)).toBeNull();
    expect(screen.queryByLabelText('Retry transcription')).toBeNull();
  });
});

describe('upload deep link beyond the first 50 classes', () => {
  it('fetches the class by id and preselects it', async () => {
    mockParams = { classId: 'old-class' };
    (fetchCoachClasses as jest.Mock).mockResolvedValue([
      { id: 'class-1', title: 'Monday Strength', starts_at: '2026-09-14T09:00:00Z', status: 'ended' },
    ]);
    (fetchCoachClassById as jest.Mock).mockResolvedValue({
      id: 'old-class',
      title: 'Ancient Class',
      starts_at: '2025-01-01T09:00:00Z',
      status: 'ended',
    });
    await renderScreen(<UploadScreen />);
    const radio = await screen.findByLabelText('Ancient Class');
    expect(radio.props.accessibilityState.selected).toBe(true);
    expect(fetchCoachClassById).toHaveBeenCalledWith('coach-1', 'old-class');
    expect(screen.queryByText(/not one of yours/)).toBeNull();
  });
});
