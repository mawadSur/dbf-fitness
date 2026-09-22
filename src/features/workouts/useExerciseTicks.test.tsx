import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { tickDraftKey } from './tickDraft';
import { useExerciseTicks, type UseExerciseTicksInput } from './useExerciseTicks';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

const getItem = AsyncStorage.getItem as jest.Mock;
const setItem = AsyncStorage.setItem as jest.Mock;
const removeItem = AsyncStorage.removeItem as jest.Mock;

const MEMBER = 'member-1';
const DAY = 'day-3';
const VISIBLE = ['e1', 'e2', 'e3'];
const KEY = tickDraftKey(MEMBER, DAY);

function input(overrides: Partial<UseExerciseTicksInput> = {}): UseExerciseTicksInput {
  return {
    memberId: MEMBER,
    dayId: DAY,
    visibleIds: VISIBLE,
    ready: true,
    alreadyLogged: false,
    completedExerciseIds: [],
    ...overrides,
  };
}

const ticksOf = (result: { current: { checkedIds: Set<string> } }) => [...result.current.checkedIds];

beforeEach(() => {
  getItem.mockReset().mockResolvedValue(null);
  setItem.mockReset().mockResolvedValue(undefined);
  removeItem.mockReset().mockResolvedValue(undefined);
});

describe('a fresh day', () => {
  it('starts with nothing ticked and nothing locked', async () => {
    const { result } = await renderHook(() => useExerciseTicks(input()));
    await waitFor(() => expect(getItem).toHaveBeenCalledWith(KEY));
    expect(ticksOf(result)).toEqual([]);
    expect(result.current.locked).toBe(false);
  });

  it('ticks and unticks, and saves each change under the member/day/date key', async () => {
    const { result } = await renderHook(() => useExerciseTicks(input()));
    await waitFor(() => expect(getItem).toHaveBeenCalled());

    await act(async () => result.current.toggle('e2'));
    expect(ticksOf(result)).toEqual(['e2']);
    expect(setItem).toHaveBeenLastCalledWith(KEY, JSON.stringify(['e2']));

    await act(async () => result.current.toggle('e1'));
    expect(ticksOf(result)).toEqual(['e2', 'e1']);

    await act(async () => result.current.toggle('e2'));
    expect(ticksOf(result)).toEqual(['e1']);
    expect(setItem).toHaveBeenLastCalledWith(KEY, JSON.stringify(['e1']));
  });

  it('removes the draft rather than saving an empty one when the last tick goes', async () => {
    const { result } = await renderHook(() => useExerciseTicks(input()));
    await act(async () => result.current.toggle('e1'));
    await act(async () => result.current.toggle('e1'));
    expect(removeItem).toHaveBeenCalledWith(KEY);
  });

  it('reads no draft until the exercises have arrived', async () => {
    await renderHook(() => useExerciseTicks(input({ ready: false, visibleIds: [] })));
    expect(getItem).not.toHaveBeenCalled();
  });

  it('reads no draft when nobody is signed in', async () => {
    await renderHook(() => useExerciseTicks(input({ memberId: null })));
    expect(getItem).not.toHaveBeenCalled();
  });
});

describe('a day left part-finished and re-entered', () => {
  it('restores the ticks the member had made', async () => {
    getItem.mockResolvedValue(JSON.stringify(['e1', 'e3']));
    const { result } = await renderHook(() => useExerciseTicks(input()));
    await waitFor(() => expect(ticksOf(result)).toEqual(['e1', 'e3']));
    expect(result.current.locked).toBe(false);
  });

  it('keeps a tick made while the restore was still in flight', async () => {
    let release: (value: string) => void = () => undefined;
    getItem.mockReturnValue(new Promise<string>((resolve) => (release = resolve)));

    const { result } = await renderHook(() => useExerciseTicks(input()));
    await act(async () => result.current.toggle('e2'));
    await act(async () => {
      release(JSON.stringify(['e1']));
    });

    // The draft landed late; the member's own tap is the newer truth.
    expect(ticksOf(result)).toEqual(['e2']);
  });

  it('restores only once, so a refetch cannot undo live ticking', async () => {
    getItem.mockResolvedValue(JSON.stringify(['e1']));
    const { result, rerender } = await renderHook(
      (props: UseExerciseTicksInput) => useExerciseTicks(props),
      { initialProps: input() },
    );

    await waitFor(() => expect(ticksOf(result)).toEqual(['e1']));
    await act(async () => result.current.toggle('e1'));
    expect(ticksOf(result)).toEqual([]);

    await rerender(input({ visibleIds: [...VISIBLE] }));
    await act(async () => undefined);
    expect(ticksOf(result)).toEqual([]);
  });

  it('drops a saved id whose exercise the coach has since archived', async () => {
    getItem.mockResolvedValue(JSON.stringify(['e1', 'archived-e9']));
    const { result } = await renderHook(() => useExerciseTicks(input()));
    await waitFor(() => expect(ticksOf(result)).toEqual(['e1']));
  });
});

