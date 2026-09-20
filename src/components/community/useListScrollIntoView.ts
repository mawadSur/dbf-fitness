import { useCallback, useEffect, useRef, type RefObject } from 'react';
import {
  Dimensions,
  Keyboard,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { overflowToScroll } from '../../features/community/scrollIntoView';
import type { MeasurableRef } from './ScrollIntoView';

/** Time for the keyboard to finish animating before we measure the focused field. */
export const KEYBOARD_SETTLE_MS = 120;

type ScrollableList = { scrollToOffset: (params: { offset: number; animated?: boolean }) => void };

/**
 * Keeps a focused field above the keyboard inside a list: tracks the list's scroll offset and the
 * keyboard height, and scrolls by however much of the field would be covered. Works with both the
 * iOS (will-show) and Android (did-show) keyboard events.
 */
export function useListScrollIntoView(listRef: RefObject<ScrollableList | null>) {
  const offsetRef = useRef(0);
  const keyboardHeightRef = useRef(0);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    const timers = timersRef.current;
    const onShow = (event: { endCoordinates?: { height?: number } }) => {
      keyboardHeightRef.current = event.endCoordinates?.height ?? 0;
    };
    const onHide = () => {
      keyboardHeightRef.current = 0;
    };
    const subscriptions = [
      Keyboard.addListener('keyboardWillShow', onShow),
      Keyboard.addListener('keyboardDidShow', onShow),
      Keyboard.addListener('keyboardWillHide', onHide),
      Keyboard.addListener('keyboardDidHide', onHide),
    ];
    return () => {
      subscriptions.forEach((subscription) => subscription.remove());
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsetRef.current = event.nativeEvent.contentOffset.y;
  }, []);

  const scrollIntoView = useCallback(
    (target: MeasurableRef) => {
      const timer = setTimeout(() => {
        timersRef.current.delete(timer);
        target.current?.measureInWindow((_x, y, _width, height) => {
          const delta = overflowToScroll({
            y,
            height,
            windowHeight: Dimensions.get('window').height,
            keyboardHeight: keyboardHeightRef.current,
          });
          if (delta > 0) listRef.current?.scrollToOffset({ offset: offsetRef.current + delta, animated: true });
        });
      }, KEYBOARD_SETTLE_MS);
      timersRef.current.add(timer);
    },
    [listRef]
  );

  return { onScroll, scrollIntoView };
}
