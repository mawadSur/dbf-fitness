import {
  createAsr,
  createDeepgramAsr,
  createMockAsr,
  DEEPGRAM_MODEL,
  DEEPGRAM_URL,
} from '../../../supabase/functions/_shared/asr';
import type { FetchLike } from '../../../supabase/functions/_shared/drafter';

const SIGNED_URL = 'https://storage.example.test/object/sign/recordings/x?token=secret-token';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function deepgramBody(transcript: string, utterances?: { start: number; end: number; transcript: string }[]) {
  return {
    results: {
      channels: [{ alternatives: [{ transcript }] }],
      ...(utterances ? { utterances } : {}),
    },
  };
}

describe('createMockAsr', () => {
  it('is deterministic per recording and performs no network call', async () => {
    const asr = createMockAsr();
    const first = await asr.transcribe({ audioUrl: SIGNED_URL, seed: 'rec-1' });
    const second = await asr.transcribe({ audioUrl: 'totally-different-url', seed: 'rec-1' });
    expect(first).toEqual(second);
    expect(first.provider).toBe('mock');
  });

  it('varies between recordings but always returns at least five segments', async () => {
    const asr = createMockAsr();
    const a = await asr.transcribe({ audioUrl: SIGNED_URL, seed: 'aaaaaaaa' });
    const b = await asr.transcribe({ audioUrl: SIGNED_URL, seed: 'zzzzzzzz' });
    expect(a.segments.length).toBeGreaterThanOrEqual(5);
    expect(b.segments.length).toBeGreaterThanOrEqual(5);
    expect(a.rawText).not.toBe('');
    expect(a.rawText).toBe(a.segments.map((segment) => segment.text).join(' '));
  });

  it('returns segments with increasing, non-overlapping times', async () => {
    const { segments } = await createMockAsr().transcribe({ audioUrl: SIGNED_URL, seed: 'rec-2' });
    for (let index = 1; index < segments.length; index += 1) {
      expect(segments[index].start).toBeGreaterThanOrEqual(segments[index - 1].end);
      expect(segments[index].end).toBeGreaterThan(segments[index].start);
    }
  });
});

describe('createDeepgramAsr', () => {
  it('passes the signed URL in the body and the key as a Token header', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ url, init });
      return jsonResponse(deepgramBody('back squat four by eight'));
    };

    const result = await createDeepgramAsr({ apiKey: 'dg-key-123', fetchImpl }).transcribe({
      audioUrl: SIGNED_URL,
      seed: 'rec-1',
    });

    expect(result.provider).toBe('deepgram');
    expect(result.rawText).toBe('back squat four by eight');
    expect(calls[0].url.startsWith(DEEPGRAM_URL)).toBe(true);
    expect(calls[0].url).toContain(`model=${DEEPGRAM_MODEL}`);
    expect(calls[0].url).not.toContain('dg-key-123');
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Token dg-key-123');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ url: SIGNED_URL });
  });

  it('maps utterances to segments when Deepgram returns them', async () => {
    const fetchImpl: FetchLike = async () =>
      jsonResponse(
        deepgramBody('one two', [
          { start: 0, end: 1.5, transcript: 'one' },
          { start: 1.5, end: 3, transcript: 'two' },
        ])
      );
    const result = await createDeepgramAsr({ apiKey: 'k', fetchImpl }).transcribe({
      audioUrl: SIGNED_URL,
      seed: 's',
    });
    expect(result.segments).toEqual([
      { start: 0, end: 1.5, text: 'one' },
      { start: 1.5, end: 3, text: 'two' },
    ]);
  });

  it('falls back to a single segment when utterances are missing', async () => {
    const fetchImpl: FetchLike = async () => jsonResponse(deepgramBody('just the flat text'));
    const result = await createDeepgramAsr({ apiKey: 'k', fetchImpl }).transcribe({
      audioUrl: SIGNED_URL,
      seed: 's',
    });
    expect(result.segments).toEqual([{ start: 0, end: 0, text: 'just the flat text' }]);
  });

  it('reports only the status on an HTTP error, so the signed URL cannot leak through it', async () => {
    const fetchImpl: FetchLike = async () => jsonResponse({ err_msg: `could not fetch ${SIGNED_URL}` }, 403);
    await expect(
      createDeepgramAsr({ apiKey: 'k', fetchImpl }).transcribe({ audioUrl: SIGNED_URL, seed: 's' })
    ).rejects.toThrow('speech-to-text responded 403');
  });

  it('rejects an empty transcript rather than drafting notes from nothing', async () => {
    const fetchImpl: FetchLike = async () => jsonResponse(deepgramBody('   '));
    await expect(
      createDeepgramAsr({ apiKey: 'k', fetchImpl }).transcribe({ audioUrl: SIGNED_URL, seed: 's' })
    ).rejects.toThrow(/empty transcript/);
  });
});

describe('createAsr', () => {
  const fetchImpl: FetchLike = async () => jsonResponse(deepgramBody('x'));

  it('uses Deepgram when a key is configured', () => {
    expect(createAsr('dg-key', fetchImpl).provider).toBe('deepgram');
  });

  it('falls back to the offline mock when the key is missing or blank', () => {
    expect(createAsr(undefined, fetchImpl).provider).toBe('mock');
    expect(createAsr('  ', fetchImpl).provider).toBe('mock');
  });
});
