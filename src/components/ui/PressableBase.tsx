import { useState, type ReactNode } from 'react';
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useReducedMotion } from '../../theme/ThemeProvider';
import { pressedStyle } from './layout';

/**
 * The one `Pressable` the design system is allowed to render.
 *
 * WHY THIS EXISTS — every JSX element in this app compiles with
 * `jsxImportSource: 'nativewind'` (`babel.config.js`), so `Pressable` is the
 * react-native-css-interop wrapper, not the bare React Native one. That wrapper
 * collects the incoming `style` prop through `getOpaqueStyles`, which for a
 * FUNCTION returns `[fn]` — the function is put inside a style ARRAY and handed
 * to the host view, and React Native never calls a function it finds inside a
 * style array. On Android the result is that every box/layout/colour prop in a
 * `style={({ pressed }) => …}` callback is silently dropped: primary buttons
 * lost their fill, chips lost their pill, cards lost their border. Web takes a
 * different render path and looked fine, which is why it shipped.
 *
 * So: box, layout and colour go in `style` as PLAIN objects (the wrapper merges
 * arrays of objects correctly), and the press feedback — which is only opacity
 * and transform, never layout — is driven from `onPressIn`/`onPressOut` state
 * and appended as one more plain object. Nothing is ever a function.
 *
 * `src/components/ui/pressableSourceGuard.test.ts` fails the build if the
 * function form comes back anywhere with layout inside it.
 */

/**
 * How the control reacts to a press.
 * - `'ds'` — the design-system feedback (`pressedStyle`: token opacity plus a
 *   scale that reduced motion removes).
 * - `'none'` — no feedback (disabled/inert controls, which carry their own
 *   opacity in `style`).
 * - a number — fade to exactly that opacity, no scale (the pre-design-system
 *   screens that already used `opacity: pressed ? 0.6 : 1`).
 */
export type PressFeedbackMode = 'ds' | 'none' | number;

export type PressableBaseProps = Omit<PressableProps, 'style' | 'children'> & {
  /** Box/layout/colour. Plain objects or arrays of them — never a function. */
  style?: StyleProp<ViewStyle>;
  /** Defaults to the design-system feedback. */
  pressFeedback?: PressFeedbackMode;
  children?: ReactNode;
};

/** The opacity/transform layer for a given feedback mode. */
export function feedbackStyle(
  feedback: PressFeedbackMode,
  pressed: boolean,
  reducedMotion: boolean,
): ViewStyle | null {
  if (feedback === 'none') return null;
  if (feedback === 'ds') return pressedStyle(pressed, reducedMotion);
  return { opacity: pressed ? feedback : 1 };
}

/**
 * A `Pressable` whose box styles survive Android.
 *
 * Every other prop (`onPress`, `disabled`, `hitSlop`, `android_ripple`, the
 * `accessibility*` family, `testID`) passes straight through, so this is a
 * drop-in replacement for the `Pressable` it replaces.
 */
export function PressableBase({
  style,
  pressFeedback = 'ds',
  onPressIn,
  onPressOut,
  children,
  ...rest
}: PressableBaseProps) {
  const reducedMotion = useReducedMotion();
  const [pressed, setPressed] = useState(false);
  const tracks = pressFeedback !== 'none';

  const handlePressIn = (event: GestureResponderEvent) => {
    if (tracks) setPressed(true);
    onPressIn?.(event);
  };

  // Fires on cancel as well as on a completed press, so the state cannot stick.
  const handlePressOut = (event: GestureResponderEvent) => {
    if (tracks) setPressed(false);
    onPressOut?.(event);
  };

  return (
    <Pressable
      {...rest}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, feedbackStyle(pressFeedback, pressed, reducedMotion)]}
    >
      {children}
    </Pressable>
  );
}
