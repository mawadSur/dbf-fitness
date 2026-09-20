// Same-directory tests for the portable pipeline logic: status machine boundaries, guard ordering
// and failure bookkeeping, with a recording fake store (no database, no Deno). The cross-tree suite
// in src/services/transcription/pipeline.test.ts covers the happy path; these pin the edges.
import type { AsrAdapter } from '../_shared/asr';
import type { Drafter, NoteChecklist } from '../_shared/drafter';
import {
  isClaimStale,
  isStoragePathOwnedBy,
  mapPipelineError,
  parseRequestBody,
  PipelineError,
  rejectStatus,
  runTranscriptionPipeline,
  sanitizeErrorMessage,
  SIGNED_URL_TTL_SECONDS,
  TRANSCRIPTION_LEASE_MS,
  type PipelineStore,
  type RecordingRecord,
} from './logic';

const COACH = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const REC = '33333333-3333-3333-3333-333333333333';
const NOW = Date.parse('2026-09-19T12:00:00.000Z');

const checklist: NoteChecklist = { title: 'T', items: [{ kind: 'exercise', text: 'Squat' }] } as unknown as NoteChecklist;

function harness(overrides: Partial<RecordingRecord> = {}, opts: { role?: boolean; manage?: boolean; claim?: boolean } = {}) {
  const log: string[] = [];
  const record: RecordingRecord = {
    id: REC,
    uploaded_by: COACH,
    live_class_id: null,
    storage_path: `${COACH}/${REC}/a.mp4`,
    status: 'uploading',
    claimed_at: null,
    ...overrides,
  };
  const claimArgs: unknown[][] = [];
  const failures: string[] = [];
  const store: PipelineStore = {
    loadRecording: async () => (log.push('load'), record),
    callerCanManageRecording: async () => (log.push('manage'), opts.manage ?? true),
    callerIsCoachOrAdmin: async () => (log.push('role'), opts.role ?? true),
    claimForTranscription: async (...args) => (log.push('claim'), claimArgs.push(args), opts.claim ?? true),
    createSignedUrl: async (_p, ttl) => (log.push(`sign:${ttl}`), 'https://signed.example/x?token=abc'),
    saveTranscript: async () => void log.push('transcript'),
    saveDraftNote: async () => (log.push('note'), 'note-1'),
    setStatus: async (_id, status) => void log.push(`status:${status}`),
    markFailed: async (_id, message) => (log.push('failed'), void failures.push(message)),
    loadClassTitle: async () => null,
  };
  const asr: AsrAdapter = {
    provider: 'fake-asr',
    transcribe: jest.fn(async () => ({ rawText: 'hello world', segments: [] })),
  } as unknown as AsrAdapter;
  const drafter: Drafter = { provider: 'fake-drafter', draft: jest.fn(async () => checklist) } as unknown as Drafter;
  const run = (callerId = COACH) =>
    runTranscriptionPipeline({ recordingId: REC, callerId, store, asr, drafter, now: () => NOW });
  return { log, run, claimArgs, failures, asr, drafter };
}

describe('lease boundary', () => {
  const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();

  it('is live one millisecond before the lease elapses and stale exactly at it', () => {
    expect(isClaimStale(at(TRANSCRIPTION_LEASE_MS - 1), NOW)).toBe(false);
    expect(isClaimStale(at(TRANSCRIPTION_LEASE_MS), NOW)).toBe(true);
  });

  it('a claim stamped in the future is live, an empty string or garbage is stale', () => {
    expect(isClaimStale(at(-60_000), NOW)).toBe(false);
    expect(isClaimStale('', NOW)).toBe(true);
    expect(isClaimStale('yesterday-ish', NOW)).toBe(true);
    expect(isClaimStale(undefined, NOW)).toBe(true);
  });

  it('rejectStatus: transcribing without lease info is always a 409, with a stale claim it may start', () => {
    expect(rejectStatus('transcribing')?.code).toBe('conflict');
    expect(rejectStatus('transcribing', { claimedAt: at(TRANSCRIPTION_LEASE_MS - 1), now: NOW })?.code).toBe('conflict');
    expect(rejectStatus('transcribing', { claimedAt: at(TRANSCRIPTION_LEASE_MS), now: NOW })).toBeNull();
  });

  it.each(['draft', 'published'] as const)('never restarts %s even with an ancient claim', (status) => {
    expect(rejectStatus(status, { claimedAt: null, now: NOW })?.code).toBe('conflict');
  });
});

describe('isStoragePathOwnedBy edges', () => {
  it('accepts a path of exactly 512 characters and rejects 513', () => {
    const prefix = `${COACH}/`;
    expect(isStoragePathOwnedBy(prefix + 'a'.repeat(512 - prefix.length), COACH)).toBe(true);
    expect(isStoragePathOwnedBy(prefix + 'a'.repeat(513 - prefix.length), COACH)).toBe(false);
  });

  it('is exact on the prefix: an upper-case key does not match a lower-case uploader', () => {
    const lower = 'abcdefab-abcd-abcd-abcd-abcdefabcdef';
    expect(isStoragePathOwnedBy(`${lower}/x`, lower)).toBe(true);
    expect(isStoragePathOwnedBy(`${lower.toUpperCase()}/x`, lower)).toBe(false);
  });

  it('refuses a dot-dot even when it is a substring of a file name', () => {
    expect(isStoragePathOwnedBy(`${COACH}/a..b.mp4`, COACH)).toBe(false);
  });
});

