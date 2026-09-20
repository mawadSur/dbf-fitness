/**
 * Test-only helpers for the design system.
 *
 * Nothing in `app/` or in any screen imports this file, so it never enters a
 * production bundle — it exists so that every component test can assert the
 * SAME component in both themes without repeating the Appearance plumbing.
 */

import { act, render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { AccessibilityInfo, Appearance, Dimensions } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { ThemeProvider } from '../../theme/ThemeProvider';
import { themes, type ThemeColors, type ThemeName } from '../../theme/tokens';

export const BOTH_THEMES: readonly ThemeName[] = ['light', 'dark'];

/**
 * RNTL hides `accessibilityElementsHidden` subtrees from queries by default —
 * which is exactly what decorative icons, skeletons and SVG backdrops are, so
 * a test that wants to look at one has to ask for it.
 */
export const INCLUDING_HIDDEN = { includeHiddenElements: true } as const;

/** Renders `ui` inside a `ThemeProvider` pinned to `scheme`. */
export function renderInTheme(ui: ReactElement, scheme: ThemeName = 'light') {
  jest.spyOn(Appearance, 'getColorScheme').mockReturnValue(scheme);
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

/** The palette a `renderInTheme(…, scheme)` tree resolves to. */
export function colorsFor(scheme: ThemeName): ThemeColors {
  return themes[scheme];
}

/** iPhone-ish metrics: a 47pt notch and a 34pt gesture bar. */
export const PHONE_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/** `PHONE_METRICS` with some insets/frame replaced — keeps the tests readable. */
export function metricsWith(
  insets: Partial<Metrics['insets']> = {},
  frame: Partial<Metrics['frame']> = {},
): Metrics {
  return {
    frame: { ...PHONE_METRICS.frame, ...frame },
    insets: { ...PHONE_METRICS.insets, ...insets },
  };
}

/**
 * Like `renderInTheme`, plus a `SafeAreaProvider` with known insets.
 *
 * Anything that reads `useSafeAreaInsets` (`ScreenShell`, `ScreenHeader`,
 * `FixedFooter`, the tab bar) throws without a provider, and the whole point of
 * those components is WHERE the inset lands — so the metrics have to be fixed.
 */
export function renderWithInsets(
  ui: ReactElement,
  { scheme = 'light' as ThemeName, metrics = PHONE_METRICS }: { scheme?: ThemeName; metrics?: Metrics } = {},
) {
  jest.spyOn(Appearance, 'getColorScheme').mockReturnValue(scheme);
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>,
  );
}

/**
 * Pins what `useWindowDimensions()` reports.
 *
 * `useWindowDimensions` seeds its state from `Dimensions.get('window')`, so
 * mocking that is how a test asks for a tablet width or a 200% font scale.
 * Call it BEFORE rendering, and `jest.restoreAllMocks()` afterwards.
 */
export function mockWindowDimensions({
  width = 390,
  height = 844,
  scale = 3,
  fontScale = 1,
}: { width?: number; height?: number; scale?: number; fontScale?: number } = {}) {
  jest.spyOn(Dimensions, 'get').mockReturnValue({ width, height, scale, fontScale });
}

/**
 * jest-expo ships `AccessibilityInfo.isReduceMotionEnabled` ALREADY mocked, and
 * `jest.spyOn` on a function that is already a jest mock hands back that very
 * mock without registering anything to restore. So `jest.restoreAllMocks()`
 * cannot undo `mockReducedMotion`, and "the member asked for reduced motion"
 * would silently leak into every test that ran after it — quietly disabling the
 * animations those later tests are there to assert on.
 *
 * The pristine implementation is therefore captured here at import time (before
 * any test body has had a chance to replace it) and put back after every test.
 */
const reduceMotionMock = AccessibilityInfo.isReduceMotionEnabled as jest.Mock<Promise<boolean>, []>;

const PRISTINE_REDUCE_MOTION = jest.isMockFunction(reduceMotionMock)
  ? reduceMotionMock.getMockImplementation()
  : undefined;

/** Puts `isReduceMotionEnabled` back to its jest-expo default. */
export function restoreReducedMotion(): void {
  if (!jest.isMockFunction(reduceMotionMock)) return;
  reduceMotionMock.mockImplementation(PRISTINE_REDUCE_MOTION ?? (() => Promise.resolve(false)));
}

// Every design-system test file imports this module, so this single hook is
// what guarantees the leak described above can never cross a test boundary.
afterEach(restoreReducedMotion);

/** Makes `useReducedMotion()` report the given value for this test. */
export function mockReducedMotion(enabled: boolean) {
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockImplementation(() => Promise.resolve(enabled));
}

/**
 * Delivers the `onLayout` event a self-measuring component waits for.
 *
 * Jest never performs a layout pass, so anything that draws from its measured
 * box (the `HeroPanel` backdrop) renders nothing until a test says how big it
 * is. Passing a degenerate box is how a test asks for the unmeasured state.
 *
 * It calls the handler rather than going through `fireEvent(node, 'layout', …)`
 * — measured on RNTL 14.0.1, that call never reaches `onLayout` (a plain
 * `<View onLayout={…}>` does not re-render from it), so a test written that way
 * silently asserts nothing. `act` flushes the state update the handler queues.
 */
export async function layoutTo(
  node: { props: Record<string, unknown> },
  width: number,
  height: number,
): Promise<void> {
  const onLayout = node.props.onLayout as ((event: unknown) => void) | undefined;
  if (typeof onLayout !== 'function') {
    throw new Error('layoutTo: that node has no onLayout handler');
  }
  // `await act(async …)`, NOT the sync form. `ThemeProvider` starts an async
  // AsyncStorage read on mount, so at this point React has work in flight. A
  // SYNCHRONOUS `act()` closes its scope before that promise settles, which
  // logs "You called act(async () => ...) without await" and — measured — left
  // React's queue in a state where EVERY LATER `render()` in the same file
  // produced a null tree: the first test in a file passed and all the rest
  // failed with "Unable to find an element with testID". Awaiting the async
  // form drains the pending effects inside the scope, so each test starts
  // clean.
  await act(async () => {
    onLayout({ nativeEvent: { layout: { x: 0, y: 0, width, height } } });
  });
}

/**
 * `react-native-svg` parses every colour prop into an ARGB integer payload
 * before it reaches the host node, so a test that wants to know which token a
 * shape was drawn with has to turn the number back into a hex string.
 */
export function svgColorToHex(value: unknown): string | null {
  if (typeof value === 'string') return value;
  // Gradient stops arrive as bare ARGB integers; everything else is wrapped.
  const payload = typeof value === 'number' ? value : (value as { payload?: unknown } | null)?.payload;
  if (typeof payload !== 'number') return null;
  return `#${((payload >>> 0) & 0xffffff).toString(16).padStart(6, '0').toUpperCase()}`;
}

/**
 * The stop colours of a `LinearGradient`, in order.
 *
 * `react-native-svg` folds `<Stop>` children into a flat
 * `[offset, colour, offset, colour, …]` array on the host gradient node, so
 * they are not reachable as nodes of their own.
 */
export function gradientStops(node: Instance): string[] {
  const gradient = hostNodes(node).find((child) => Array.isArray(child.props?.gradient))?.props
    ?.gradient as unknown[] | undefined;
  if (!gradient) return [];
  return gradient
    .filter((_, index) => index % 2 === 1)
    .map((value) => svgColorToHex(value) ?? '');
}

type Instance = { type?: unknown; props?: Record<string, unknown>; children?: unknown[] };

/** Every host node at or under `node`, in document order. */
export function hostNodes(node: Instance): Instance[] {
  const found: Instance[] = [node];
  for (const child of node.children ?? []) {
    if (child && typeof child === 'object') found.push(...hostNodes(child as Instance));
  }
  return found;
}

/** Stroke colours, in document order, of every shape drawn under `node`. */
export function svgStrokes(node: Instance): (string | null)[] {
  return hostNodes(node)
    .map((child) => child.props?.stroke)
    .filter((stroke) => stroke !== undefined && stroke !== null)
    .map(svgColorToHex);
}

/** Fill colours, in document order, of every shape drawn under `node`. */
export function svgFills(node: Instance): (string | null)[] {
  return hostNodes(node)
    .map((child) => child.props?.fill)
    .filter((fill) => fill !== undefined && fill !== null)
    .map(svgColorToHex);
}

/** RN style props are arrays of arrays; flatten one into a plain object. */
export function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flattenStyle));
  if (style && typeof style === 'object') return style as Record<string, unknown>;
  return {};
}

