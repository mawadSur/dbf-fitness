import { supabase } from '../../services/supabase/client';
import { invokeTranscription } from '../../services/transcription';
import {
  fetchCheckedKeys,
  fetchCoachClasses,
  fetchCoachRecordings,
  fetchNotesViewer,
  fetchPublishedRecordings,
  fetchRecordingDetail,
  publishNote,
  retryTranscription,
  saveEditedContent,
  setItemChecked,
  toRecordingSummary,
} from './api';

type Call = [string, unknown[]];
type Recorder = { calls: Call[]; table: string };

const recorders: Recorder[] = [];
const results: Record<string, { data?: unknown; error?: unknown }> = {};

function chain(table: string) {
  const recorder: Recorder = { calls: [], table };
  recorders.push(recorder);
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
            Promise.resolve({ data: null, error: null, ...results[table] }).then(resolve, reject);
        }
        return (...args: unknown[]) => {
          recorder.calls.push([prop, args]);
          return proxy;
        };
      },
    }
  );
  return proxy;
}

jest.mock('../../services/supabase/client', () => ({
  supabase: { auth: { getSession: jest.fn() }, from: jest.fn() },
}));
jest.mock('../../services/transcription', () => ({ invokeTranscription: jest.fn() }));

const getSession = supabase.auth.getSession as unknown as jest.Mock;
const from = supabase.from as unknown as jest.Mock;

const callsFor = (table: string) => recorders.filter((r) => r.table === table).flatMap((r) => r.calls);
const NOTE_JSON = JSON.stringify({ title: 'T', items: [{ key: 'a', kind: 'exercise', text: 'Squat' }] });

beforeEach(() => {
  jest.clearAllMocks();
  recorders.length = 0;
  for (const key of Object.keys(results)) delete results[key];
  getSession.mockResolvedValue({ data: { session: { user: { id: 'me' } } } });
  from.mockImplementation((table: string) => chain(table));
});

describe('recordings reads never select storage_path or transcripts', () => {
  it('coach list: my uploads, newest first, capped at 100, has_file instead of storage_path', async () => {
    await fetchCoachRecordings('coach-1');
    const calls = callsFor('recordings');
    const select = calls.find(([m]) => m === 'select')?.[1][0] as string;
    expect(select).toContain('has_file');
    expect(select).not.toContain('storage_path');
    expect(calls.slice(1)).toEqual([
      ['eq', ['uploaded_by', 'coach-1']],
      ['order', ['created_at', { ascending: false }]],
      ['limit', [100]],
    ]);
    expect(from).not.toHaveBeenCalledWith('transcripts');
  });

  it('member list filters status = published', async () => {
    await fetchPublishedRecordings();
    expect(callsFor('recordings').map(([m, a]) => [m, a[0]])).toContainEqual(['eq', 'status']);
    expect(callsFor('recordings')).toContainEqual(['eq', ['status', 'published']]);
  });

  it('propagates errors', async () => {
    results.recordings = { error: new Error('rls') };
    await expect(fetchPublishedRecordings()).rejects.toThrow('rls');
    await expect(fetchCoachRecordings('c')).rejects.toThrow('rls');
  });
});

describe('toRecordingSummary mapping', () => {
  const base = {
    id: 'r1',
    status: 'draft' as const,
    error_message: null,
    created_at: '2026-01-01',
    live_class_id: 'c1',
    has_file: true,
    claimed_at: null,
  };

  it('accepts an object embed, an array embed and a missing embed', () => {
    expect(toRecordingSummary({ ...base, live_classes: { title: 'HIIT', starts_at: 's' } })).toMatchObject({
      classTitle: 'HIIT',
      classStartsAt: 's',
    });
    expect(toRecordingSummary({ ...base, live_classes: [{ title: 'Yoga' }] }).classTitle).toBe('Yoga');
    expect(toRecordingSummary({ ...base, live_classes: null })).toMatchObject({ classTitle: null, classStartsAt: null });
  });

  it('has_file is true only for a literal true (null/undefined/garbage are false)', () => {
    expect(toRecordingSummary({ ...base, live_classes: null, has_file: null }).hasFile).toBe(false);
    expect(toRecordingSummary({ ...base, live_classes: null, has_file: true }).hasFile).toBe(true);
  });

  it('non-string embed fields become null', () => {
    expect(toRecordingSummary({ ...base, live_classes: { title: 5, starts_at: {} } })).toMatchObject({
      classTitle: null,
      classStartsAt: null,
    });
  });
});

