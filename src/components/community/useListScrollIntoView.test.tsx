import { act, renderHook } from '@testing-library/react-native';
import { Dimensions, Keyboard } from 'react-native';

import { KEYBOARD_SETTLE_MS, useListScrollIntoView } from './useListScrollIntoView';

type Handler = (event: { endCoordinates?: { height?: number } }) => void;

async function setup() {
  const handlers: Record<string, Handler> = {};
  const remove = jest.fn();
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, handler: Handler) => {
    handlers[name] = handler;
    return { remove };
  }) as never);
  jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 360, height: 640, scale: 2, fontScale: 1 });
  const scrollToOffset = jest.fn();
  const listRef = { current: { scrollToOffset } };
  const hook = await renderHook(() => useListScrollIntoView(listRef));
  const target = (y: number, height: number) => ({
    current: { measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, y, 300, height) },
  });
  return { handlers, remove, scrollToOffset, hook, target };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('useListScrollIntoView', () => {
  it('scrolls a covered field above the keyboard, from the current scroll offset', async () => {
    const { handlers, scrollToOffset, hook, target } = await setup();
    await act(async () => handlers.keyboardDidShow({ endCoordinates: { height: 300 } }));
    await act(async () =>
      hook.result.current.onScroll({ nativeEvent: { contentOffset: { y: 200 } } } as never)
    );

    // Field spans 500..588; keyboard top is at 340 -> 588 + 16 - 340 = 264 hidden.
    await act(async () => {
      hook.result.current.scrollIntoView(target(500, 88) as never);
      jest.advanceTimersByTime(KEYBOARD_SETTLE_MS);
    });
    expect(scrollToOffset).toHaveBeenCalledWith({ offset: 464, animated: true });
  });

  it('does not scroll when the field is already clear of the keyboard', async () => {
    const { handlers, scrollToOffset, hook, target } = await setup();
    await act(async () => handlers.keyboardWillShow({ endCoordinates: { height: 300 } }));
    await act(async () => {
      hook.result.current.scrollIntoView(target(100, 88) as never);
      jest.advanceTimersByTime(KEYBOARD_SETTLE_MS);
    });
    expect(scrollToOffset).not.toHaveBeenCalled();
  });

  it('forgets the keyboard height once it hides', async () => {
    const { handlers, scrollToOffset, hook, target } = await setup();
    await act(async () => handlers.keyboardDidShow({ endCoordinates: { height: 300 } }));
    await act(async () => handlers.keyboardDidHide({}));
    await act(async () => {
      hook.result.current.scrollIntoView(target(500, 88) as never);
      jest.advanceTimersByTime(KEYBOARD_SETTLE_MS);
    });
    expect(scrollToOffset).not.toHaveBeenCalled();
  });

  it('removes its keyboard listeners and cancels pending scrolls on unmount', async () => {
    const { handlers, remove, scrollToOffset, hook, target } = await setup();
    await act(async () => handlers.keyboardDidShow({ endCoordinates: { height: 300 } }));
    await act(async () => hook.result.current.scrollIntoView(target(500, 88) as never));
    await hook.unmount();
    await act(async () => jest.advanceTimersByTime(KEYBOARD_SETTLE_MS * 2));
    expect(remove).toHaveBeenCalledTimes(4);
    expect(scrollToOffset).not.toHaveBeenCalled();
  });
});
