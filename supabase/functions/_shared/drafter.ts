// Notes drafter: turns a raw class transcript into the workout-notes checklist.
//
// PORTABLE TypeScript — no Deno globals, no npm:/jsr: specifiers, every dependency injected — so
// the Edge runtime and Jest load the exact same file (see src/services/transcription/drafter.test.ts).
//
// Two implementations behind one interface:
//   * createAnthropicDrafter — real, Anthropic Messages API, used when ANTHROPIC_API_KEY is set.
//   * createMockDrafter      — deterministic rule-based fallback, no network, used otherwise.
//
// The checklist shape below is the single client-facing contract and is enforced in three places
// that must stay in step: here, public.is_valid_note_checklist() in
// supabase/migrations/20260919151000_recordings_pipeline.sql, and NoteChecklist in
// src/services/transcription/types.ts.

export type NoteChecklistItemKind = 'exercise' | 'note';

export type NoteChecklistItem = {
  key: string;
  text: string;
  kind: NoteChecklistItemKind;
  sets?: number;
  reps?: string;
};

export type NoteChecklist = {
  title: string;
  items: NoteChecklistItem[];
};

export type ChecklistValidation =
  | { ok: true; checklist: NoteChecklist }
  | { ok: false; reason: string };

export const MAX_CHECKLIST_ITEMS = 60;
export const MAX_CHECKLIST_TEXT = 300;
export const ANTHROPIC_MODEL = 'claude-sonnet-5';
export const ANTHROPIC_VERSION = '2023-06-01';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Validates an already-parsed value against the checklist contract and returns a NEW object
 * containing only known fields — so nothing a model invented can ride along into the database.
 * Never throws; the caller decides whether to repair or fail.
 */
export function validateChecklist(value: unknown): ChecklistValidation {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, reason: 'checklist must be a JSON object' };
  }
  const raw = value as Record<string, unknown>;

  if (typeof raw.title !== 'string' || raw.title.trim() === '') {
    return { ok: false, reason: 'checklist.title must be a non-empty string' };
  }
  if (!Array.isArray(raw.items)) {
    return { ok: false, reason: 'checklist.items must be an array' };
  }
  if (raw.items.length > MAX_CHECKLIST_ITEMS) {
    return { ok: false, reason: `checklist.items must hold at most ${MAX_CHECKLIST_ITEMS} entries` };
  }

  const seen = new Set<string>();
  const items: NoteChecklistItem[] = [];

  for (let index = 0; index < raw.items.length; index += 1) {
    const entry = raw.items[index];
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return { ok: false, reason: `items[${index}] must be an object` };
    }
    const item = entry as Record<string, unknown>;

    if (typeof item.key !== 'string' || item.key.trim() === '') {
      return { ok: false, reason: `items[${index}].key must be a non-empty string` };
    }
    if (seen.has(item.key)) {
      return { ok: false, reason: `items[${index}].key "${item.key}" is duplicated` };
    }
    seen.add(item.key);

    if (typeof item.text !== 'string' || item.text.trim() === '') {
      return { ok: false, reason: `items[${index}].text must be a non-empty string` };
    }
    if (item.kind !== 'exercise' && item.kind !== 'note') {
      return { ok: false, reason: `items[${index}].kind must be "exercise" or "note"` };
    }

    const next: NoteChecklistItem = {
      key: item.key,
      text: item.text.slice(0, MAX_CHECKLIST_TEXT),
      kind: item.kind,
    };

    if (item.sets !== undefined && item.sets !== null) {
      if (typeof item.sets !== 'number' || !Number.isFinite(item.sets) || item.sets <= 0) {
        return { ok: false, reason: `items[${index}].sets must be a positive number` };
      }
      next.sets = item.sets;
    }
    if (item.reps !== undefined && item.reps !== null) {
      if (typeof item.reps !== 'string') {
        return { ok: false, reason: `items[${index}].reps must be a string` };
      }
      next.reps = item.reps.slice(0, 40);
    }

    items.push(next);
  }

  return { ok: true, checklist: { title: raw.title.slice(0, MAX_CHECKLIST_TEXT), items } };
}

/**
 * Parses JSON text and validates it. Tolerates a model that wrapped its answer in a ```json fence
 * or added prose around the object, because that is by far the most common way strict-JSON
 * instructions are disobeyed and it is cheaper to recover than to burn a repair round-trip.
 */
export function parseChecklistJson(text: string): ChecklistValidation {
  const candidate = extractJsonObject(text);
  if (candidate === null) return { ok: false, reason: 'response contained no JSON object' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return { ok: false, reason: 'response was not valid JSON' };
  }
  return validateChecklist(parsed);
}

function extractJsonObject(text: string): string | null {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const body = fenced ? fenced[1].trim() : trimmed;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return body.slice(start, end + 1);
}

export type DrafterInput = {
  /** Live-class title, used as the checklist title fallback. */
  title: string;
  transcript: string;
};

