import type { NoteChecklistItem } from '../../services/transcription/types';

export type ProgressSummary = { done: number; total: number; label: string; fraction: number };

/** "3 of 8 done". Only keys that still exist in the checklist count (a coach may edit later). */
export function summarizeProgress(
  items: readonly NoteChecklistItem[],
  checkedKeys: ReadonlySet<string>
): ProgressSummary {
  const total = items.length;
  const done = items.filter((item) => checkedKeys.has(item.key)).length;
  return {
    done,
    total,
    label: `${done} of ${total} done`,
    fraction: total === 0 ? 0 : done / total,
  };
}

/** Immutable toggle used for the optimistic update. */
export function toggleKey(checkedKeys: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(checkedKeys);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}