/**
 * The style ANDROID actually applies to a node.
 *
 * This helper used to call the function form itself
 * (`style({ pressed: false })`) — which is precisely why the whole design
 * system could ship with its boxes missing on Android and every test stay
 * green. Under `jsxImportSource: 'nativewind'` the css-interop wrapper does NOT
 * call that function: it passes it through `getOpaqueStyles`, which returns
 * `[fn]`, and React Native silently ignores a function it finds inside a style
 * array. So a function style contributes NOTHING on device.
 *
 * The helper therefore models the device: a function anywhere in the style
 * prop resolves to `{}`. Use `pressIn` to enter the pressed state.
 */
export function pressableStyle(node: { props: { style?: unknown } }) {
  return flattenStyle(node.props.style);
}

/**
 * The layout/box keys a Pressable must carry on its OWN host node — asserting
 * them on a child would not catch the Android bug, because the child is exactly
 * what still rendered while the Pressable's own box vanished.
 */
export const BOX_STYLE_KEYS = [
  'backgroundColor',
  'borderBottomWidth',
  'borderColor',
  'borderLeftWidth',
  'borderRadius',
  'borderRightWidth',
  'borderTopWidth',
  'borderWidth',
  'bottom',
  'flex',
  'flexDirection',
  'gap',
  'height',
  'left',
  'margin',
  'marginBottom',
  'marginHorizontal',
  'marginLeft',
  'marginRight',
  'marginTop',
  'marginVertical',
  'minHeight',
  'minWidth',
  'overflow',
  'padding',
  'paddingBottom',
  'paddingHorizontal',
  'paddingLeft',
  'paddingRight',
  'paddingTop',
  'paddingVertical',
  'position',
  'right',
  'top',
  'width',
] as const;

function touchEvent() {
  const nativeEvent = {
    touches: [],
    changedTouches: [],
    identifier: 1,
    locationX: 1,
    locationY: 1,
    pageX: 1,
    pageY: 1,
    target: 1,
    timestamp: Date.now(),
    force: 0,
  };
  return { nativeEvent, currentTarget: 1, dispatchConfig: {}, persist: () => undefined };
}

/**
 * Puts a `Pressable` into its pressed state for real.
 *
 * `fireEvent.press` runs the press handler without ever entering the pressed
 * visual state, and `pressIn` is not a prop on the host node — RN wires the
 * press lifecycle through the responder system, so the grant is what actually
 * flips `pressed` and re-resolves the style function.
 */
export async function pressIn(node: { props: Record<string, (event: unknown) => void> }) {
  await act(async () => {
    node.props.onResponderGrant?.(touchEvent());
  });
}
