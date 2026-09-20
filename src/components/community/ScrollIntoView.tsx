import { createContext, useContext, type RefObject } from 'react';
import { View } from 'react-native';

/** A view we can measure (a real View, or a fake in tests). */
export type MeasurableRef = RefObject<Pick<View, 'measureInWindow'> | null>;

/** Lets a deeply nested field ask the screen's list to scroll it above the keyboard. */
export type ScrollIntoView = (target: MeasurableRef) => void;

const noop: ScrollIntoView = () => undefined;

export const ScrollIntoViewContext = createContext<ScrollIntoView>(noop);

export function useScrollIntoView(): ScrollIntoView {
  return useContext(ScrollIntoViewContext);
}
