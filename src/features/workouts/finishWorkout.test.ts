/**
 * Finishing a workout is one atomic RPC (D1a), not two client inserts.
 *
 * The two behaviours worth protecting: a double tap is "already logged", not an
 * apology; and a real authorization error still reaches the UI instead of being
 * swallowed by the temporary legacy bridge.
 */

import { fakeRpcCalls, resetFake, setRpc } from '../diet/fakeSupabase';
import { finishWorkout, newClientRequestId } from './finishWorkout';

jest.mock('../../services/supabase/client', () => ({
  supabase: jest.requireActual('../diet/fakeSupabase').fakeSupabase,
}));

jest.mock('./queries', () => ({ finishWorkout: jest.fn().mockResolvedValue(undefined) }));
const { finishWorkout: legacyFinish } = jest.requireMock('./queries');

const DAY = '44444444-4444-4444-4444-444444444444';
const COMPLETION = '55555555-5555-5555-5555-555555555555';
const REQ = '77777777-7777-7777-7777-777777777777';
const AT = '2026-09-21T08:30:00.000Z';

const row = (over: Record<string, unknown> = {}) => ({
  data: [{ completion_id: COMPLETION, already_logged: false, completed_at: AT, ...over }],
  error: null,
});
/** PostgrestError carries a `code`; the fake types `error` as `Error`, so carry both. */
const rpcError = (code: string, message: string) => ({
  data: null,
  error: Object.assign(new Error(message), { code }),
});

beforeEach(() => {
  resetFake();
  jest.clearAllMocks();
});

describe('newClientRequestId', () => {
  it('produces a distinct UUID-shaped id each time', () => {
    const ids = new Set(Array.from({ length: 50 }, newClientRequestId));
    expect(ids.size).toBe(50);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    }
  });

  it('still works when crypto.randomUUID is unavailable (older Hermes)', () => {
    const original = (globalThis as { crypto?: unknown }).crypto;
    Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });
    try {
      expect(newClientRequestId()).toMatch(/^[0-9a-f-]{36}$/i);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true });
    }
  });
});

describe('finishWorkout', () => {
  it('sends day, exercises and the request id in ONE call', async () => {
    setRpc('finish_workout', () => row());

    await expect(
      finishWorkout({ dayId: DAY, exerciseIds: ['e1', 'e2'], clientRequestId: REQ }),
    ).resolves.toEqual({ completionId: COMPLETION, alreadyLogged: false, completedAt: AT });

    expect(fakeRpcCalls).toEqual([
      {
        name: 'finish_workout',
        args: { p_workout_day_id: DAY, p_exercise_ids: ['e1', 'e2'], p_client_request_id: REQ },
      },
    ]);
  });

  it('reports a repeat finish as alreadyLogged instead of an error', async () => {
    setRpc('finish_workout', () => row({ already_logged: true }));
    await expect(
      finishWorkout({ dayId: DAY, exerciseIds: [], clientRequestId: REQ }),
    ).resolves.toMatchObject({ alreadyLogged: true, completionId: COMPLETION });
  });

  it('accepts a single-object result as well as a row array', async () => {
    setRpc('finish_workout', () => ({
      data: { completion_id: COMPLETION, already_logged: true, completed_at: AT },
      error: null,
    }));
    await expect(
      finishWorkout({ dayId: DAY, exerciseIds: [], clientRequestId: null }),
    ).resolves.toEqual({ completionId: COMPLETION, alreadyLogged: true, completedAt: AT });
  });

  it('degrades to nulls rather than throwing on an empty result set', async () => {
    setRpc('finish_workout', () => ({ data: [], error: null }));
    await expect(
      finishWorkout({ dayId: DAY, exerciseIds: [], clientRequestId: REQ }),
    ).resolves.toEqual({ completionId: null, alreadyLogged: false, completedAt: null });
  });

  it.each([
    ['not_your_plan', '42501'],
    ['day_not_found', 'P0002'],
  ])('rethrows the real %s error instead of falling back', async (message, code) => {
    setRpc('finish_workout', () => rpcError(code, message));
    await expect(
      finishWorkout({ dayId: DAY, exerciseIds: [], clientRequestId: REQ }),
    ).rejects.toMatchObject({ code, message });
    expect(legacyFinish).not.toHaveBeenCalled();
  });

  it('rethrows an unexpected server error too', async () => {
    setRpc('finish_workout', () => rpcError('23505', 'duplicate key'));
    await expect(
      finishWorkout({ dayId: DAY, exerciseIds: [], clientRequestId: REQ }),
    ).rejects.toMatchObject({ code: '23505' });
    expect(legacyFinish).not.toHaveBeenCalled();
  });

  // TEMPORARY bridge — deleted once D1a is merged everywhere.
  it('falls back to the legacy inserts ONLY when the function does not exist yet', async () => {
    setRpc('finish_workout', () => rpcError('PGRST202', 'function does not exist'));
    await expect(
      finishWorkout({ dayId: DAY, exerciseIds: ['e1'], clientRequestId: REQ }),
    ).resolves.toEqual({ completionId: null, alreadyLogged: false, completedAt: null });
    expect(legacyFinish).toHaveBeenCalledWith(DAY, ['e1']);
  });
});
