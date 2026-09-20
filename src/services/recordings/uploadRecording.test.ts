/**
 * Orchestration tests for uploadRecording on the WEB path (Blob via supabase-js). The NATIVE path
 * (expo-file-system streaming upload) is not covered here and is UNVERIFIED without a device.
 */
import { RecordingUploadError, uploadRecording } from './upload';

const COACH = '11111111-1111-1111-1111-111111111111';
const CLASS = '88888888-8888-8888-8888-888888888888';
const RECORDING = '33333333-3333-3333-3333-333333333333';

const mockGetSession = jest.fn();
const mockInsertSingle = jest.fn();
const mockUpdateEq = jest.fn();
const mockDeleteEq = jest.fn();
const mockStorageUpload = jest.fn();
const mockInvokeTranscription = jest.fn();

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

jest.mock('../supabase/client', () => ({
  supabase: {
    auth: { getSession: () => mockGetSession() },
    from: () => ({
      insert: () => ({ select: () => ({ single: () => mockInsertSingle() }) }),
      update: (patch: unknown) => ({ eq: (_col: string, id: string) => mockUpdateEq(patch, id) }),
      delete: () => ({ eq: (_col: string, id: string) => mockDeleteEq(id) }),
    }),
    storage: { from: () => ({ upload: (...args: unknown[]) => mockStorageUpload(...args) }) },
  },
}));

jest.mock('../transcription', () => ({
  invokeTranscription: (...args: unknown[]) => mockInvokeTranscription(...args),
}));

const file = { uri: 'blob:https://app.test/abc', name: 'Saturday Class.mp4', mimeType: 'video/mp4', size: 2048 };

const transcription = {
  recording_id: RECORDING,
  status: 'draft',
  note_id: 'note-1',
  transcript_chars: 10,
  item_count: 2,
  asr_provider: 'mock',
  drafter_provider: 'mock',
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
  mockGetSession.mockResolvedValue({
    data: { session: { user: { id: COACH }, access_token: 'jwt-token' } },
  });
  mockInsertSingle.mockResolvedValue({ data: { id: RECORDING }, error: null });
  mockUpdateEq.mockResolvedValue({ error: null });
  mockDeleteEq.mockResolvedValue({ error: null });
  mockStorageUpload.mockResolvedValue({ error: null });
  mockInvokeTranscription.mockResolvedValue(transcription);
  global.fetch = jest.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['x']) }) as never;
});

describe('uploadRecording (web)', () => {
  it('creates the row, uploads under <uid>/<recordingId>/<safe name>, stores the path, transcribes', async () => {
    const progress: number[] = [];
    const result = await uploadRecording({ liveClassId: CLASS, file, onProgress: (p) => progress.push(p) });

    expect(result).toEqual({ recordingId: RECORDING, transcription });
    expect(mockStorageUpload).toHaveBeenCalledWith(
      `${COACH}/${RECORDING}/Saturday-Class.mp4`,
      expect.anything(),
      { contentType: 'video/mp4', upsert: false }
    );
    expect(mockUpdateEq).toHaveBeenCalledWith({ storage_path: `${COACH}/${RECORDING}/Saturday-Class.mp4` }, RECORDING);
    expect(mockInvokeTranscription).toHaveBeenCalledWith(RECORDING);
    expect(progress).toEqual([0, 1]);
  });

  it('rejects a bad file before creating any row', async () => {
    await expect(
      uploadRecording({ liveClassId: CLASS, file: { ...file, mimeType: 'application/pdf' } })
    ).rejects.toMatchObject({ code: 'unsupported_type' });
    expect(mockInsertSingle).not.toHaveBeenCalled();
  });

  it('rejects a non-uuid class id before creating any row', async () => {
    await expect(uploadRecording({ liveClassId: 'not-a-uuid', file })).rejects.toMatchObject({
      code: 'invalid_target',
    });
    expect(mockInsertSingle).not.toHaveBeenCalled();
  });

  it('refuses to upload without a session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await expect(uploadRecording({ liveClassId: CLASS, file })).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(mockInsertSingle).not.toHaveBeenCalled();
  });

  it('surfaces an RLS refusal on insert as create_failed', async () => {
    mockInsertSingle.mockResolvedValue({ data: null, error: { message: 'new row violates row-level security' } });
    await expect(uploadRecording({ liveClassId: CLASS, file })).rejects.toMatchObject({ code: 'create_failed' });
    expect(mockStorageUpload).not.toHaveBeenCalled();
  });

  it('deletes the placeholder row when the object upload fails', async () => {
    mockStorageUpload.mockResolvedValue({ error: { message: 'mime type not supported' } });
    await expect(uploadRecording({ liveClassId: CLASS, file })).rejects.toMatchObject({ code: 'upload_failed' });
    expect(mockDeleteEq).toHaveBeenCalledWith(RECORDING);
    expect(mockInvokeTranscription).not.toHaveBeenCalled();
  });

  it('reports a failed storage_path write as finalize_failed and keeps the id', async () => {
    mockUpdateEq.mockResolvedValue({ error: { message: 'denied' } });
    await expect(uploadRecording({ liveClassId: CLASS, file })).rejects.toMatchObject({
      code: 'finalize_failed',
      recordingId: RECORDING,
    });
  });

  it('keeps the uploaded recording when only the transcription call fails, so it can be retried', async () => {
    mockInvokeTranscription.mockRejectedValue(new Error('conflict'));
    const error = await uploadRecording({ liveClassId: CLASS, file }).catch((caught) => caught);
    expect(error).toBeInstanceOf(RecordingUploadError);
    expect(error.code).toBe('transcribe_failed');
    expect(error.recordingId).toBe(RECORDING);
    expect(mockDeleteEq).not.toHaveBeenCalled();
  });
});
