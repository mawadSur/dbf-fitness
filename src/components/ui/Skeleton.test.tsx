import { screen } from '@testing-library/react-native';
import { Animated } from 'react-native';

import { tokens } from '../../theme/tokens';
import { Skeleton, SKELETON_MAX_OPACITY, SKELETON_MIN_OPACITY } from './Skeleton';
import { colorsFor, flattenStyle, INCLUDING_HIDDEN, mockReducedMotion, renderInTheme } from './testing';

/** The animated bar is the only child of the hidden wrapper. */
function bar(testID = 'skeleton') {
  const node = screen.getByTestId(testID, INCLUDING_HIDDEN);
  return flattenStyle((node.children[0] as { props: { style?: unknown } }).props.style);
}

describe('Skeleton', () => {
  // `mockReducedMotion` spies on a module singleton; without this the "reduced"
  // test would leak into every test after it.
  afterEach(() => jest.restoreAllMocks());

  it('is hidden from screen readers — the screen announces its own busy state', async () => {
    await renderInTheme(<Skeleton />);
    const node = screen.getByTestId('skeleton', INCLUDING_HIDDEN);
    expect(node.props.accessibilityElementsHidden).toBe(true);
    expect(node.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(screen.queryByTestId('skeleton')).toBeNull();
  });

  it('fills the width at a one-line height by default', async () => {
    await renderInTheme(<Skeleton />);
    const style = bar();
    expect(style.width).toBe('100%');
    expect(style.height).toBe(16);
    expect(style.borderRadius).toBe(tokens.radii.sm);
  });

  it('takes the size and radius it is given', async () => {
    await renderInTheme(<Skeleton width="60%" height={56} radius={tokens.radii.lg} />);
    const style = bar();
    expect(style.width).toBe('60%');
    expect(style.height).toBe(56);
    expect(style.borderRadius).toBe(tokens.radii.lg);
  });

  it('uses the tinted section colour in both themes', async () => {
    await renderInTheme(<Skeleton />, 'dark');
    expect(bar().backgroundColor).toBe(colorsFor('dark').bgSoft);
  });

  it('starts fully opaque and loops a shimmer while motion is allowed', async () => {
    const loop = jest.spyOn(Animated, 'loop');
    await renderInTheme(<Skeleton />);
    expect(bar().opacity).toBe(SKELETON_MAX_OPACITY);
    expect(loop).toHaveBeenCalledTimes(1);
  });

  it('settles on one still, dimmed opacity under reduced motion', async () => {
    mockReducedMotion(true);
    const setValue = jest.spyOn(Animated.Value.prototype, 'setValue');
    await renderInTheme(<Skeleton />);
    expect(setValue).toHaveBeenCalledWith(SKELETON_MIN_OPACITY);
  });

  it('does not pin the opacity while motion is allowed', async () => {
    const setValue = jest.spyOn(Animated.Value.prototype, 'setValue');
    await renderInTheme(<Skeleton />);
    expect(setValue).not.toHaveBeenCalledWith(SKELETON_MIN_OPACITY);
  });

  it('stays visible at its dimmest, so a loading row is never invisible', () => {
    expect(SKELETON_MIN_OPACITY).toBeGreaterThan(0.3);
    expect(SKELETON_MIN_OPACITY).toBeLessThan(SKELETON_MAX_OPACITY);
  });

  it('accepts a caller testID', async () => {
    await renderInTheme(<Skeleton testID="avatar-skeleton" />);
    expect(screen.getByTestId('avatar-skeleton', INCLUDING_HIDDEN)).toBeTruthy();
  });
});
