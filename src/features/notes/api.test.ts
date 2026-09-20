import { TranscriptionError } from '../../services/transcription/types';
import { fetchCoachClassById, resetFileSeen, retryTranscription, toRecordingSummary } from './api';

const mockInvoke = jest.fn();
jest.mock('../../services/transcription', () => ({ invokeTranscription: (id: string) => mockInvoke(id) }));

const mockMaybeSingle = jest.fn();
const chain: Record<string, jest.Mock> = {};
for (const m of ['select', 'eq']) chain[m] = jest.fn(() => chain);
chain.maybeSingle = mockMaybeSingle;
jest.mock('../../services/supabase/client', () => ({
  supabase: { from: jest.fn(() => chain), auth: { getSession: jest.fn() } },
}));


const row = (over = {}) => ({
  id: 'r1',
  status: 'uploading' as const,
  error_message: null,
  created_at: '2026-09-19T10:00:00Z',
  live_class_id: 'c1',
  has_file: true,
  claimed_at: null,
  live_classes: null,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  resetFileSeen();
});

describe('retryTranscription', () => {
  it('resolves started on success', async () => {
    mockInvoke.mockResolvedValue({});
    await expect(retryTranscription('r1')).resolves.toBe('started');
  });
  it('treats a 409 conflict as already processing', async () => {
    mockInvoke.mockRejectedValue(new TranscriptionError('conflict', 'x', 409));
    await expect(retryTranscription('r1')).resolves.toBe('already_processing');
  });
  it('still throws other errors', async () => {
    mockInvoke.mockRejectedValue(new TranscriptionError('server_error', 'x', 500));
    await expect(retryTranscription('r1')).rejects.toBeInstanceOf(TranscriptionError);
  });
});

describe('toRecordingSummary fileSeenAt', () => {
  it('remembers the first sighting of a file on an uploading row', () => {
    expect(toRecordingSummary(row(), 1000).fileSeenAt).toBe(1000);
    expect(toRecordingSummary(row(), 9000).fileSeenAt).toBe(1000);
  });
  it('is null without a file or once the row moves on', () => {
    expect(toRecordingSummary(row({ has_file: false }), 1000).fileSeenAt).toBeNull();
    toRecordingSummary(row(), 1000);
    expect(toRecordingSummary(row({ status: 'transcribing' }), 2000).fileSeenAt).toBeNull();
  });
});

describe('fetchCoachClassById', () => {
  it('filters by id and coach and returns the class', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: 'c9', title: 'T', starts_at: 'x', status: 'ended' }, error: null });
    const c = await fetchCoachClassById('coach', 'c9');
    expect(c?.id).toBe('c9');
    expect(chain.eq).toHaveBeenCalledWith('id', 'c9');
    expect(chain.eq).toHaveBeenCalledWith('coach_id', 'coach');
  });
  it('returns null for a malformed id or a missing row', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: { code: '22P02' } });
    expect(await fetchCoachClassById('coach', 'nope')).toBeNull();
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect(await fetchCoachClassById('coach', 'c1')).toBeNull();
  });
});
