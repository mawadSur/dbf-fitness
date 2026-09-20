import { createMockAsr } from '../../../supabase/functions/_shared/asr';
import { createMockDrafter, validateChecklist } from '../../../supabase/functions/_shared/drafter';
import type { NoteChecklist } from '../../../supabase/functions/_shared/drafter';
import {
  mapPipelineError,
  parseRequestBody,
  PipelineError,
  isClaimStale,
  isStoragePathOwnedBy,
  rejectMethod,
  rejectStatus,
  runTranscriptionPipeline,
  sanitizeErrorMessage,
  SIGNED_URL_TTL_SECONDS,
  STARTABLE_STATUSES,
  TRANSCRIPTION_LEASE_MS,
  type PipelineStore,
  type RecordingRecord,
  type RecordingStatus,
} from '../../../supabase/functions/transcribe-recording/logic';

const COACH = '11111111-1111-1111-1111-111111111111';
const MEMBER = '22222222-2222-2222-2222-222222222222';
const RECORDING = '33333333-3333-3333-3333-333333333333';
const CLASS = '88888888-8888-8888-8888-888888888888';

type FakeState = {
  recording: RecordingRecord | null;
  callerEntitled: boolean;
  /** Mirrors the rpc public.is_coach_or_admin() the Edge Function calls as the caller. */
  callerIsCoach: boolean;
  transcripts: { recordingId: string; rawText: string }[];
  notes: { recordingId: string; coachId: string; checklist: NoteChecklist }[];
  failures: string[];
  signedUrls: number;
  claims: number;
  /** The `staleClaimBefore` cut-off the last claim attempt was made with. */
  lastStaleCutoff: string | null;
};

function makeFakeStore(overrides: Partial<FakeState> = {}) {
  const state: FakeState = {
    recording: {
      id: RECORDING,
      uploaded_by: COACH,
      live_class_id: CLASS,
      storage_path: `${COACH}/${RECORDING}/session.mp4`,
      status: 'uploading',
      claimed_at: null,
    },
    callerEntitled: true,
    callerIsCoach: true,
    transcripts: [],
    notes: [],
    failures: [],
    signedUrls: 0,
    claims: 0,
    lastStaleCutoff: null,
    ...overrides,
  };

  const store: PipelineStore = {
    loadRecording: async () => state.recording,
    callerCanManageRecording: async () => state.callerEntitled,
    callerIsCoachOrAdmin: async () => state.callerIsCoach,
    // Mirrors the SQL the Edge Function issues: claim from `from`, or take over a 'transcribing'
    // row whose lease started before the cut-off (or has no lease at all).
    claimForTranscription: async (_id, from, staleClaimBefore) => {
      state.lastStaleCutoff = staleClaimBefore;
      const current = state.recording;
      if (!current) return false;
      const staleTakeover =
        current.status === 'transcribing' &&
        (current.claimed_at === null || Date.parse(current.claimed_at) < Date.parse(staleClaimBefore));
      if (!from.includes(current.status) && !staleTakeover) return false;
      state.claims += 1;
      state.recording = { ...current, status: 'transcribing', claimed_at: new Date().toISOString() };
      return true;
    },
    createSignedUrl: async (path, ttl) => {
      state.signedUrls += 1;
      return `https://storage.test/sign/${path}?ttl=${ttl}&token=super-secret`;
    },
    saveTranscript: async (recordingId, rawText) => {
      state.transcripts.push({ recordingId, rawText });
    },
    saveDraftNote: async (recordingId, coachId, checklist) => {
      state.notes.push({ recordingId, coachId, checklist });
      return 'note-1';
    },
    setStatus: async (_id, status) => {
      if (state.recording) state.recording = { ...state.recording, status, claimed_at: null };
    },
    markFailed: async (_id, message) => {
      state.failures.push(message);
      if (state.recording) state.recording = { ...state.recording, status: 'failed', claimed_at: null };
    },
    loadClassTitle: async () => 'Saturday Conditioning',
  };

  return { state, store };
}

