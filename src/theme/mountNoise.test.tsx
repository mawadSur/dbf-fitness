import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { ProgressRing } from '../components/ui/ProgressRing';
import { ThemeProvider, useTheme } from './ThemeProvider';

/**
 * "First cold start on Android shows a red LogBox 'Console Error' toast over
 * the tab bar" — suspected `ThemeProvider`.
 *
 * LogBox's red "Console Error" toast is, by definition, a `console.error` call
 * during the first commit. React's own act/`setState on an unmounted
 * component` warnings go through `console.error` too, so this test mounts the
 * provider exactly the way the root layout does and FAILS on any
 * `console.error` at all — which is the only mechanism that can tell a real
 * cause from a guess.
 *
 * Note what this can and cannot prove: it reproduces anything React or the
 * provider's own code logs. It cannot reproduce a warning that only a NATIVE
 * module emits on a device.
 */

function Probe() {
  const { scheme } = useTheme();
  return <Text>{scheme}</Text>;
}

/** Everything `console.error` saw, with the arguments rendered as text. */
function captureConsoleErrors(): { messages: string[]; restore: () => void } {
  const messages: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    messages.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(' '));
  };
  return { messages, restore: () => (console.error = original) };
}

describe('ThemeProvider first mount', () => {
  it('logs nothing to console.error while it settles', async () => {
    const { messages, restore } = captureConsoleErrors();
    try {
      await render(
        <ThemeProvider>
          <Probe />
        </ThemeProvider>,
      );
      // The stored-preference read and the reduced-motion read both resolve on
      // a later microtask/tick; a state update landing there is exactly the
      // shape of warning the cold-start toast would come from.
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByText(/light|dark/)).toBeTruthy();
    } finally {
      restore();
    }
    expect(messages).toEqual([]);
  });

  it('logs nothing to console.error when it is unmounted mid-settle', async () => {
    // The cold-start path where a splash/gate swaps the tree out before the
    // AsyncStorage read lands: a `setState` after unmount is a console.error.
    const { messages, restore } = captureConsoleErrors();
    try {
      const view = await render(
        <ThemeProvider>
          <Probe />
        </ThemeProvider>,
      );
      view.unmount();
      // No `act` here on purpose: the point is what happens to the pending
      // promises AFTER the tree is gone, and wrapping the drain in a second
      // act() while render's own is still settling is itself a console.error.
      await Promise.resolve();
      await Promise.resolve();
    } finally {
      restore();
    }
    expect(messages).toEqual([]);
  });

  /**
   * The chrome a cold start actually paints. The one CONFIRMED source of a red
   * "Console Error" toast on first mount was `ProgressRing`: Animated forces
   * `collapsable={false}` onto every animated component, react-native-svg
   * spreads unknown props straight onto the node, and the DOM/native side
   * complained "Received `false` for a non-boolean attribute `collapsable`"
   * on every screen that draws a ring. `ProgressRing` swallows the prop now;
   * this keeps it swallowed.
   */
  it('mounts the themed chrome of the first screen without a console.error', async () => {
    const { messages, restore } = captureConsoleErrors();
    try {
      await render(
        <ThemeProvider>
          <ProgressRing value={0} max={10} label="Effort" />
          <ProgressRing value={7} max={10} label="Days" />
          <Button label="Start Day 3" onPress={() => undefined} />
          <Chip label="Dark" selected selectionRole="radio" onPress={() => undefined} />
        </ThemeProvider>,
      );
    } finally {
      restore();
    }
    expect(messages).toEqual([]);
  });
});