export interface Drafter {
  readonly provider: 'anthropic' | 'mock';
  draft(input: DrafterInput): Promise<NoteChecklist>;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

// ---------------------------------------------------------------------------
// Mock drafter — deterministic, offline
// ---------------------------------------------------------------------------

const EXERCISE_WORDS = [
  'squat', 'deadlift', 'press', 'row', 'pull', 'push', 'curl', 'lunge', 'plank', 'burpee',
  'sprint', 'run', 'bike', 'swing', 'snatch', 'clean', 'jerk', 'thruster', 'situp', 'crunch',
  'dip', 'chin', 'carry', 'jump', 'rep', 'set', 'hold',
];

const SETS_REPS = /(\d{1,2})\s*(?:x|by|sets?\s*of)\s*(\d{1,3}(?:\s*-\s*\d{1,3})?)/i;

/**
 * Rule-based transcript -> checklist. Splits the transcript into sentences, keeps the ones that
 * look like instructions, and classifies each as an exercise or a note. Deterministic: the same
 * transcript always yields the same checklist, which is what makes the end-to-end test assertable.
 */
export function createMockDrafter(): Drafter {
  return {
    provider: 'mock',
    draft(input: DrafterInput): Promise<NoteChecklist> {
      const sentences = input.transcript
        .split(/(?<=[.!?])\s+|\n+/)
        .map((sentence) => sentence.trim())
        .filter((sentence) => sentence.length > 0);

      const items: NoteChecklistItem[] = [];
      for (const sentence of sentences) {
        if (items.length >= MAX_CHECKLIST_ITEMS) break;
        const lower = sentence.toLowerCase();
        const isExercise = EXERCISE_WORDS.some((word) => lower.includes(word));
        const item: NoteChecklistItem = {
          key: `item-${items.length + 1}`,
          text: sentence.slice(0, MAX_CHECKLIST_TEXT),
          kind: isExercise ? 'exercise' : 'note',
        };
        const match = SETS_REPS.exec(sentence);
        if (isExercise && match) {
          item.sets = Number(match[1]);
          item.reps = match[2].replace(/\s+/g, '');
        }
        items.push(item);
      }

      if (items.length === 0) {
        items.push({ key: 'item-1', text: 'Review the recording and add the session notes.', kind: 'note' });
      }

      return Promise.resolve({ title: input.title.slice(0, MAX_CHECKLIST_TEXT), items });
    },
  };
}

// ---------------------------------------------------------------------------
// Anthropic drafter — real
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = [
  'You turn a fitness class transcript into a checklist a member can tick off afterwards.',
  'Reply with ONE JSON object and nothing else: no prose, no markdown fence.',
  'Shape: {"title": string, "items": [{"key": string, "text": string, "kind": "exercise"|"note", "sets"?: number, "reps"?: string}]}.',
  '"key" is a short unique slug. "kind" is "exercise" for a movement to perform and "note" for coaching advice.',
  'Include "sets"/"reps" only when the coach actually stated them. At most 40 items.',
  'Never invent exercises that were not mentioned.',
].join(' ');

export type AnthropicDrafterOptions = {
  apiKey: string;
  fetchImpl: FetchLike;
  model?: string;
  maxTokens?: number;
};

/**
 * Real drafter. Asks for strict JSON, validates the answer, and on a shape failure retries ONCE
 * with the validator's complaint appended. A second failure throws, which the pipeline turns into
 * recordings.status = 'failed' so the coach can retry rather than get a silently empty checklist.
 */
export function createAnthropicDrafter(options: AnthropicDrafterOptions): Drafter {
  const { apiKey, fetchImpl, model = ANTHROPIC_MODEL, maxTokens = 4096 } = options;

  async function ask(messages: { role: 'user' | 'assistant'; content: string }[]): Promise<string> {
    const response = await fetchImpl(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, system: SYSTEM_PROMPT, messages }),
    });
    if (!response.ok) {
      // Status only: an Anthropic error body can echo request content, and the transcript is
      // sensitive. Never surface the key or the payload.
      throw new Error(`notes drafter responded ${response.status}`);
    }
    const body = (await response.json()) as { content?: { type?: string; text?: string }[] };
    const text = (body.content ?? [])
      .filter((block) => block?.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text as string)
      .join('\n')
      .trim();
    if (text === '') throw new Error('notes drafter returned an empty response');
    return text;
  }

  return {
    provider: 'anthropic',
    async draft(input: DrafterInput): Promise<NoteChecklist> {
      const prompt = `Class title: ${input.title}\n\nTranscript:\n${input.transcript}`;
      const first = await ask([{ role: 'user', content: prompt }]);
      const parsed = parseChecklistJson(first);
      if (parsed.ok) return parsed.checklist;

      const repaired = await ask([
        { role: 'user', content: prompt },
        { role: 'assistant', content: first },
        {
          role: 'user',
          content: `That response was rejected: ${parsed.reason}. Reply again with ONLY the corrected JSON object.`,
        },
      ]);
      const second = parseChecklistJson(repaired);
      if (second.ok) return second.checklist;
      throw new Error(`notes drafter returned an invalid checklist: ${second.reason}`);
    },
  };
}

/** Picks the real drafter when a key is configured, the deterministic mock otherwise. */
export function createDrafter(apiKey: string | undefined, fetchImpl: FetchLike): Drafter {
  if (apiKey && apiKey.trim() !== '') {
    return createAnthropicDrafter({ apiKey: apiKey.trim(), fetchImpl });
  }
  return createMockDrafter();
}