const run = (store: PipelineStore, callerId = COACH) =>
  runTranscriptionPipeline({
    recordingId: RECORDING,
    callerId,
    store,
    asr: createMockAsr(),
    drafter: createMockDrafter(),
  });

describe('rejectMethod', () => {
  it('allows POST and refuses everything else with 405', () => {
    expect(rejectMethod('POST')).toBeNull();
    for (const method of ['GET', 'PUT', 'DELETE', 'OPTIONS', 'HEAD']) {
      expect(mapPipelineError(rejectMethod(method)).status).toBe(405);
    }
  });
});

describe('parseRequestBody', () => {
  it('accepts a uuid recording_id', () => {
    expect(parseRequestBody({ recording_id: RECORDING })).toEqual({ recordingId: RECORDING });
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'x'],
    ['no recording_id', {}],
    ['a non-uuid id', { recording_id: 'abc' }],
    ['a numeric id', { recording_id: 42 }],
    ['a SQL-ish id', { recording_id: "' or 1=1--" }],
  ])('rejects %s with 400', (_label, body) => {
    let thrown: unknown;
    try {
      parseRequestBody(body);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(PipelineError);
    expect(mapPipelineError(thrown).status).toBe(400);
  });
});

describe('rejectStatus', () => {
  it('starts from uploading or failed (retry)', () => {
    expect(STARTABLE_STATUSES).toEqual(['uploading', 'failed']);
    expect(rejectStatus('uploading')).toBeNull();
    expect(rejectStatus('failed')).toBeNull();
  });

  it.each<[RecordingStatus, RegExp]>([
    ['transcribing', /already being transcribed/],
    ['draft', /already been transcribed/],
    ['published', /already been transcribed/],
  ])('refuses %s with 409', (status, matcher) => {
    const rejection = rejectStatus(status);
    expect(rejection).not.toBeNull();
    expect(mapPipelineError(rejection).status).toBe(409);
    expect(rejection?.message).toMatch(matcher);
  });

  it('keeps refusing a transcribing recording whose lease is still live', () => {
    const now = Date.UTC(2026, 8, 19, 12, 0, 0);
    const claimedAt = new Date(now - (TRANSCRIPTION_LEASE_MS - 1000)).toISOString();
    expect(mapPipelineError(rejectStatus('transcribing', { claimedAt, now })).status).toBe(409);
  });

  it('lets a transcribing recording be taken over once its lease has expired', () => {
    const now = Date.UTC(2026, 8, 19, 12, 0, 0);
    const claimedAt = new Date(now - TRANSCRIPTION_LEASE_MS).toISOString();
    expect(rejectStatus('transcribing', { claimedAt, now })).toBeNull();
    // A killed run that never stamped a lease (pre-lease rows) is recoverable too.
    expect(rejectStatus('transcribing', { claimedAt: null, now })).toBeNull();
  });

  it('never re-runs a finished recording, however old the lease is', () => {
    const now = Date.UTC(2026, 8, 19, 12, 0, 0);
    for (const status of ['draft', 'published'] as RecordingStatus[]) {
      expect(mapPipelineError(rejectStatus(status, { claimedAt: null, now })).status).toBe(409);
    }
  });
});

describe('isClaimStale', () => {
  const now = Date.UTC(2026, 8, 19, 12, 0, 0);

  it('is false while the lease is running and true once it has elapsed', () => {
    expect(isClaimStale(new Date(now - 60_000).toISOString(), now)).toBe(false);
    expect(isClaimStale(new Date(now - (TRANSCRIPTION_LEASE_MS - 1)).toISOString(), now)).toBe(false);
    expect(isClaimStale(new Date(now - TRANSCRIPTION_LEASE_MS).toISOString(), now)).toBe(true);
    expect(isClaimStale(new Date(now - 10 * TRANSCRIPTION_LEASE_MS).toISOString(), now)).toBe(true);
  });

  it('treats a missing or unreadable claim as abandoned', () => {
    expect(isClaimStale(null, now)).toBe(true);
    expect(isClaimStale(undefined, now)).toBe(true);
    expect(isClaimStale('', now)).toBe(true);
    expect(isClaimStale('not a date', now)).toBe(true);
  });

  it('is 15 minutes', () => {
    expect(TRANSCRIPTION_LEASE_MS).toBe(15 * 60 * 1000);
  });
});

