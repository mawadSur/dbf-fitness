import { screen } from '@testing-library/react-native';

import { tokens, type ThemeName } from '../../theme/tokens';
import { Badge, BADGE_TONES, type BadgeTone } from './Badge';
import { BOTH_THEMES, colorsFor, flattenStyle, INCLUDING_HIDDEN, renderInTheme } from './testing';

const STATUS_TONES: BadgeTone[] = ['success', 'warning', 'danger', 'info'];
const TONE_CASES: [BadgeTone, ThemeName][] = STATUS_TONES.flatMap((tone) =>
  BOTH_THEMES.map((scheme): [BadgeTone, ThemeName] => [tone, scheme]),
);

describe('Badge', () => {
  it('states its label as text, not as a button', async () => {
    await renderInTheme(<Badge label="Active" testID="b" />);
    const badge = screen.getByTestId('b');
    expect(badge.props.accessibilityRole).toBe('text');
    expect(badge.props.accessibilityLabel).toBe('Active');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('is a pill with the neutral tint by default', async () => {
    await renderInTheme(<Badge label="Neutral" testID="b" />, 'light');
    const style = flattenStyle(screen.getByTestId('b').props.style);
    expect(style.borderRadius).toBe(tokens.radii.pill);
    expect(style.backgroundColor).toBe(colorsFor('light').bgSoft);
  });

  it.each(TONE_CASES)('paints the %s tone from its token pair in %s', async (tone, scheme) => {
    await renderInTheme(<Badge label={tone} tone={tone} testID="b" />, scheme);
    const pair = BADGE_TONES[tone];
    expect(flattenStyle(screen.getByTestId('b').props.style).backgroundColor).toBe(
      colorsFor(scheme)[pair.bg],
    );
    expect(flattenStyle(screen.getByText(tone).props.style).color).toBe(colorsFor(scheme)[pair.fg]);
  });

  it('carries an icon so the tone is never colour alone', async () => {
    await renderInTheme(<Badge label="Active" tone="success" icon="check-circle" />);
    expect(screen.getByTestId('icon-check-circle', INCLUDING_HIDDEN)).toBeTruthy();
  });

  it('omits the icon when none is asked for', async () => {
    await renderInTheme(<Badge label="Plain" />);
    expect(screen.queryByTestId('icon-check-circle', INCLUDING_HIDDEN)).toBeNull();
  });

  it('keeps a long label on one line', async () => {
    await renderInTheme(<Badge label="A very long status label indeed" />);
    expect(screen.getByText('A very long status label indeed').props.numberOfLines).toBe(1);
  });
});
