/**
 * Finishing a workout is ONE atomic server call.
 *
 * It used to be two client inserts (`workout_completions`, then
 * `exercise_completions`): a dropped connection between them left a completion
 * with no ticked exercises, and a double tap raced into a 23505 the UI had to
 * apologise for. D1a replaced both with `finish_workout`, which is atomic and
 * idempotent — a second call for the same member/day/local-date returns the
 * existing row with `already_logged = true` instead of an error.
 *
 * Contract (D1a):
 *   finish_workout(p_workout_day_id uuid, p_exercise_ids uuid[], p_client_request_id uuid)
 *     -> setof (completion_id uuid, already_logged boolean, completed_at timestamptz)
 *   42501 'not_your_plan'  — caller does not own the day's plan
 *   P0002 'day_not_found'  — unknown or archived day
 */

import { supabase } from '../../services/supabase/client';
import { finishWorkout as finishWorkoutLegacy } from './queries';

/**
 * One id per screen mount, so a retry after a timeout is the SAME attempt to
 * the server rather than a second workout. `crypto.randomUUID` is present on
 * web and modern Hermes; the fallback is only there so a missing global can
 * never break Finish (a non-unique id would at worst lose deduplication).
 */
export function newClientRequestId(): string {
  const cryptoRef = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof cryptoRef?.randomUUID === 'function') return cryptoRef.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export type FinishWorkoutResult = {
  completionId: string | null;
  alreadyLogged: boolean;
  completedAt: string | null;
};

/** PostgREST's "no such function" — the RPC has not been deployed to this database yet. */
const FUNCTION_NOT_FOUND = 'PGRST202';

type RpcRow = {
  completion_id?: unknown;
  already_logged?: unknown;
  completed_at?: unknown;
};

function firstRow(data: unknown): RpcRow | null {
  if (Array.isArray(data)) return (data[0] as RpcRow | undefined) ?? null;
  if (typeof data === 'object' && data !== null) return data as RpcRow;
  return null;
}

function toResult(data: unknown): FinishWorkoutResult {
  const row = firstRow(data);
  return {
    completionId: typeof row?.completion_id === 'string' ? row.completion_id : null,
    alreadyLogged: row?.already_logged === true,
    completedAt: typeof row?.completed_at === 'string' ? row.completed_at : null,
  };
}

function isFunctionMissing(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  return (error as { code?: unknown }).code === FUNCTION_NOT_FOUND;
}

/**
 * `clientRequestId` is generated once per screen mount, so a retry after a
 * timeout is recognised by the server as the same attempt rather than a second
 * workout.
 */
export async function finishWorkout(input: {
  dayId: string;
  exerciseIds: string[];
  clientRequestId: string | null;
}): Promise<FinishWorkoutResult> {
  const { data, error } = await supabase.rpc('finish_workout', {
    p_workout_day_id: input.dayId,
    p_exercise_ids: input.exerciseIds,
    p_client_request_id: input.clientRequestId,
  });

  if (error) {
    // TEMPORARY BRIDGE — delete once the D1a migration is merged everywhere.
    // Until then this branch keeps Finish working against a database that does
    // not have the function yet. It is deliberately narrow: ONLY "function does
    // not exist" falls back; a real 42501/P0002/23505 still surfaces.
    if (isFunctionMissing(error)) {
      await finishWorkoutLegacy(input.dayId, input.exerciseIds);
      return { completionId: null, alreadyLogged: false, completedAt: null };
    }
    throw error;
  }

  return toResult(data);
}
