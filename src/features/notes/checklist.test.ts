import type { NoteChecklist } from '../../services/transcription/types';
import {
  editorReducer,
  EMPTY_EDITOR,
  initialEditorState,
  itemSublabel,
  nextKey,
  parseSets,
  parseStoredChecklist,
  serializeEditor,
  type EditorState,
} from './checklist';

const CHECKLIST: NoteChecklist = {
  title: 'Saturday Conditioning',
  items: [
    { key: 'warmup', text: 'Row 500m easy', kind: 'note' },
    { key: 'squat-1', text: 'Back squat', kind: 'exercise', sets: 4, reps: '8-10' },
    { key: 'finisher', text: 'Burpees', kind: 'exercise' },
  ],
};

function loaded(): EditorState {
  return editorReducer(EMPTY_EDITOR, { type: 'load', checklist: CHECKLIST });
}

describe('editorReducer', () => {
  it('loads a checklist clean and does not alias the input', () => {
    const state = loaded();
    expect(state.dirty).toBe(false);
    expect(state.items).toEqual(CHECKLIST.items);
    expect(state.items[0]).not.toBe(CHECKLIST.items[0]);
  });

  it('edits text and marks dirty; saved clears it', () => {
    let state = editorReducer(loaded(), { type: 'setText', key: 'warmup', text: 'Bike 10 min' });
    expect(state.items[0].text).toBe('Bike 10 min');
    expect(state.dirty).toBe(true);
    state = editorReducer(state, { type: 'saved' });
    expect(state.dirty).toBe(false);
  });

  it('adds items with unique keys and the requested kind', () => {
    let state = loaded();
    state = editorReducer(state, { type: 'add', kind: 'exercise' });
    state = editorReducer(state, { type: 'add', kind: 'note' });
    const keys = state.items.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(state.items[3]).toMatchObject({ text: '', kind: 'exercise' });
    expect(state.items[4].kind).toBe('note');
  });

  it('nextKey skips keys already taken', () => {
    expect(nextKey([{ key: 'item-2', text: 'x', kind: 'note' }])).toBe('item-3');
    expect(nextKey([{ key: 'item-1', text: 'x', kind: 'note' }])).toBe('item-2');
  });

  it('deletes by key', () => {
    const state = editorReducer(loaded(), { type: 'delete', key: 'squat-1' });
    expect(state.items.map((i) => i.key)).toEqual(['warmup', 'finisher']);
  });

  it('moves up and down, and ignores moves off either end', () => {
    let state = editorReducer(loaded(), { type: 'move', key: 'finisher', direction: -1 });
    expect(state.items.map((i) => i.key)).toEqual(['warmup', 'finisher', 'squat-1']);
    state = editorReducer(state, { type: 'move', key: 'warmup', direction: -1 });
    expect(state.items.map((i) => i.key)).toEqual(['warmup', 'finisher', 'squat-1']);
    state = editorReducer(state, { type: 'move', key: 'squat-1', direction: 1 });
    expect(state.items[2].key).toBe('squat-1');
    const untouched = loaded();
    expect(editorReducer(untouched, { type: 'move', key: 'nope', direction: 1 })).toBe(untouched);
  });

  it('toggling exercise to note drops sets/reps; back to exercise keeps none', () => {
    let state = editorReducer(loaded(), { type: 'toggleKind', key: 'squat-1' });
    expect(state.items[1]).toEqual({ key: 'squat-1', text: 'Back squat', kind: 'note' });
    state = editorReducer(state, { type: 'toggleKind', key: 'squat-1' });
    expect(state.items[1].kind).toBe('exercise');
  });

  it('sets/reps: valid numbers apply, blank clears, garbage is ignored', () => {
    let state = editorReducer(loaded(), { type: 'setSets', key: 'finisher', raw: '3' });
    expect(state.items[2].sets).toBe(3);
    const before = state;
    state = editorReducer(state, { type: 'setSets', key: 'finisher', raw: 'abc' });
    expect(state).toBe(before);
    state = editorReducer(state, { type: 'setSets', key: 'finisher', raw: '0' });
    expect(state).toBe(before);
    state = editorReducer(state, { type: 'setSets', key: 'finisher', raw: '' });
    expect(state.items[2].sets).toBeUndefined();
    state = editorReducer(state, { type: 'setReps', key: 'finisher', reps: '15' });
    expect(state.items[2].reps).toBe('15');
    state = editorReducer(state, { type: 'setReps', key: 'finisher', reps: '' });
    expect(state.items[2]).not.toHaveProperty('reps');
  });

  it('parseSets', () => {
    expect(parseSets('')).toBeUndefined();
    expect(parseSets(' 5 ')).toBe(5);
    expect(parseSets('1.5')).toBeNull();
    expect(parseSets('-2')).toBeNull();
  });

  it('caps the item count', () => {
    let state = EMPTY_EDITOR;
    for (let i = 0; i < 70; i += 1) state = editorReducer(state, { type: 'add', kind: 'note' });
    expect(state.items).toHaveLength(60);
  });
});

describe('serializeEditor', () => {
  it('produces server-valid JSON with trimmed text', () => {
    const state = editorReducer(loaded(), { type: 'setText', key: 'warmup', text: '  Bike  ' });
    const result = serializeEditor(state);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(JSON.parse(result.json).items[0].text).toBe('Bike');
      expect(result.checklist.title).toBe('Saturday Conditioning');
    }
  });

  it('rejects an empty title and empty items with a readable reason', () => {
    const noTitle = editorReducer(loaded(), { type: 'setTitle', title: '   ' });
    expect(serializeEditor(noTitle)).toEqual({ ok: false, reason: 'Give the checklist a title.' });

    const blank = editorReducer(loaded(), { type: 'add', kind: 'note' });
    const result = serializeEditor(blank);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Item 4 is empty/);
  });
});

describe('stored checklist helpers', () => {
  it('parseStoredChecklist tolerates null, junk and valid JSON', () => {
    expect(parseStoredChecklist(null)).toBeNull();
    expect(parseStoredChecklist('not json')).toBeNull();
    expect(parseStoredChecklist('{"title":"","items":[]}')).toBeNull();
    expect(parseStoredChecklist(JSON.stringify(CHECKLIST))).toEqual(CHECKLIST);
  });

  it('initialEditorState falls back to an empty checklist titled after the class', () => {
    const state = initialEditorState({ checklist: null, classTitle: 'Morning Crew' });
    expect(state).toEqual({ title: 'Morning Crew', items: [], dirty: false });
  });

  it('itemSublabel', () => {
    expect(itemSublabel(CHECKLIST.items[1])).toBe('4 sets × 8-10 reps');
    expect(itemSublabel({ key: 'a', text: 'a', kind: 'exercise', sets: 1 })).toBe('1 set');
    expect(itemSublabel(CHECKLIST.items[0])).toBeNull();
  });
});