describe('parseRequestBody / mapPipelineError', () => {
  it('accepts an upper-case uuid and rejects a uuid with trailing whitespace', () => {
    expect(parseRequestBody({ recording_id: REC.toUpperCase() }).recordingId).toBe(REC.toUpperCase());
    expect(() => parseRequestBody({ recording_id: `${REC} ` })).toThrow(PipelineError);
  });

  it('exposes the message for typed errors and nothing for unknown ones', () => {
    expect(mapPipelineError(new PipelineError('forbidden', 'nope'))).toEqual({
      status: 403,
      body: { error: 'forbidden', message: 'nope' },
    });
    expect(mapPipelineError(new Error('db password is hunter2'))).toEqual({ status: 500, body: { error: 'server_error' } });
    expect(mapPipelineError('boom')).toEqual({ status: 500, body: { error: 'server_error' } });
  });
});

describe('sanitizeErrorMessage edges', () => {
  it('leaves a message of exactly the limit untouched and truncates one longer with an ellipsis', () => {
    expect(sanitizeErrorMessage('a'.repeat(500))).toHaveLength(500);
    const long = sanitizeErrorMessage('a'.repeat(501));
    expect(long).toHaveLength(500);
    expect(long.endsWith('…')).toBe(true);
  });

  it('falls back for empty, whitespace-only and non-string values', () => {
    expect(sanitizeErrorMessage('')).toBe('unknown error');
    expect(sanitizeErrorMessage('   \n ')).toBe('unknown error');
    expect(sanitizeErrorMessage(undefined)).toBe('unknown error');
  });

  it('redacts a URL that carries a token and a key-shaped secret in the same message', () => {
    const out = sanitizeErrorMessage(new Error('GET https://x.co/o?token=abc failed with sk-live_ABCDEFGH12345'));
    expect(out).not.toContain('token=abc');
    expect(out).not.toContain('ABCDEFGH12345');
  });
});

describe('runTranscriptionPipeline guards and ordering', () => {
  it('checks uploader, then database ownership, then role, and writes nothing before all pass', async () => {
    const h = harness({}, { role: false });
    await expect(h.run()).rejects.toMatchObject({ code: 'forbidden' });
    expect(h.log).toEqual(['load', 'manage', 'role']);
  });

  it('a non-uploader is refused before any predicate call', async () => {
    const h = harness();
    await expect(h.run(OTHER)).rejects.toMatchObject({ code: 'forbidden' });
    expect(h.log).toEqual(['load']);
  });

  it('a conflict on a finished recording leaves the row untouched (no claim, no markFailed)', async () => {
    const h = harness({ status: 'published' });
    await expect(h.run()).rejects.toMatchObject({ code: 'conflict' });
    expect(h.log).not.toContain('claim');
    expect(h.log).not.toContain('failed');
  });

  it('claims with the lease cut-off derived from the injected clock', async () => {
    const h = harness();
    await h.run();
    expect(h.claimArgs[0][1]).toEqual(['uploading', 'failed']);
    expect(h.claimArgs[0][2]).toBe(new Date(NOW - TRANSCRIPTION_LEASE_MS).toISOString());
  });

  it('runs claim -> sign -> transcript -> note -> draft in order and returns the provider names', async () => {
    const h = harness();
    const result = await h.run();
    expect(h.log).toEqual([
      'load', 'manage', 'role', 'claim', `sign:${SIGNED_URL_TTL_SECONDS}`, 'transcript', 'note', 'status:draft',
    ]);
    expect(result).toMatchObject({
      status: 'draft', note_id: 'note-1', transcript_chars: 11, item_count: 1,
      asr_provider: 'fake-asr', drafter_provider: 'fake-drafter',
    });
  });

  it('a storage path outside the uploader prefix fails the run BEFORE a signed URL is minted', async () => {
    const h = harness({ storage_path: `${OTHER}/${REC}/a.mp4` });
    await expect(h.run()).rejects.toMatchObject({ code: 'pipeline_failed' });
    expect(h.log.some((entry) => entry.startsWith('sign'))).toBe(false);
    expect(h.failures).toHaveLength(1);
    expect(h.asr.transcribe).not.toHaveBeenCalled();
  });

  it('a whitespace-only transcript fails the run and never reaches the drafter', async () => {
    const h = harness();
    (h.asr.transcribe as jest.Mock).mockResolvedValue({ rawText: '  \n', segments: [] });
    await expect(h.run()).rejects.toMatchObject({ code: 'pipeline_failed' });
    expect(h.drafter.draft).not.toHaveBeenCalled();
    expect(h.log).not.toContain('transcript');
  });

  it('wraps a non-PipelineError as pipeline_failed with a redacted, already-marked message', async () => {
    const h = harness();
    (h.asr.transcribe as jest.Mock).mockRejectedValue(new Error('fetch https://signed.example/x?token=abc failed'));
    const error = await h.run().catch((caught) => caught);
    expect(error).toBeInstanceOf(PipelineError);
    expect(error.code).toBe('pipeline_failed');
    expect(error.alreadyMarkedFailed).toBe(true);
    expect(error.message).not.toContain('token=abc');
    expect(h.failures[0]).toBe(error.message);
  });
});
