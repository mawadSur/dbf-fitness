/**
 * Contract test for the recording upload: the exact tables, columns, filters and storage paths the
 * client uses, and that no privileged column (role, coach_id) is ever sent. Complements
 * upload.test.ts (pure helpers) and uploadRecording.test.ts (orchestration).
 */
import { Platform } from 'react-native';

import { RecordingUploadError, uploadRecording } from './upload';

const COACH = '11111111-1111-1111-1111-111111111111';
const CLASS = '88888888-8888-8888-8888-888888888888';
const RECORDING = '33333333-3333-3333-3333-333333333333';

type Call = { table: string; op: string; payload?: Record<string, unknown>; filters: [string, unknown][] };
const mockCalls: Call[] = [];
const mockStorageUploads: { bucket: string; path: string; options: unknown }[] = [];

const mockGetSession = jest.fn();
const mockInvokeTranscription = jest.fn();
let mockInsertResult: { data: { id: string } | null; error: { message: string } | null };

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

jest.mock('../supabase/client', () => ({
  supabase: {
    auth: { getSession: () => mockGetSession() },
    from: (table: string) => ({
      insert: (payload: Record<string, unknown>) => {
        const call: Call = { table, op: 'insert', payload, filters: [] };
        mockCalls.push(call);
        return { select: () => ({ single: async () => mockInsertResult }) };
      },
      update: (payload: Record<string, unknown>) => {
        const call: Call = { table, op: 'update', payload, filters: [] };
        mockCalls.push(call);
        return {
          eq: async (column: string, value: unknown) => {
            call.filters.push([column, value]);
            return { error: null };
          },
        };
      },
      delete: () => {
        const call: Call = { table, op: 'delete', filters: [] };
        mockCalls.push(call);
        return {
          eq: async (column: string, value: unknown) => {
            call.filters.push([column, value]);
            return { error: null };
          },
        };
      },
    }),
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, _blob: unknown, options: unknown) => {
          mockStorageUploads.push({ bucket, path, options });
          return { error: null };
        },
      }),
    },
  },
}));

jest.mock('../transcription', () => ({
  invokeTranscription: (...args: unknown[]) => mockInvokeTranscription(...args),
}));

const file = { uri: 'blob:https://app.test/x', name: 'Class.mp4', mimeType: 'video/mp4; codecs=avc1', size: 10 };

beforeEach(() => {
  mockCalls.length = 0;
  mockStorageUploads.length = 0;
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321/';
  mockInsertResult = { data: { id: RECORDING }, error: null };
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: COACH }, access_token: 'jwt' } } });
  mockInvokeTranscription.mockResolvedValue({ recording_id: RECORDING });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['x']) }) as never;
});

describe('uploadRecording table contract', () => {
  it('inserts exactly {live_class_id, uploaded_by, status:uploading} into recordings', async () => {
    await uploadRecording({ liveClassId: CLASS, file });
    const insert = mockCalls.find((call) => call.op === 'insert');
    expect(insert?.table).toBe('recordings');
    expect(insert?.payload).toEqual({ live_class_id: CLASS, uploaded_by: COACH, status: 'uploading' });
  });

  it('never sends a privileged or server-owned column on any write', async () => {
    await uploadRecording({ liveClassId: CLASS, file });
    const forbidden = ['role', 'coach_id', 'claimed_at', 'error_message', 'id'];
    for (const call of mockCalls) {
      for (const column of forbidden) expect(Object.keys(call.payload ?? {})).not.toContain(column);
    }
    expect(mockCalls.every((call) => call.table === 'recordings')).toBe(true);
  });

  it('finalizes with an update of ONLY storage_path, filtered by the created id', async () => {
    await uploadRecording({ liveClassId: CLASS, file });
    const update = mockCalls.find((call) => call.op === 'update');
    expect(update?.payload).toEqual({ storage_path: `${COACH}/${RECORDING}/Class.mp4` });
    expect(update?.filters).toEqual([['id', RECORDING]]);
  });

  it('uploads to the recordings bucket with the MIME normalised and upsert disabled', async () => {
    await uploadRecording({ liveClassId: CLASS, file });
    expect(mockStorageUploads).toEqual([
      {
        bucket: 'recordings',
        path: `${COACH}/${RECORDING}/Class.mp4`,
        options: { contentType: 'video/mp4', upsert: false },
      },
    ]);
  });

  it('takes the uploader id from the session, not from anything the caller passes', async () => {
    const other = '99999999-9999-9999-9999-999999999999';
    await uploadRecording({ liveClassId: CLASS, file: { ...file, name: `${other}/../x.mp4` } });
    expect(mockCalls.find((call) => call.op === 'insert')?.payload?.uploaded_by).toBe(COACH);
    expect(mockStorageUploads[0].path.startsWith(`${COACH}/${RECORDING}/`)).toBe(true);
    expect(mockStorageUploads[0].path).not.toContain('..');
  });

  it('rolls back the placeholder with delete ... eq(id) on a failed object upload, and only then', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, blob: async () => new Blob() });
    const error = await uploadRecording({ liveClassId: CLASS, file }).catch((caught) => caught);
    expect(error).toBeInstanceOf(RecordingUploadError);
    expect(error.code).toBe('upload_failed');
    const del = mockCalls.find((call) => call.op === 'delete');
    expect(del).toMatchObject({ table: 'recordings', filters: [['id', RECORDING]] });
    expect(mockCalls.some((call) => call.op === 'update')).toBe(false);
    expect(mockInvokeTranscription).not.toHaveBeenCalled();
  });

  it('maps a database refusal on insert to create_failed and writes nothing else', async () => {
    mockInsertResult = { data: null, error: { message: 'new row violates row-level security policy' } };
    const error = await uploadRecording({ liveClassId: CLASS, file }).catch((caught) => caught);
    expect(error.code).toBe('create_failed');
    expect(error.recordingId).toBeNull();
    expect(mockCalls.map((call) => call.op)).toEqual(['insert']);
    expect(mockStorageUploads).toHaveLength(0);
  });

  it('a session with a user but no access token is unauthenticated', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: COACH }, access_token: '' } } });
    await expect(uploadRecording({ liveClassId: CLASS, file })).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(mockCalls).toHaveLength(0);
  });
});

