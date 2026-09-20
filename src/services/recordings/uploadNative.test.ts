/** Native-path tests for uploadRecording: streaming upload and the blob fallback. */
import { uploadRecording } from './upload';

const COACH = '11111111-1111-1111-1111-111111111111';
const CLASS = '88888888-8888-8888-8888-888888888888';
const RECORDING = '33333333-3333-3333-3333-333333333333';

const mockStorageUpload = jest.fn();
const mockCreateUploadTask = jest.fn();
const fsState = { available: true };

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

jest.mock('../supabase/client', () => ({
  supabase: {
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: { user: { id: COACH }, access_token: 'jwt-token' } } }),
    },
    from: () => ({
      insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: RECORDING }, error: null }) }) }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
    storage: { from: () => ({ upload: (...args: unknown[]) => mockStorageUpload(...args) }) },
  },
}));

jest.mock('../transcription', () => ({
  invokeTranscription: jest.fn().mockResolvedValue({ recording_id: RECORDING, status: 'draft' }),
}));

jest.mock(
  'expo-file-system/legacy',
  () => ({
    // A throwing getter simulates a build where the native module cannot be used.
    get createUploadTask() {
      if (!fsState.available) throw new Error("Cannot find native module 'ExponentFileSystem'");
      return (...args: unknown[]) => mockCreateUploadTask(...args);
    },
    FileSystemUploadType: { BINARY_CONTENT: 0 },
  }),
  { virtual: true }
);

const file = { uri: 'file:///tmp/class.mp4', name: 'class.mp4', mimeType: 'video/mp4', size: 2048 };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
  mockStorageUpload.mockResolvedValue({ error: null });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['x']) }) as never;
});

describe('uploadRecording (native)', () => {
  it('streams from disk with the expo-file-system upload task', async () => {
    fsState.available = true;
    mockCreateUploadTask.mockReturnValue({ uploadAsync: async () => ({ status: 200 }) });
    await expect(uploadRecording({ liveClassId: CLASS, file })).resolves.toMatchObject({ recordingId: RECORDING });
    expect(mockCreateUploadTask).toHaveBeenCalledTimes(1);
    expect(mockStorageUpload).not.toHaveBeenCalled();
  });

  it('falls back to the blob path when createUploadTask throws at call time', async () => {
    fsState.available = true;
    mockCreateUploadTask.mockImplementation(() => {
      throw new Error('native module not linked');
    });
    await expect(uploadRecording({ liveClassId: CLASS, file })).resolves.toMatchObject({ recordingId: RECORDING });
    expect(mockStorageUpload).toHaveBeenCalledTimes(1);
  });

  it('falls back to the blob path when the native module cannot be loaded', async () => {
    fsState.available = false;
    const onProgress = jest.fn();
    await expect(uploadRecording({ liveClassId: CLASS, file, onProgress })).resolves.toMatchObject({
      recordingId: RECORDING,
    });
    expect(mockCreateUploadTask).not.toHaveBeenCalled();
    expect(mockStorageUpload).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenLastCalledWith(1);
    fsState.available = true;
  });

  it('fails fast with upload_failed when uploadAsync rejects (no blob re-upload)', async () => {
    fsState.available = true;
    mockCreateUploadTask.mockReturnValue({
      uploadAsync: async () => {
        throw new Error('Network request failed');
      },
    });
    await expect(uploadRecording({ liveClassId: CLASS, file })).rejects.toMatchObject({ code: 'upload_failed' });
    expect(mockStorageUpload).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('reports upload_failed on a non-2xx streaming response', async () => {
    fsState.available = true;
    mockCreateUploadTask.mockReturnValue({ uploadAsync: async () => ({ status: 403 }) });
    await expect(uploadRecording({ liveClassId: CLASS, file })).rejects.toMatchObject({ code: 'upload_failed' });
  });
});
