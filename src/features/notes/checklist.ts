import {
  MAX_CHECKLIST_ITEMS,
  MAX_CHECKLIST_TEXT,
  validateChecklist,
  type NoteChecklist,
  type NoteChecklistItem,
  type NoteChecklistItemKind,
} from '../../services/transcription/types';
import { prescriptionLabel } from './itemPrescription';

export type EditorState = {
  title: string;
  items: NoteChecklistItem[];
  dirty: boolean;
};

export type EditorAction =
  | { type: 'load'; checklist: NoteChecklist }
  | { type: 'setTitle'; title: string }
  | { type: 'setText'; key: string; text: string }
  | { type: 'add'; kind: NoteChecklistItemKind }
  | { type: 'delete'; key: string }
  | { type: 'move'; key: string; direction: -1 | 1 }
  | { type: 'toggleKind'; key: string }
  | { type: 'setSets'; key: string; raw: string }
  | { type: 'setReps'; key: string; reps: string }
  | { type: 'saved' };

export const EMPTY_EDITOR: EditorState = { title: '', items: [], dirty: false };

export function nextKey(items: readonly NoteChecklistItem[]): string {
  const used = new Set(items.map((item) => item.key));
  let n = items.length + 1;
  while (used.has(`item-${n}`)) n += 1;
  return `item-${n}`;
}

function mapItem(
  items: NoteChecklistItem[],
  key: string,
  fn: (item: NoteChecklistItem) => NoteChecklistItem
): NoteChecklistItem[] {
  return items.map((item) => (item.key === key ? fn(item) : item));
}

/** "" -> no sets; a positive whole number -> that; anything else is ignored (keeps the old value). */
export function parseSets(raw: string): number | undefined | null {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return n > 0 ? n : null;
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'load':
      return {
        title: action.checklist.title,
        items: action.checklist.items.map((item) => ({ ...item })),
        dirty: false,
      };
    case 'saved':
      return { ...state, dirty: false };
    case 'setTitle':
      return { ...state, title: action.title.slice(0, MAX_CHECKLIST_TEXT), dirty: true };
    case 'setText':
      return {
        ...state,
        items: mapItem(state.items, action.key, (item) => ({
          ...item,
          text: action.text.slice(0, MAX_CHECKLIST_TEXT),
        })),
        dirty: true,
      };
    case 'add': {
      if (state.items.length >= MAX_CHECKLIST_ITEMS) return state;
      const item: NoteChecklistItem = { key: nextKey(state.items), text: '', kind: action.kind };
      return { ...state, items: [...state.items, item], dirty: true };
    }
    case 'delete':
      return { ...state, items: state.items.filter((item) => item.key !== action.key), dirty: true };
    case 'move': {
      const from = state.items.findIndex((item) => item.key === action.key);
      const to = from + action.direction;
      if (from === -1 || to < 0 || to >= state.items.length) return state;
      const items = [...state.items];
      [items[from], items[to]] = [items[to], items[from]];
      return { ...state, items, dirty: true };
    }
    case 'toggleKind':
      return {
        ...state,
        items: mapItem(state.items, action.key, (item) => {
          if (item.kind === 'exercise') {
            // A note has no sets/reps; drop them so the saved JSON stays tidy.
            const { sets: _sets, reps: _reps, ...rest } = item;
            return { ...rest, kind: 'note' };
          }
          return { ...item, kind: 'exercise' };
        }),
        dirty: true,
      };
    case 'setSets': {
      const parsed = parseSets(action.raw);
      if (parsed === null) return state;
      return {
        ...state,
        items: mapItem(state.items, action.key, (item) => {
          const { sets: _sets, ...rest } = item;
          return parsed === undefined ? rest : { ...rest, sets: parsed };
        }),
        dirty: true,
      };
    }
    case 'setReps':
      return {
        ...state,
        items: mapItem(state.items, action.key, (item) => {
          const { reps: _reps, ...rest } = item;
          const reps = action.reps.slice(0, 40);
          return reps === '' ? rest : { ...rest, reps };
        }),
        dirty: true,
      };
    default:
      return state;
  }
}

export type ChecklistSerialization =
  | { ok: true; checklist: NoteChecklist; json: string }
  | { ok: false; reason: string };

/** Trims, then runs the SAME validator the server uses, so a save never round-trips a bad shape. */
export function serializeEditor(state: EditorState): ChecklistSerialization {
  const candidate = {
    title: state.title.trim(),
    items: state.items.map((item) => ({ ...item, text: item.text.trim() })),
  };
  if (candidate.title === '') return { ok: false, reason: 'Give the checklist a title.' };
  const emptyIndex = candidate.items.findIndex((item) => item.text === '');
  if (emptyIndex !== -1) {
    return { ok: false, reason: `Item ${emptyIndex + 1} is empty. Fill it in or delete it.` };
  }
  const result = validateChecklist(candidate);
  if (!result.ok) return { ok: false, reason: result.reason };
  return { ok: true, checklist: result.checklist, json: JSON.stringify(result.checklist) };
}

/** Parse a stored `draft_content` / `edited_content` text column; null when absent or invalid. */
export function parseStoredChecklist(text: string | null | undefined): NoteChecklist | null {
  if (typeof text !== 'string' || text.trim() === '') return null;
  try {
    const result = validateChecklist(JSON.parse(text));
    return result.ok ? result.checklist : null;
  } catch {
    return null;
  }
}

/**
 * The "4 sets × 8-10 reps" line under an item.
 *
 * The unit comes from `prescriptionLabel`, which reads it off the value: this
 * used to append "reps" to everything, so a dictated hold rendered as
 * "3 sets × 30s reps".
 */
export function itemSublabel(item: NoteChecklistItem): string | null {
  return prescriptionLabel(item);
}

/** Editor state for a draft: its checklist, or an empty one titled after the class. */
export function initialEditorState(recording: {
  checklist: NoteChecklist | null;
  classTitle: string | null;
}): EditorState {
  return editorReducer(EMPTY_EDITOR, {
    type: 'load',
    checklist: recording.checklist ?? { title: recording.classTitle ?? 'Workout notes', items: [] },
  });
}
