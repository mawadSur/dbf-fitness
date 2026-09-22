/**
 * The exercise ticks a member has made but not yet finished.
 *
 * Two things used to be lost on this screen. A day that was ALREADY LOGGED
 * re-opened with every box empty and "0 of 3 done" over a footer that said
 * "Logged for today" — the ticks lived only in `useState`, so the saved
 * `exercise_completions` were never read back. And a member who left mid-
 * workout to look something up came back to a blank list.
 *
 * The first is fixed by hydrating from the server rows; the second by this
 * draft, which is deliberately LOCAL and disposable: it is a convenience for
 * one member on one device, never a record of training. `finish_workout`
 * remains the only thing that records anything.
 */

/** Keys are namespaced so a wipe of workout drafts can never touch anything else. */
const KEY_PREFIX = 'dbf.workout.ticks';

type DraftStore = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

/**
 * AsyncStorage is a NATIVE module, so it is required lazily inside a try/catch
 * — the same rule `ThemeProvider` follows. A missing or broken store simply
 * means "no draft": the screen works, it just does not remember ticks.
 */
function draftStore(): DraftStore | null {
  try {
    /* eslint-disable-next-line @typescript-eslint/no-require-imports -- native module, loaded lazily on purpose */
    const module = require('@react-native-async-storage/async-storage');
    const store = (module?.default ?? module) as Partial<DraftStore> | undefined;
    if (
      !store ||
      typeof store.getItem !== 'function' ||
      typeof store.setItem !== 'function' ||
      typeof store.removeItem !== 'function'
    ) {
      return null;
    }
    return store as DraftStore;
  } catch {
    return null;
  }
}

/**
 * The member's LOCAL calendar date, as `YYYY-MM-DD`.
 *
 * Local, not UTC, on purpose — and deliberately different from
 * `utcDayRange()`, which mirrors the DB's uniqueness key. These answer
 * different questions: the server decides whether a completion already exists
 * today, while this decides whether a half-finished session is still "this
 * evening's". A member training at 8pm in UTC-8 is at 04:00 UTC the next day,
 * and a draft that reset itself in the middle of their workout would be worse
 * than one that survives an hour past midnight somewhere else.
 */
export function localDateKey(now: Date = new Date()): string {
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Where one member's ticks for one day on one date live.
 *
 * All three parts matter: without the member a shared device leaks one
 * person's session into another's, without the date yesterday's half-finished
 * ticks reappear as today's, and without the day every day of the plan would
 * share one draft.
 */
export function tickDraftKey(
  memberId: string,
  dayId: string,
  date: string = localDateKey(),
): string {
  return `${KEY_PREFIX}.${memberId}.${dayId}.${date}`;
}

/**
 * The ticks to show: `saved` narrowed to the exercises actually on screen.
 *
 * An id can outlive the row it points at — an exercise archived by the coach
 * since the completion was written (`archived_at`, migration 20260921100000)
 * keeps its `exercise_completions` row but no longer renders. Counting it
 * would put "4 of 3 done" under a list of three, so anything not currently
 * visible is dropped. Order follows the list, not the saved rows.
 */
export function hydrateTicks(
  saved: readonly string[] | null | undefined,
  visibleIds: readonly string[],
): Set<string> {
  if (!saved || saved.length === 0) return new Set();
  const savedSet = new Set(saved);
  return new Set(visibleIds.filter((id) => savedSet.has(id)));
}

/** A stored draft is untrusted input: anything but an array of strings is no draft. */
function parseDraft(raw: string | null): string[] | null {
  if (typeof raw !== 'string' || raw === '') return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    return null;
  }
}

/** The saved draft for `key`, or `null` when there is none and on any failure. */
export async function readTickDraft(key: string): Promise<string[] | null> {
  try {
    const raw = await draftStore()?.getItem(key);
    return parseDraft(raw ?? null);
  } catch {
    return null;
  }
}

/**
 * Saves the draft, or removes it when nothing is ticked.
 *
 * Best effort by design: a storage failure must never surface to a member
 * mid-workout, because the ticks they can see on screen are unaffected.
 */
export async function writeTickDraft(key: string, ids: readonly string[]): Promise<void> {
  try {
    const store = draftStore();
    if (!store) return;
    if (ids.length === 0) await store.removeItem(key);
    else await store.setItem(key, JSON.stringify([...ids]));
  } catch {
    // Ignored on purpose: the ticks still stand for this session.
  }
}

/** Drops the draft once the workout is recorded — the server owns it from there. */
export async function clearTickDraft(key: string): Promise<void> {
  try {
    await draftStore()?.removeItem(key);
  } catch {
    // Ignored on purpose: a stale draft is scoped to this day and date anyway.
  }
}
