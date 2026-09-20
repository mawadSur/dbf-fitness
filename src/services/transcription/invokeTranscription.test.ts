import { invokeTranscription, readFunctionError } from './invokeTranscription';
import { TranscriptionError, transcriptionErrorMessage } from './types';

const mockInvoke = jest.fn();
jest.mock('../supabase/client', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } },
}));

const RECORDING = '33333333-3333-3333-3333-333333333333';

const httpError = (status: number, body: unknown) => ({
  message: 'Edge Function returned a non-2xx status code',
  context: { status, json: async () => body },
});

const successBody = {
  recording_id: RECORDING,
  status: 'draft',
  note_id: 'note-1',
  transcript_chars: 420,
  item_count: 7,
  asr_provider: 'mock',
  drafter_provider: 'mock',
};

describe('invokeTranscription', () => {
  beforeEach(() => mockInvoke.mockReset());

  it('posts recording_id and returns the contract response', async () => {
    mockInvoke.mockResolvedValue({ data: successBody, error: null });
    const result = await invokeTranscription(RECORDING);

    expect(result).toEqual(successBody);
    expect(mockInvoke).toHaveBeenCalledWith('transcribe-recording', {
      body: { recording_id: RECORDING },
    });
  });

  it.each([
    [403, 'forbidden'],
    [404, 'not_found'],
    [409, 'conflict'],
    [422, 'pipeline_failed'],
    [401, 'unauthorized'],
    [400, 'invalid_body'],
    [500, 'server_error'],
  ])('maps HTTP %s to the %s code', async (status, code) => {
    mockInvoke.mockResolvedValue({ data: null, error: httpError(status, { error: code, message: 'nope' }) });
    await expect(invokeTranscription(RECORDING)).rejects.toMatchObject({ code, status });
  });

  it('prefers the server error code over the status when they disagree', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: httpError(500, { error: 'conflict' }) });
    await expect(invokeTranscription(RECORDING)).rejects.toMatchObject({ code: 'conflict' });
  });

  it('ignores an unrecognised error code and keeps the status mapping', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: httpError(409, { error: 'wat' }) });
    await expect(invokeTranscription(RECORDING)).rejects.toMatchObject({ code: 'conflict' });
  });

  it('survives a body that is not JSON', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: {
        message: 'boom',
        context: {
          status: 502,
          json: async () => {
            throw new Error('not json');
          },
        },
      },
    });
    await expect(invokeTranscription(RECORDING)).rejects.toMatchObject({ code: 'server_error', status: 502 });
  });

  it('reports a transport failure as network_error', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });
    await expect(invokeTranscription(RECORDING)).rejects.toMatchObject({ code: 'network_error' });
  });

  it('rejects an unexpected 200 body rather than pretending it worked', async () => {
    mockInvoke.mockResolvedValue({ data: { status: 'transcribing' }, error: null });
    await expect(invokeTranscription(RECORDING)).rejects.toMatchObject({ code: 'server_error' });
    mockInvoke.mockResolvedValue({ data: null, error: null });
    await expect(invokeTranscription(RECORDING)).rejects.toMatchObject({ code: 'server_error' });
  });
});

describe('readFunctionError', () => {
  it('defaults to server_error when there is no status at all', async () => {
    const error = await readFunctionError({});
    expect(error.code).toBe('server_error');
    expect(error.status).toBeNull();
  });
});

describe('transcriptionErrorMessage', () => {
  it('gives distinct, human copy per failure', () => {
    expect(transcriptionErrorMessage(new TranscriptionError('conflict', 'x'))).toMatch(/already being transcribed/i);
    expect(transcriptionErrorMessage(new TranscriptionError('forbidden', 'x'))).toMatch(/only the coach/i);
    expect(transcriptionErrorMessage(new Error('boom'))).toMatch(/something went wrong/i);
  });
});
