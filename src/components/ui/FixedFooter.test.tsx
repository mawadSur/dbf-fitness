import { screen } from '@testing-library/react-native';
import { Text as RNText } from 'react-native';

import { space, type ThemeName } from '../../theme/tokens';
import { FixedFooter } from './FixedFooter';
import { CONTENT_MAX_WIDTH } from './layout';
import { ScreenShellContext, type ScreenShellState } from './ScreenShellContext';
import { BOTH_THEMES, colorsFor, flattenStyle, metricsWith, renderWithInsets } from './testing';

/** The gesture bar on `PHONE_METRICS`; the number the footer must pay at most once. */
const BOTTOM_INSET = 34;

function shellState(insideTabShell: boolean): ScreenShellState {
  return { topInsetApplied: true, insideTabShell };
}

/** Renders the footer as a child of a shell that claims the given mode. */
function renderInShell(insideTabShell: boolean, scheme: ThemeName = 'light') {
  return renderWithInsets(
    <ScreenShellContext.Provider value={shellState(insideTabShell)}>
      <FixedFooter>
        <RNText>Save</RNText>
      </FixedFooter>
    </ScreenShellContext.Provider>,
    { scheme },
  );
}

const footerStyle = () => flattenStyle(screen.getByTestId('fixed-footer').props.style);

describe('FixedFooter', () => {
  afterEach(() => jest.restoreAllMocks());

  it('is never absolutely positioned, so it cannot float over the tab bar', async () => {
    await renderInShell(true);
    const style = footerStyle();
    expect(style.position).toBeUndefined();
    // The props that would let it escape normal flow must all be absent.
    expect(style.bottom).toBeUndefined();
    expect(style.left).toBeUndefined();
    expect(style.right).toBeUndefined();
  });

  it('adds NO bottom inset inside the tab shell — the tab bar already paid it', async () => {
    await renderInShell(true);
    // space.lg and nothing else: the 34pt gesture bar is the tab bar's to pay.
    expect(footerStyle().paddingBottom).toBe(space.lg);
  });

  it('pays the gesture-bar inset exactly once outside the tab shell', async () => {
    await renderInShell(false);
    expect(footerStyle().paddingBottom).toBe(space.lg + BOTTOM_INSET);
  });

  it('lets a caller override the shell when it renders outside one', async () => {
    await renderWithInsets(
      <ScreenShellContext.Provider value={shellState(false)}>
        <FixedFooter insideTabShell>
          <RNText>Save</RNText>
        </FixedFooter>
      </ScreenShellContext.Provider>,
    );
    expect(footerStyle().paddingBottom).toBe(space.lg);
  });

  it('adds nothing when there is no shell and no gesture bar', async () => {
    await renderWithInsets(
      <FixedFooter>
        <RNText>Save</RNText>
      </FixedFooter>,
      { metrics: metricsWith({ bottom: 0 }) },
    );
    expect(footerStyle().paddingBottom).toBe(space.lg);
  });

  it('separates itself from the content with a hairline by default', async () => {
    await renderInShell(true);
    expect(footerStyle().borderTopWidth).toBe(1);
  });

  it('drops the hairline when asked to', async () => {
    await renderWithInsets(
      <FixedFooter bordered={false}>
        <RNText>Save</RNText>
      </FixedFooter>,
    );
    expect(footerStyle().borderTopWidth).toBe(0);
  });

  it.each(BOTH_THEMES)('uses the page background in the %s theme', async (scheme) => {
    await renderInShell(true, scheme);
    expect(footerStyle().backgroundColor).toBe(colorsFor(scheme).bg);
  });

  it('caps its content column so a tablet footer is not a full-bleed row', async () => {
    await renderInShell(true);
    const column = flattenStyle(
      (screen.getByTestId('fixed-footer').children[0] as { props: { style?: unknown } }).props.style,
    );
    expect(column.maxWidth).toBe(CONTENT_MAX_WIDTH);
    expect(column.alignSelf).toBe('center');
  });

  it('renders its children and honours a caller testID', async () => {
    await renderWithInsets(
      <FixedFooter testID="checkout-footer">
        <RNText>Save</RNText>
      </FixedFooter>,
    );
    expect(screen.getByTestId('checkout-footer')).toBeTruthy();
    expect(screen.getByText('Save')).toBeTruthy();
  });
});
