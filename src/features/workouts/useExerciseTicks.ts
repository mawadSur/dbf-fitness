/**
 * The tick state of the workout day screen.
 *
 * It lives here rather than in the screen because there are two quite
 * different things a tick can be, and the screen used to treat both as one
 * `useState`:
 *
 *  - on a day ALREADY LOGGED today the ticks are a RECORD, owned by the
 *    server's `exercise_completions`. They were never read back, so the screen
 *    re-opened with every box empty and "0 of 3 done" above a footer that said
 *    "Logged for today";
 *  - on an unfinished day they are a DRAFT, owned by the member, and they were
 *    lost the moment they left the screen.
 *
 * So the record is DERIVED (never stored — a refetch cannot desynchronise it)
 * and only the draft is state.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  clearTickDraft,
  hydrateTicks,
  readTickDraft,
  tickDraftKey,
  writeTickDraft,
} from './tickDraft';

export type UseExerciseTicksInput = {
  /** Null until the day query resolves; nothing is read or written before then. */
  memberId: string | null;
  dayId: string | null;
  /** Ids of the exercises currently on screen, in list order. */
  visibleIds: readonly string[];
  /** True once the day's exercises have loaded — restoring waits for them. */
  ready: boolean;
  /** Already logged for today, so the ticks are a record, not a draft. */
  alreadyLogged: boolean;
  /** Exercise ids saved on today's completion. */
  completedExerciseIds: readonly string[];
};

export type ExerciseTicks = {
  checkedIds: Set<string>;
  /** Ticking is off once the day is logged: the boxes report, they do not edit. */
  locked: boolean;
  toggle: (exerciseId: string) => void;
  /** Called after a successful finish — the server owns the record from there. */
  discardDraft: () => void;
};

export function useExerciseTicks({
  memberId,
  dayId,
  visibleIds,
  ready,
  alreadyLogged,
  completedExerciseIds,
}: UseExerciseTicksInput): ExerciseTicks {
  const [draftIds, setDraftIds] = useState<Set<string>>(() => new Set());

  // A draft belongs to one member, one day and one local date.
  const draftKey = useMemo(
    () => (memberId && dayId ? tickDraftKey(memberId, dayId) : null),
    [memberId, dayId],
  );

  // These arrays are new objects on every render; what matters is their
  // CONTENT, which changes only when the day's data actually arrives.
  const visibleKey = visibleIds.join(',');
  const completedKey = completedExerciseIds.join(',');

  // Mirrors the draft so two taps in the same tick both land, and so the
  // storage write happens OUTSIDE the state updater (React may run it twice).
  const latest = useRef(draftIds);
  // The restore is async: a member who taps while it is in flight would
  // otherwise have their tap overwritten by the draft landing a moment later.
  const touched = useRef(false);
  // Restoring is one-shot per screen — a refetch must not undo live ticking.
  const restored = useRef(false);

  useEffect(() => {
    // A logged day never reads the draft: its ticks come off the server below.
    if (!ready || alreadyLogged || restored.current || !draftKey) return;
    restored.current = true;

    let cancelled = false;
    const ids = visibleKey === '' ? [] : visibleKey.split(',');
    void readTickDraft(draftKey).then((saved) => {
      if (cancelled || touched.current) return;
      const ticks = hydrateTicks(saved, ids);
      if (ticks.size === 0) return;
      latest.current = ticks;
      setDraftIds(ticks);
    });
    return () => {
      cancelled = true;
    };
  }, [alreadyLogged, draftKey, ready, visibleKey]);

  /**
   * The record of a logged day, narrowed to the exercises on screen.
   *
   * Derived rather than copied into state: whatever the server last said is
   * what the boxes show, so a refetch or a finish that turned out to be a
   * repeat cannot leave the list disagreeing with the footer.
   */
  const loggedIds = useMemo(() => {
    if (!alreadyLogged) return null;
    return hydrateTicks(
      completedKey === '' ? [] : completedKey.split(','),
      visibleKey === '' ? [] : visibleKey.split(','),
    );
  }, [alreadyLogged, completedKey, visibleKey]);

  const toggle = useCallback(
    (exerciseId: string) => {
      // The record of a logged day is the server's; the boxes only report it.
      if (alreadyLogged) return;
      touched.current = true;
      const next = new Set(latest.current);
      if (next.has(exerciseId)) next.delete(exerciseId);
      else next.add(exerciseId);
      latest.current = next;
      setDraftIds(next);
      if (draftKey) void writeTickDraft(draftKey, [...next]);
    },
    [alreadyLogged, draftKey],
  );

  const discardDraft = useCallback(() => {
    if (draftKey) void clearTickDraft(draftKey);
  }, [draftKey]);

  return { checkedIds: loggedIds ?? draftIds, locked: alreadyLogged, toggle, discardDraft };
}
