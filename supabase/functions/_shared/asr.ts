// ASR adapter: turns a recorded class into a raw transcript.
//
// PORTABLE TypeScript — no Deno globals, no npm:/jsr: specifiers, every dependency injected — so
// the Edge runtime and Jest load the exact same file (see src/services/transcription/asr.test.ts).
//
// Two implementations behind one interface:
//   * createDeepgramAsr — real, Deepgram pre-recorded REST API, used when DEEPGRAM_API_KEY is set.
//   * createMockAsr     — deterministic generator, used otherwise. It performs NO network call and
//                         reads NO file: it derives a plausible class transcript from the seed it
//                         is given (the recording id), so the whole pipeline is exercisable
//                         offline and the end-to-end test can assert on exact text.

import type { FetchLike } from './drafter.ts';

export type TranscriptSegment = {
  /** Seconds from the start of the recording. */
  start: number;
  end: number;
  text: string;
};

export type AsrResult = {
  provider: 'deepgram' | 'mock';
  rawText: string;
  segments: TranscriptSegment[];
};

export type AsrInput = {
  /** Short-lived signed URL to the private Storage object. Never logged. */
  audioUrl: string;
  /** Stable seed so the mock is deterministic per recording. */
  seed: string;
};

export interface AsrAdapter {
  readonly provider: 'deepgram' | 'mock';
  transcribe(input: AsrInput): Promise<AsrResult>;
}

export const DEEPGRAM_URL = 'https://api.deepgram.com/v1/listen';
export const DEEPGRAM_MODEL = 'nova-2';

// ---------------------------------------------------------------------------
// Mock ASR — deterministic, offline
// ---------------------------------------------------------------------------

const MOCK_SCRIPT = [
  'Welcome in everyone, we are starting with an easy five minute row to warm up.',
  'Keep your shoulders down and breathe through the whole stroke.',
  'First block is back squat, 4 x 8-10, building in weight each set.',
  'Rest ninety seconds between sets and keep the bar path straight.',
  'Second block is dumbbell bench press, 3 x 12, controlled on the way down.',
  'Superset that with a bent over row, 3 x 12 each side.',
  'Finisher is 10 burpees on the minute for six minutes.',
  'Cool down with a two minute walk and some hip flexor stretching.',
  'Log how you felt today so we can adjust the load next week.',
];

/** FNV-1a — a tiny stable hash so the mock varies per recording but never per run. */
function seedHash(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Deterministic transcript generator. The seed only chooses how many lines of the fixed script
 * are used (always at least five), so output is stable for a given recording id and still differs
 * between recordings.
 */
export function createMockAsr(): AsrAdapter {
  return {
    provider: 'mock',
    transcribe(input: AsrInput): Promise<AsrResult> {
      const count = 5 + (seedHash(input.seed) % (MOCK_SCRIPT.length - 4));
      const lines = MOCK_SCRIPT.slice(0, count);
      const segments: TranscriptSegment[] = lines.map((text, index) => ({
        start: index * 12,
        end: index * 12 + 12,
        text,
      }));
      return Promise.resolve({
        provider: 'mock',
        rawText: lines.join(' '),
        segments,
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Deepgram ASR — real
// ---------------------------------------------------------------------------

type DeepgramResponse = {
  results?: {
    channels?: {
      alternatives?: {
        transcript?: string;
        words?: { word?: string; punctuated_word?: string; start?: number; end?: number }[];
      }[];
    }[];
    utterances?: { start?: number; end?: number; transcript?: string }[];
  };
};

export type DeepgramAsrOptions = {
  apiKey: string;
  fetchImpl: FetchLike;
  model?: string;
};

/**
 * Real ASR. Deepgram fetches the media itself from the signed URL, so nothing is streamed through
 * the Edge Function. `utterances=true` gives sentence-level timings; when Deepgram omits them the
 * whole transcript becomes one segment rather than failing the run.
 */
export function createDeepgramAsr(options: DeepgramAsrOptions): AsrAdapter {
  const { apiKey, fetchImpl, model = DEEPGRAM_MODEL } = options;
  const url = `${DEEPGRAM_URL}?model=${encodeURIComponent(model)}&punctuate=true&utterances=true&smart_format=true`;

  return {
    provider: 'deepgram',
    async transcribe(input: AsrInput): Promise<AsrResult> {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Token ${apiKey}`,
        },
        body: JSON.stringify({ url: input.audioUrl }),
      });
      if (!response.ok) {
        // Status only — a Deepgram error body can echo the signed URL back, which is a credential.
        throw new Error(`speech-to-text responded ${response.status}`);
      }

      const body = (await response.json()) as DeepgramResponse;
      const alternative = body.results?.channels?.[0]?.alternatives?.[0];
      const rawText = (alternative?.transcript ?? '').trim();
      if (rawText === '') throw new Error('speech-to-text returned an empty transcript');

      const utterances = body.results?.utterances ?? [];
      const segments: TranscriptSegment[] = utterances
        .filter((utterance) => typeof utterance.transcript === 'string' && utterance.transcript.trim() !== '')
        .map((utterance) => ({
          start: typeof utterance.start === 'number' ? utterance.start : 0,
          end: typeof utterance.end === 'number' ? utterance.end : 0,
          text: (utterance.transcript as string).trim(),
        }));

      return {
        provider: 'deepgram',
        rawText,
        segments: segments.length > 0 ? segments : [{ start: 0, end: 0, text: rawText }],
      };
    },
  };
}

/** Picks the real adapter when a key is configured, the deterministic mock otherwise. */
export function createAsr(apiKey: string | undefined, fetchImpl: FetchLike): AsrAdapter {
  if (apiKey && apiKey.trim() !== '') {
    return createDeepgramAsr({ apiKey: apiKey.trim(), fetchImpl });
  }
  return createMockAsr();
}