describe('uploadRecording native path contract', () => {
  const createUploadTask = jest.fn();
  const uploadAsync = jest.fn();

  beforeEach(() => {
    (Platform as { OS: string }).OS = 'ios';
    uploadAsync.mockResolvedValue({ status: 200 });
    createUploadTask.mockImplementation(
      (_url: string, _uri: string, _opts: unknown, onProgress: (p: unknown) => void) => {
        onProgress({ totalBytesSent: 5, totalBytesExpectedToSend: 10 });
        onProgress({ totalBytesSent: 99, totalBytesExpectedToSend: 10 });
        onProgress({ totalBytesSent: 1, totalBytesExpectedToSend: 0 });
        return { uploadAsync };
      }
    );
    jest.doMock('expo-file-system/legacy', () => ({
      createUploadTask,
      FileSystemUploadType: { BINARY_CONTENT: 0 },
    }), { virtual: true });
  });

  afterEach(() => {
    (Platform as { OS: string }).OS = 'web';
    jest.dontMock('expo-file-system/legacy');
  });

  it('streams from disk to the storage REST endpoint with the user JWT, and never uses the blob API', async () => {
    const progress: number[] = [];
    await uploadRecording({ liveClassId: CLASS, file, onProgress: (p) => progress.push(p) });

    const [url, uri, options] = createUploadTask.mock.calls[0];
    expect(url).toBe(`http://127.0.0.1:54321/storage/v1/object/recordings/${COACH}/${RECORDING}/Class.mp4`);
    expect(uri).toBe(file.uri);
    expect(options.httpMethod).toBe('POST');
    expect(options.headers).toEqual({
      Authorization: 'Bearer jwt',
      'Content-Type': 'video/mp4',
      'x-upsert': 'false',
      'cache-control': '3600',
    });
    expect(mockStorageUploads).toHaveLength(0);
    expect(global.fetch).not.toHaveBeenCalled();
    // fraction is clamped to 1 and ignored when the total is unknown
    expect(progress).toEqual([0.5, 1]);
  });

  it('treats a non-2xx storage response as upload_failed and removes the placeholder row', async () => {
    uploadAsync.mockResolvedValue({ status: 403 });
    const error = await uploadRecording({ liveClassId: CLASS, file }).catch((caught) => caught);
    expect(error.code).toBe('upload_failed');
    expect(error.message).toContain('403');
    expect(mockCalls.find((call) => call.op === 'delete')?.filters).toEqual([['id', RECORDING]]);
  });

  it('fails with upload_failed when the Supabase URL is not configured (no request is made)', async () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    const error = await uploadRecording({ liveClassId: CLASS, file }).catch((caught) => caught);
    expect(error.code).toBe('upload_failed');
    expect(createUploadTask).not.toHaveBeenCalled();
  });
});