describe('isStoragePathOwnedBy', () => {
  // This predicate is the last gate before a SERVICE-ROLE signed URL is minted, so it is what
  // stops a coach pointing their own recording row at another tenant's private object key.
  const OTHER = '99999999-9999-9999-9999-999999999999';

  it('accepts a key under the uploader’s own uuid prefix', () => {
    expect(isStoragePathOwnedBy(`${COACH}/session-1/take.mp4`, COACH)).toBe(true);
  });

  it('rejects another account’s prefix', () => {
    expect(isStoragePathOwnedBy(`${OTHER}/private/victim.m4a`, COACH)).toBe(false);
  });

  it('rejects a prefix that merely starts with the uuid but is a different folder', () => {
    expect(isStoragePathOwnedBy(`${COACH}-evil/take.mp4`, COACH)).toBe(false);
  });

  it('rejects traversal, even inside the uploader’s own prefix', () => {
    expect(isStoragePathOwnedBy(`${COACH}/../${OTHER}/victim.m4a`, COACH)).toBe(false);
    expect(isStoragePathOwnedBy(`${COACH}/..`, COACH)).toBe(false);
  });

  it('rejects a bare uuid with no object under it', () => {
    expect(isStoragePathOwnedBy(COACH, COACH)).toBe(false);
  });

  it('rejects empty, oversized and non-string keys', () => {
    expect(isStoragePathOwnedBy('', COACH)).toBe(false);
    expect(isStoragePathOwnedBy(`${COACH}/${'x'.repeat(512)}`, COACH)).toBe(false);
    expect(isStoragePathOwnedBy(undefined as unknown as string, COACH)).toBe(false);
  });

  it('rejects when the uploader id is not a uuid, so a forged owner cannot match a crafted key', () => {
    expect(isStoragePathOwnedBy('notauuid/take.mp4', 'notauuid')).toBe(false);
    expect(isStoragePathOwnedBy('/take.mp4', '')).toBe(false);
  });
});

describe('sanitizeErrorMessage', () => {
  it('drops URLs, because signed Storage URLs are bearer credentials', () => {
    const message = sanitizeErrorMessage(
      new Error('fetch failed for https://x.supabase.co/storage/v1/object/sign/a?token=abc.def')
    );
    expect(message).toBe('fetch failed for [url]');
    expect(message).not.toContain('token');
  });

  it('masks JWT-shaped and key-shaped strings', () => {
    expect(sanitizeErrorMessage(new Error('bad token eyJhbGciOiJIUzI1NiJ9.payload.sig here'))).toContain('[redacted]');
    expect(sanitizeErrorMessage(new Error('rejected sk-ant-abcdefgh1234'))).toContain('[redacted]');
  });

  it('truncates to the column budget and collapses whitespace', () => {
    const message = sanitizeErrorMessage(new Error('x'.repeat(900)));
    expect(message).toHaveLength(500);
    expect(sanitizeErrorMessage(new Error('a\n\n  b'))).toBe('a b');
  });

  it('copes with non-Error throws', () => {
    expect(sanitizeErrorMessage('plain string')).toBe('plain string');
    expect(sanitizeErrorMessage(undefined)).toBe('unknown error');
    expect(sanitizeErrorMessage(new Error('   '))).toBe('unknown error');
  });
});

describe('mapPipelineError', () => {
  it('maps every code to its HTTP status and hides unknown errors as 500', () => {
    expect(mapPipelineError(new PipelineError('not_found', 'x')).status).toBe(404);
    expect(mapPipelineError(new PipelineError('forbidden', 'x')).status).toBe(403);
    expect(mapPipelineError(new PipelineError('pipeline_failed', 'x')).status).toBe(422);
    const unknown = mapPipelineError(new Error('internal detail: password=hunter2'));
    expect(unknown.status).toBe(500);
    expect(JSON.stringify(unknown.body)).not.toContain('hunter2');
  });
});

