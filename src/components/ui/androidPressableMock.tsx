/**
 * Test-only: the `Pressable` ANDROID renders, for use with `jest.mock`.
 *
 * React Native's own `Pressable` resolves a function-form `style` ITSELF
 * (`typeof style === 'function' ? style({ pressed }) : style`) before the host
 * node ever sees it. So under Jest the broken pattern arrives at the host view
 * as a perfectly ordinary style object and every box assertion passes — which
 * is exactly how the Android bug shipped green.
 *
 * On device the component that receives the `style` prop first is the
 * react-native-css-interop wrapper (every JSX element compiles with
 * `jsxImportSource: 'nativewind'`), and it does NOT call the function:
 * `getOpaqueStyles` returns `[fn]`, so the function lands inside a style ARRAY
 * on the host view and React Native ignores it there.
 *
 * This component models that: `style` is forwarded verbatim inside an array and
 * never called, so a control whose box lives in a `({ pressed }) => …` callback
 * resolves to `{}` — which is what `pressableAndroidBox.test.tsx` asserts
 * against.
 *
 * It lives in its own module because a `jest.mock` factory may not reference
 * out-of-scope variables, and the nativewind babel preset injects one
 * (`_ReactNativeCSSInterop`) into any factory that builds an element.
 */

import { createElement, forwardRef, type ReactNode } from 'react';
import { View } from 'react-native';

type MockProps = Record<string, unknown> & {
  children?: ReactNode | ((state: { pressed: boolean }) => ReactNode);
  style?: unknown;
  accessible?: boolean;
};

export const AndroidPressable = forwardRef<unknown, MockProps>(function AndroidPressable(
  { children, style, accessible, ...rest },
  ref,
) {
  return createElement(
    View as never,
    {
      ...rest,
      ref,
      accessible: accessible ?? true,
      // Verbatim, inside an array — the shape css-interop hands to the host.
      style: Array.isArray(style) ? style : [style],
    },
    typeof children === 'function' ? children({ pressed: false }) : children,
  );
});

export default AndroidPressable;
