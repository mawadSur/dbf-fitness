import { screen } from '@testing-library/react-native';
import { Text as RNText } from 'react-native';

import { KEYBOARD_AVOIDING_BEHAVIOR } from '../keyboard';
import { space, type ThemeName } from '../../theme/tokens';
import { CONTENT_MAX_WIDTH } from './layout';
import { ScreenShell } from './ScreenShell';
import { FixedFooter } from './FixedFooter';
import {
  BOTH_THEMES,
  colorsFor,
  flattenStyle,
  metricsWith,
  mockWindowDimensions,
  renderWithInsets,
} from './testing';

/** `PHONE_METRICS`: a 47pt notch and a 34pt gesture bar. */
const TOP_INSET = 47;
const BOTTOM_INSET = 34;

const body = <RNText>Body</RNText>;

const shellStyle = (testID = 'shell') => flattenStyle(screen.getByTestId(testID).props.style);
const scrollContent = (testID = 'shell') =>
  flattenStyle(screen.getByTestId(`${testID}-scroll`).props.contentContainerStyle);

describe('ScreenShell', () => {
  afterEach(() => jest.restoreAllMocks());

  it('applies the top inset exactly once, in the shell itself', async () => {
    await renderWithInsets(<ScreenShell testID="shell">{body}</ScreenShell>);
    expect(shellStyle().paddingTop).toBe(TOP_INSET);
    // The scroll content must not pay the notch a second time.
    expect(scrollContent().paddingTop).toBeUndefined();
  });

  it('pays the gesture-bar inset once outside the tab shell', async () => {
    await renderWithInsets(<ScreenShell testID="shell">{body}</ScreenShell>);
    expect(scrollContent().paddingBottom).toBe(space.xl + BOTTOM_INSET);
  });

  it('adds NO gesture-bar inset inside the tab shell — the tab bar pays it', async () => {
    await renderWithInsets(
      <ScreenShell testID="shell" insideTabs>
        {body}
      </ScreenShell>,
    );
    expect(scrollContent().paddingBottom).toBe(space.xl);
  });

  it('hands the bottom inset to the footer instead of paying it twice', async () => {
    await renderWithInsets(
      <ScreenShell
        testID="shell"
        footer={
          <FixedFooter>
            <RNText>Save</RNText>
          </FixedFooter>
        }
      >
        {body}
      </ScreenShell>,
    );
    // Scroll content stops at the base padding...
    expect(scrollContent().paddingBottom).toBe(space.xl);
    // ...because the footer is the thing touching the bottom edge.
    expect(flattenStyle(screen.getByTestId('fixed-footer').props.style).paddingBottom).toBe(
      space.lg + BOTTOM_INSET,
    );
  });

  it('tells a nested FixedFooter it is inside the tab shell', async () => {
    await renderWithInsets(
      <ScreenShell
        testID="shell"
        insideTabs
        footer={
          <FixedFooter>
            <RNText>Save</RNText>
          </FixedFooter>
        }
      >
        {body}
      </ScreenShell>,
    );
    expect(flattenStyle(screen.getByTestId('fixed-footer').props.style).paddingBottom).toBe(
      space.lg,
    );
  });

  it('has no refresh control until an onRefresh is given', async () => {
    await renderWithInsets(<ScreenShell testID="shell">{body}</ScreenShell>);
    expect(screen.getByTestId('shell-scroll').props.refreshControl).toBeUndefined();
  });

  it('adds pull-to-refresh that reports the refreshing state and fires onRefresh', async () => {
    const onRefresh = jest.fn();
    await renderWithInsets(
      <ScreenShell testID="shell" refreshing onRefresh={onRefresh}>
        {body}
      </ScreenShell>,
    );
    const control = screen.getByTestId('shell-scroll').props.refreshControl;
    expect(control).toBeTruthy();
    expect(control.props.refreshing).toBe(true);
    control.props.onRefresh();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('keeps taps working while the keyboard is open', async () => {
    await renderWithInsets(<ScreenShell testID="shell">{body}</ScreenShell>);
    expect(screen.getByTestId('shell-scroll').props.keyboardShouldPersistTaps).toBe('handled');
    expect(screen.getByTestId('shell-scroll').props.keyboardDismissMode).toBe('on-drag');
  });

  it('does not wrap in a KeyboardAvoidingView unless asked', async () => {
    await renderWithInsets(<ScreenShell testID="shell">{body}</ScreenShell>);
    expect(screen.queryByTestId('shell-keyboard')).toBeNull();
  });

  it('wraps in a KeyboardAvoidingView with the shared behavior when asked', async () => {
    await renderWithInsets(
      <ScreenShell testID="shell" keyboardAvoiding>
        {body}
      </ScreenShell>,
    );
    const node = screen.getByTestId('shell-keyboard');
    // The shared behavior is 'padding' on every platform, and that is the only
    // KeyboardAvoidingView mode that resolves to a paddingBottom on its host
    // view — 'height' would set a height and 'position' would add a wrapper.
    expect(KEYBOARD_AVOIDING_BEHAVIOR).toBe('padding');
    expect(flattenStyle(node.props.style).paddingBottom).toBeDefined();
  });

  it('renders a plain View instead of a ScrollView when scroll is off', async () => {
    await renderWithInsets(
      <ScreenShell testID="shell" scroll={false}>
        {body}
      </ScreenShell>,
    );
    expect(screen.queryByTestId('shell-scroll')).toBeNull();
    expect(screen.getByText('Body')).toBeTruthy();
  });

  it('uses the 16pt gutter on a phone', async () => {
    // The gutter comes from `useWindowDimensions`, not from the safe-area frame.
    mockWindowDimensions({ width: 390, height: 844 });
    await renderWithInsets(<ScreenShell testID="shell">{body}</ScreenShell>, {
      metrics: metricsWith({}, { width: 390 }),
    });
    expect(scrollContent().paddingHorizontal).toBe(16);
  });

  it('widens the gutter to 24 from 600dp, so a tablet is not cramped', async () => {
    mockWindowDimensions({ width: 900, height: 1280 });
    await renderWithInsets(<ScreenShell testID="shell">{body}</ScreenShell>, {
      metrics: metricsWith({}, { width: 900 }),
    });
    expect(scrollContent().paddingHorizontal).toBe(24);
  });

  it('drops the gutter for edge-to-edge content', async () => {
    await renderWithInsets(
      <ScreenShell testID="shell" padded={false}>
        {body}
      </ScreenShell>,
    );
    expect(scrollContent().paddingHorizontal).toBe(0);
  });

  it('caps and centres the content column', async () => {
    await renderWithInsets(<ScreenShell testID="shell">{body}</ScreenShell>);
    const content = scrollContent();
    expect(content.maxWidth).toBe(CONTENT_MAX_WIDTH);
    expect(content.alignSelf).toBe('center');
  });

  it.each(BOTH_THEMES)('uses the page background in the %s theme', async (scheme: ThemeName) => {
    await renderWithInsets(<ScreenShell testID="shell">{body}</ScreenShell>, { scheme });
    expect(shellStyle().backgroundColor).toBe(colorsFor(scheme).bg);
  });

  it('can use the tinted section background instead', async () => {
    await renderWithInsets(
      <ScreenShell testID="shell" background="bgSoft">
        {body}
      </ScreenShell>,
    );
    expect(shellStyle().backgroundColor).toBe(colorsFor('light').bgSoft);
  });

  it('renders the header above the scroll area', async () => {
    await renderWithInsets(
      <ScreenShell testID="shell" header={<RNText>Header</RNText>}>
        {body}
      </ScreenShell>,
    );
    expect(screen.getByText('Header')).toBeTruthy();
  });

  /*
   * Regression: at 1280×900 the header slot sat outside the max-640 wrapper, so
   * the eyebrow/h1 were pinned to the far-left gutter (x≈32) and the action to
   * the far right while the body was a centred column starting at x≈344 — the
   * title lined up with nothing below it.
   */
  it('caps and centres the header on the same column as the content', async () => {
    mockWindowDimensions({ width: 1280, height: 900 });
    await renderWithInsets(
      <ScreenShell testID="shell" header={<RNText>Header</RNText>}>
        {body}
      </ScreenShell>,
      { metrics: metricsWith({}, { width: 1280 }) },
    );
    const headerColumn = flattenStyle(screen.getByTestId('shell-header').props.style);
    const content = scrollContent();
    expect(headerColumn.maxWidth).toBe(CONTENT_MAX_WIDTH);
    expect(headerColumn.alignSelf).toBe('center');
    expect(headerColumn.maxWidth).toBe(content.maxWidth);
    expect(headerColumn.alignSelf).toBe(content.alignSelf);
    // The wrapper adds NO padding of its own: ScreenHeader pays the same
    // gutter the scroll content does, so both share one left edge.
    expect(headerColumn.paddingHorizontal).toBeUndefined();
  });

  it('adds no header wrapper when there is no header', async () => {
    await renderWithInsets(<ScreenShell testID="shell">{body}</ScreenShell>);
    expect(screen.queryByTestId('shell-header')).toBeNull();
  });
});
