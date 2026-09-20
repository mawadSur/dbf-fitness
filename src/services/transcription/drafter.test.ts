import {
  ANTHROPIC_MODEL,
  createAnthropicDrafter,
  createDrafter,
  createMockDrafter,
  MAX_CHECKLIST_ITEMS,
  parseChecklistJson,
  validateChecklist,
  type FetchLike,
} from '../../../supabase/functions/_shared/drafter';

const VALID = {
  title: 'Saturday Conditioning',
  items: [
    { key: 'warmup', text: 'Row 500m easy', kind: 'note' },
    { key: 'squat', text: 'Back squat', kind: 'exercise', sets: 4, reps: '8-10' },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function anthropicText(text: string, status = 200): Response {
  return jsonResponse({ content: [{ type: 'text', text }] }, status);
}

describe('validateChecklist', () => {
  it('accepts the documented shape and returns a normalised copy', () => {
    const result = validateChecklist(VALID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.checklist.items).toHaveLength(2);
    expect(result.checklist.items[1]).toEqual({
      key: 'squat',
      text: 'Back squat',
      kind: 'exercise',
      sets: 4,
      reps: '8-10',
    });
  });

  it('strips unknown fields rather than storing whatever the model invented', () => {
    const result = validateChecklist({
      title: 'T',
      items: [{ key: 'a', text: 'b', kind: 'note', weight: 100, nested: { x: 1 } }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.checklist.items[0]).sort()).toEqual(['key', 'kind', 'text']);
  });

  it.each([
    ['not an object', 'nope'],
    ['an array', [] as unknown],
    ['a missing title', { items: [] }],
    ['an empty title', { title: '   ', items: [] }],
    ['missing items', { title: 'T' }],
    ['items that are not an array', { title: 'T', items: {} }],
    ['an item that is not an object', { title: 'T', items: ['x'] }],
    ['an item with no key', { title: 'T', items: [{ text: 'a', kind: 'note' }] }],
    ['an item with an empty key', { title: 'T', items: [{ key: ' ', text: 'a', kind: 'note' }] }],
    ['an item with no text', { title: 'T', items: [{ key: 'k', kind: 'note' }] }],
    ['an unknown kind', { title: 'T', items: [{ key: 'k', text: 'a', kind: 'warmup' }] }],
    ['non-numeric sets', { title: 'T', items: [{ key: 'k', text: 'a', kind: 'exercise', sets: '4' }] }],
    ['zero sets', { title: 'T', items: [{ key: 'k', text: 'a', kind: 'exercise', sets: 0 }] }],
    ['non-string reps', { title: 'T', items: [{ key: 'k', text: 'a', kind: 'exercise', reps: 10 }] }],
  ])('rejects %s', (_label, value) => {
    expect(validateChecklist(value).ok).toBe(false);
  });

  it('rejects duplicate item keys, which would collide in workout_note_progress', () => {
    const result = validateChecklist({
      title: 'T',
      items: [
        { key: 'a', text: 'one', kind: 'note' },
        { key: 'a', text: 'two', kind: 'note' },
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/duplicated/);
  });

  it('rejects more items than the cap', () => {
    const items = Array.from({ length: MAX_CHECKLIST_ITEMS + 1 }, (_value, index) => ({
      key: `k${index}`,
      text: 'x',
      kind: 'note',
    }));
    expect(validateChecklist({ title: 'T', items }).ok).toBe(false);
  });

  it('accepts an empty item list (a class with nothing worth ticking off)', () => {
    expect(validateChecklist({ title: 'T', items: [] }).ok).toBe(true);
  });
});

describe('parseChecklistJson', () => {
  it('parses a bare JSON object', () => {
    expect(parseChecklistJson(JSON.stringify(VALID)).ok).toBe(true);
  });

  it('recovers a fenced or prose-wrapped object instead of burning a repair round-trip', () => {
    expect(parseChecklistJson('```json\n' + JSON.stringify(VALID) + '\n```').ok).toBe(true);
    expect(parseChecklistJson(`Sure! ${JSON.stringify(VALID)} Hope that helps.`).ok).toBe(true);
  });

  it('rejects text with no object and malformed JSON', () => {
    expect(parseChecklistJson('no json here').ok).toBe(false);
    expect(parseChecklistJson('{ "title": "T", ').ok).toBe(false);
  });
});

describe('createMockDrafter', () => {
  it('is deterministic for the same transcript', async () => {
    const drafter = createMockDrafter();
    const input = { title: 'Saturday', transcript: 'Back squat 4 x 8-10. Breathe at the top.' };
    const first = await drafter.draft(input);
    const second = await drafter.draft(input);
    expect(first).toEqual(second);
  });

  it('classifies movements as exercises and picks up sets/reps', async () => {
    const checklist = await createMockDrafter().draft({
      title: 'Saturday Conditioning',
      transcript: 'Back squat 4 x 8-10 building each set. Log how you felt afterwards.',
    });
    expect(checklist.title).toBe('Saturday Conditioning');
    expect(checklist.items[0]).toMatchObject({ kind: 'exercise', sets: 4, reps: '8-10' });
    expect(checklist.items[1].kind).toBe('note');
  });

  it('always produces a valid checklist, even from an unhelpful transcript', async () => {
    const checklist = await createMockDrafter().draft({ title: 'Empty', transcript: '   ' });
    expect(validateChecklist(checklist).ok).toBe(true);
    expect(checklist.items).toHaveLength(1);
  });
});

describe('createAnthropicDrafter', () => {
  it('posts to the Messages API with the configured model and key, and never in the URL', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ url, init });
      return anthropicText(JSON.stringify(VALID));
    };

    const checklist = await createAnthropicDrafter({ apiKey: 'sk-test-123', fetchImpl }).draft({
      title: 'Saturday',
      transcript: 'Back squat.',
    });

    expect(checklist.items).toHaveLength(2);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.anthropic.com/v1/messages');
    expect(calls[0].url).not.toContain('sk-test-123');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-test-123');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(JSON.parse(String(calls[0].init.body)).model).toBe(ANTHROPIC_MODEL);
  });

  it('repairs an invalid answer exactly once and succeeds', async () => {
    const replies = ['{"title": 12, "items": []}', JSON.stringify(VALID)];
    let index = 0;
    const fetchImpl: FetchLike = async () => anthropicText(replies[index++]);

    const checklist = await createAnthropicDrafter({ apiKey: 'k', fetchImpl }).draft({
      title: 'Saturday',
      transcript: 'Back squat.',
    });
    expect(checklist.title).toBe('Saturday Conditioning');
    expect(index).toBe(2);
  });

  it('gives up after one repair rather than storing junk', async () => {
    let calls = 0;
    const fetchImpl: FetchLike = async () => {
      calls += 1;
      return anthropicText('still not json');
    };
    await expect(
      createAnthropicDrafter({ apiKey: 'k', fetchImpl }).draft({ title: 'T', transcript: 'x' })
    ).rejects.toThrow(/invalid checklist/);
    expect(calls).toBe(2);
  });

  it('reports only the status on an HTTP error, never the provider body', async () => {
    const fetchImpl: FetchLike = async () => jsonResponse({ error: { message: 'key sk-live-abc is invalid' } }, 401);
    await expect(
      createAnthropicDrafter({ apiKey: 'k', fetchImpl }).draft({ title: 'T', transcript: 'x' })
    ).rejects.toThrow('notes drafter responded 401');
  });

  it('rejects an empty completion', async () => {
    const fetchImpl: FetchLike = async () => jsonResponse({ content: [] });
    await expect(
      createAnthropicDrafter({ apiKey: 'k', fetchImpl }).draft({ title: 'T', transcript: 'x' })
    ).rejects.toThrow(/empty response/);
  });
});

describe('createDrafter', () => {
  const fetchImpl: FetchLike = async () => anthropicText(JSON.stringify(VALID));

  it('uses the real drafter when a key is configured', () => {
    expect(createDrafter('sk-live', fetchImpl).provider).toBe('anthropic');
  });

  it('falls back to the mock when the key is missing or blank', () => {
    expect(createDrafter(undefined, fetchImpl).provider).toBe('mock');
    expect(createDrafter('   ', fetchImpl).provider).toBe('mock');
  });
});