describe('runTranscriptionPipeline', () => {
  it('runs upload -> transcript -> draft and reports the providers', async () => {
    const { state, store } = makeFakeStore();
    const result = await run(store);

    expect(result.status).toBe('draft');
    expect(result.note_id).toBe('note-1');
    expect(result.asr_provider).toBe('mock');
    expect(result.drafter_provider).toBe('mock');
    expect(state.recording?.status).toBe('draft');
    expect(state.transcripts).toHaveLength(1);
    expect(state.notes).toHaveLength(1);
    expect(state.failures).toEqual([]);
  });

  it('stores a checklist that satisfies the shared validator (and so the SQL CHECK)', async () => {
    const { state, store } = makeFakeStore();
    await run(store);
    expect(validateChecklist(state.notes[0].checklist).ok).toBe(true);
    expect(state.notes[0].checklist.title).toBe('Saturday Conditioning');
  });

  it('mints a short-lived signed URL exactly once', async () => {
    const { state, store } = makeFakeStore();
    let seenTtl = 0;
    const spying: PipelineStore = {
      ...store,
      createSignedUrl: async (path, ttl) => {
        seenTtl = ttl;
        return store.createSignedUrl(path, ttl);
      },
    };
    await run(spying);
    expect(state.signedUrls).toBe(1);
    expect(seenTtl).toBe(SIGNED_URL_TTL_SECONDS);
    expect(SIGNED_URL_TTL_SECONDS).toBeLessThanOrEqual(900);
  });

  it('404s an unknown recording without touching anything', async () => {
    const { state, store } = makeFakeStore({ recording: null });
    await expect(run(store)).rejects.toMatchObject({ code: 'not_found' });
    expect(state.claims).toBe(0);
  });

  it('403s a caller who is not the uploader', async () => {
    const { state, store } = makeFakeStore();
    await expect(run(store, MEMBER)).rejects.toMatchObject({ code: 'forbidden' });
    expect(state.claims).toBe(0);
    expect(state.recording?.status).toBe('uploading');
  });

  it('403s when the database predicate disagrees, even if uploaded_by matches', async () => {
    const { store } = makeFakeStore({ callerEntitled: false });
    await expect(run(store)).rejects.toMatchObject({ code: 'forbidden' });
  });

  it.each<RecordingStatus>(['transcribing', 'draft', 'published'])('409s a recording already at %s', async (status) => {
    const { state, store } = makeFakeStore();
    state.recording = {
      ...(state.recording as RecordingRecord),
      status,
      // A live lease, i.e. a run that really is in progress.
      claimed_at: status === 'transcribing' ? new Date().toISOString() : null,
    };
    await expect(run(store)).rejects.toMatchObject({ code: 'conflict' });
    expect(state.claims).toBe(0);
  });

  it('recovers a recording stranded in transcribing by a killed run (expired lease)', async () => {
    const { state, store } = makeFakeStore();
    state.recording = {
      ...(state.recording as RecordingRecord),
      status: 'transcribing',
      claimed_at: new Date(Date.now() - TRANSCRIPTION_LEASE_MS - 1000).toISOString(),
    };

    const result = await run(store);

    expect(result.status).toBe('draft');
    expect(state.claims).toBe(1);
    expect(state.recording?.status).toBe('draft');
    expect(state.recording?.claimed_at).toBeNull();
  });

  it('passes the compare-and-set the same lease cut-off the status check used', async () => {
    const now = Date.UTC(2026, 8, 19, 12, 0, 0);
    const { state, store } = makeFakeStore();
    await runTranscriptionPipeline({
      recordingId: RECORDING,
      callerId: COACH,
      store,
      asr: createMockAsr(),
      drafter: createMockDrafter(),
      now: () => now,
    });
    expect(state.lastStaleCutoff).toBe(new Date(now - TRANSCRIPTION_LEASE_MS).toISOString());
  });

  it('409s a lease that was renewed between the read and the claim', async () => {
    const { state, store } = makeFakeStore();
    state.recording = {
      ...(state.recording as RecordingRecord),
      status: 'transcribing',
      claimed_at: new Date(Date.now() - TRANSCRIPTION_LEASE_MS - 1000).toISOString(),
    };
    const raced: PipelineStore = {
      ...store,
      claimForTranscription: async () => {
        // Another invocation took the expired lease over first, so this UPDATE matches no row.
        state.recording = { ...(state.recording as RecordingRecord), claimed_at: new Date().toISOString() };
        return false;
      },
    };
    await expect(run(raced)).rejects.toMatchObject({ code: 'conflict' });
    expect(state.failures).toEqual([]);
  });

  it('409s the loser of a concurrent claim without marking the run failed', async () => {
    const { state, store } = makeFakeStore();
    const losing: PipelineStore = { ...store, claimForTranscription: async () => false };
    await expect(run(losing)).rejects.toMatchObject({ code: 'conflict' });
    expect(state.failures).toEqual([]);
  });

  it('claims only from uploading/failed, so a retry after a failure is allowed', async () => {
    const { state, store } = makeFakeStore();
    state.recording = { ...(state.recording as RecordingRecord), status: 'failed' };
    const result = await run(store);
    expect(result.status).toBe('draft');
    expect(state.claims).toBe(1);
  });

  it('fails a recording with no uploaded file and records why', async () => {
    const { state, store } = makeFakeStore();
    state.recording = { ...(state.recording as RecordingRecord), storage_path: null };
    await expect(run(store)).rejects.toMatchObject({ code: 'pipeline_failed' });
    expect(state.recording?.status).toBe('failed');
    expect(state.failures).toEqual(['recording has no uploaded file yet']);
  });

  it('fails and redacts when the ASR adapter throws with a URL in the message', async () => {
    const { state, store } = makeFakeStore();
    await expect(
      runTranscriptionPipeline({
        recordingId: RECORDING,
        callerId: COACH,
        store,
        asr: {
          provider: 'deepgram',
          transcribe: async () => {
            throw new Error('could not fetch https://storage.test/sign/x?token=super-secret');
          },
        },
        drafter: createMockDrafter(),
      })
    ).rejects.toMatchObject({ code: 'pipeline_failed' });

    expect(state.recording?.status).toBe('failed');
    expect(state.failures[0]).toBe('could not fetch [url]');
    expect(state.failures[0]).not.toContain('super-secret');
  });

  it('fails when the drafter cannot produce a valid checklist, leaving the transcript in place', async () => {
    const { state, store } = makeFakeStore();
    await expect(
      runTranscriptionPipeline({
        recordingId: RECORDING,
        callerId: COACH,
        store,
        asr: createMockAsr(),
        drafter: {
          provider: 'anthropic',
          draft: async () => {
            throw new Error('notes drafter returned an invalid checklist: items[0].kind is wrong');
          },
        },
      })
    ).rejects.toMatchObject({ code: 'pipeline_failed' });

    expect(state.transcripts).toHaveLength(1);
    expect(state.recording?.status).toBe('failed');
    expect(state.notes).toHaveLength(0);
  });

  it('fails an empty transcript rather than drafting from nothing', async () => {
    const { state, store } = makeFakeStore();
    await expect(
      runTranscriptionPipeline({
        recordingId: RECORDING,
        callerId: COACH,
        store,
        asr: { provider: 'mock', transcribe: async () => ({ provider: 'mock', rawText: '  ', segments: [] }) },
        drafter: createMockDrafter(),
      })
    ).rejects.toMatchObject({ code: 'pipeline_failed' });
    expect(state.failures).toEqual(['the recording produced an empty transcript']);
  });

  it('still surfaces the original failure when the bookkeeping write itself fails', async () => {
    const { store } = makeFakeStore();
    const broken: PipelineStore = {
      ...store,
      createSignedUrl: async () => {
        throw new Error('storage is down');
      },
      markFailed: async () => {
        throw new Error('database is down too');
      },
    };
    await expect(run(broken)).rejects.toMatchObject({ code: 'pipeline_failed', message: 'storage is down' });
  });
});