describe('fetchRecordingDetail', () => {
  it('returns null for a malformed uuid (22P02) but throws other errors', async () => {
    results.recordings = { error: { code: '22P02' } };
    await expect(fetchRecordingDetail('nope')).resolves.toBeNull();
    results.recordings = { error: { code: '42501', message: 'x' } };
    await expect(fetchRecordingDetail('r1')).rejects.toEqual({ code: '42501', message: 'x' });
  });

  it('returns null and does not fetch the note when the recording is invisible', async () => {
    results.recordings = { data: null };
    await expect(fetchRecordingDetail('r1')).resolves.toBeNull();
    expect(from).not.toHaveBeenCalledWith('workout_notes');
  });

  it('reads only note columns (not the transcript) for the newest note and prefers edited over draft', async () => {
    results.recordings = {
      data: {
        id: 'r1', status: 'draft', error_message: null, created_at: 'c', live_class_id: null,
        has_file: true, claimed_at: null, live_classes: null,
      },
    };
    results.workout_notes = {
      data: { id: 'n1', draft_content: JSON.stringify({ title: 'Draft', items: [] }), edited_content: NOTE_JSON, published_at: 'p' },
    };
    const detail = await fetchRecordingDetail('r1');
    expect(detail?.noteId).toBe('n1');
    expect(detail?.checklist?.title).toBe('T');
    expect(detail?.publishedAt).toBe('p');
    expect(callsFor('workout_notes')).toEqual([
      ['select', ['id, draft_content, edited_content, published_at']],
      ['eq', ['recording_id', 'r1']],
      ['order', ['created_at', { ascending: false }]],
      ['limit', [1]],
      ['maybeSingle', []],
    ]);
    expect(from).not.toHaveBeenCalledWith('transcripts');
  });

  it('falls back to the draft when edited_content is unparseable', async () => {
    results.recordings = {
      data: { id: 'r1', status: 'draft', error_message: null, created_at: 'c', live_class_id: null, has_file: false, claimed_at: null, live_classes: null },
    };
    results.workout_notes = {
      data: { id: 'n1', draft_content: NOTE_JSON, edited_content: '{not json', published_at: null },
    };
    expect((await fetchRecordingDetail('r1'))?.checklist?.title).toBe('T');
  });
});

describe('fetchNotesViewer', () => {
  it('reads only id, role for the session user; isCoach is anything but member', async () => {
    results.profiles = { data: { id: 'me', role: 'admin' } };
    await expect(fetchNotesViewer()).resolves.toEqual({ id: 'me', role: 'admin', isCoach: true });
    expect(callsFor('profiles')).toEqual([
      ['select', ['id, role']],
      ['eq', ['id', 'me']],
      ['maybeSingle', []],
    ]);
    results.profiles = { data: { id: 'me', role: 'member' } };
    expect((await fetchNotesViewer())?.isCoach).toBe(false);
  });

  it('null when signed out or profile missing', async () => {
    results.profiles = { data: null };
    await expect(fetchNotesViewer()).resolves.toBeNull();
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(fetchNotesViewer()).resolves.toBeNull();
  });
});