describe('a day already logged today', () => {
  const logged = input({ alreadyLogged: true, completedExerciseIds: ['e1', 'e2', 'e3'] });

  it('hydrates every tick from the saved completion', async () => {
    const { result } = await renderHook(() => useExerciseTicks(logged));
    await waitFor(() => expect(ticksOf(result)).toEqual(['e1', 'e2', 'e3']));
    expect(result.current.locked).toBe(true);
  });

  it('never touches the local draft — the server owns the record', async () => {
    await renderHook(() => useExerciseTicks(logged));
    await act(async () => undefined);
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it('ignores a toggle: the boxes report what was done, they do not edit it', async () => {
    const { result } = await renderHook(() => useExerciseTicks(logged));
    await waitFor(() => expect(ticksOf(result)).toHaveLength(3));
    await act(async () => result.current.toggle('e1'));
    expect(ticksOf(result)).toEqual(['e1', 'e2', 'e3']);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('shows a partial completion as partial', async () => {
    const { result } = await renderHook(() =>
      useExerciseTicks(input({ alreadyLogged: true, completedExerciseIds: ['e2'] })),
    );
    await waitFor(() => expect(ticksOf(result)).toEqual(['e2']));
  });

  it('drops completion rows for exercises no longer in the day', async () => {
    const { result } = await renderHook(() =>
      useExerciseTicks(
        input({ alreadyLogged: true, completedExerciseIds: ['e1', 'archived-e9', 'unknown'] }),
      ),
    );
    await waitFor(() => expect(ticksOf(result)).toEqual(['e1']));
  });

  it('follows the server when the completion changes under it', async () => {
    const { result, rerender } = await renderHook(
      (props: UseExerciseTicksInput) => useExerciseTicks(props),
      { initialProps: input({ alreadyLogged: true, completedExerciseIds: ['e1'] }) },
    );

    await waitFor(() => expect(ticksOf(result)).toEqual(['e1']));
    await rerender(input({ alreadyLogged: true, completedExerciseIds: ['e1', 'e2'] }));
    expect(ticksOf(result)).toEqual(['e1', 'e2']);
  });
});

describe('discardDraft', () => {
  it('removes the entry once the workout is recorded', async () => {
    const { result } = await renderHook(() => useExerciseTicks(input()));
    await act(async () => result.current.discardDraft());
    expect(removeItem).toHaveBeenCalledWith(KEY);
  });
});

describe('when storage fails', () => {
  it('still ticks, unticks and finishes — persistence is the only thing lost', async () => {
    getItem.mockRejectedValue(new Error('storage unavailable'));
    setItem.mockRejectedValue(new Error('storage unavailable'));
    removeItem.mockRejectedValue(new Error('storage unavailable'));

    const { result } = await renderHook(() => useExerciseTicks(input()));
    await waitFor(() => expect(getItem).toHaveBeenCalled());

    await act(async () => result.current.toggle('e1'));
    expect(ticksOf(result)).toEqual(['e1']);
    await act(async () => result.current.toggle('e3'));
    expect(ticksOf(result)).toEqual(['e1', 'e3']);
    await act(async () => result.current.discardDraft());
    expect(ticksOf(result)).toEqual(['e1', 'e3']);
  });
});