describe('note writes', () => {
  it('saveEditedContent updates only edited_content on that note id', async () => {
    await saveEditedContent('n1', NOTE_JSON);
    expect(callsFor('workout_notes')).toEqual([
      ['update', [{ edited_content: NOTE_JSON }]],
      ['eq', ['id', 'n1']],
    ]);
  });

  it('publishNote sets edited_content and an ISO published_at, nothing else', async () => {
    await publishNote('n1', NOTE_JSON);
    const [, [payload]] = callsFor('workout_notes')[0];
    const { edited_content: edited, published_at: publishedAt, ...rest } = payload as Record<string, string>;
    expect(edited).toBe(NOTE_JSON);
    expect(new Date(publishedAt).toISOString()).toBe(publishedAt);
    expect(rest).toEqual({});
    expect(callsFor('workout_notes')[1]).toEqual(['eq', ['id', 'n1']]);
  });

  it('write errors are thrown', async () => {
    results.workout_notes = { error: new Error('denied') };
    await expect(saveEditedContent('n', 'j')).rejects.toThrow('denied');
    await expect(publishNote('n', 'j')).rejects.toThrow('denied');
  });

  it('retryTranscription delegates to invokeTranscription(recordingId)', async () => {
    await retryTranscription('r1');
    expect(invokeTranscription).toHaveBeenCalledWith('r1');
  });
});

describe('fetchCoachClasses', () => {
  it('filters by the given coach_id, newest first, limit 50', async () => {
    results.live_classes = { data: [{ id: 'c1' }] };
    await expect(fetchCoachClasses('coach-1')).resolves.toEqual([{ id: 'c1' }]);
    expect(callsFor('live_classes')).toEqual([
      ['select', ['id, title, starts_at, status']],
      ['eq', ['coach_id', 'coach-1']],
      ['order', ['starts_at', { ascending: false }]],
      ['limit', [50]],
    ]);
  });
});

describe('note progress (member-owned rows)', () => {
  it('fetchCheckedKeys filters by note and me; signed-out returns [] without querying', async () => {
    results.workout_note_progress = { data: [{ item_key: 'a' }, { item_key: 'b' }] };
    await expect(fetchCheckedKeys('n1')).resolves.toEqual(['a', 'b']);
    expect(callsFor('workout_note_progress')).toEqual([
      ['select', ['item_key']],
      ['eq', ['note_id', 'n1']],
      ['eq', ['member_id', 'me']],
    ]);
    from.mockClear();
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(fetchCheckedKeys('n1')).resolves.toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it('checking upserts {member_id: me, note_id, item_key, checked_at} on the composite key', async () => {
    await setItemChecked('n1', 'a', true);
    const [[method, [row, options]]] = callsFor('workout_note_progress');
    expect(method).toBe('upsert');
    expect(row).toEqual({ member_id: 'me', note_id: 'n1', item_key: 'a', checked_at: expect.any(String) });
    expect(options).toEqual({ onConflict: 'member_id,note_id,item_key' });
  });

  it('unchecking deletes scoped by member, note and item key', async () => {
    await setItemChecked('n1', 'a', false);
    expect(callsFor('workout_note_progress')).toEqual([
      ['delete', []],
      ['eq', ['member_id', 'me']],
      ['eq', ['note_id', 'n1']],
      ['eq', ['item_key', 'a']],
    ]);
  });

  it('signed out: refuses and sends nothing; errors propagate', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(setItemChecked('n', 'a', true)).rejects.toThrow('Please sign in again.');
    expect(from).not.toHaveBeenCalled();
    getSession.mockResolvedValue({ data: { session: { user: { id: 'me' } } } });
    results.workout_note_progress = { error: new Error('x') };
    await expect(setItemChecked('n', 'a', true)).rejects.toThrow('x');
    await expect(setItemChecked('n', 'a', false)).rejects.toThrow('x');
  });

  it('never sends role or coach_id', async () => {
    await setItemChecked('n1', 'a', true);
    await saveEditedContent('n1', 'j');
    await publishNote('n1', 'j');
    const payloads = recorders
      .flatMap((r) => r.calls)
      .filter(([m]) => m === 'update' || m === 'upsert' || m === 'insert')
      .map(([, a]) => a[0] as Record<string, unknown>);
    expect(payloads).toHaveLength(3);
    for (const p of payloads) {
      expect(p).not.toHaveProperty('role');
      expect(p).not.toHaveProperty('coach_id');
    }
  });
});
