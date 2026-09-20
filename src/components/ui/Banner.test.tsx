import { fireEvent, screen } from '@testing-library/react-native';

import { tokens, type ThemeName } from '../../theme/tokens';
import { Banner, BANNER_TONES, type BannerTone } from './Banner';
import { BOTH_THEMES, colorsFor, flattenStyle, INCLUDING_HIDDEN, renderInTheme } from './testing';

const TONES = Object.keys(BANNER_TONES) as BannerTone[];
const TONE_CASES: [BannerTone, ThemeName][] = TONES.flatMap((tone) =>
  BOTH_THEMES.map((scheme): [BannerTone, ThemeName] => [tone, scheme]),
);

describe('Banner', () => {
  it('announces itself as an alert carrying title and message', async () => {
    await renderInTheme(<Banner title="Payment is late" message="10 days of grace left." />);
    const banner = screen.getByTestId('banner');
    expect(banner.props.accessibilityRole).toBe('alert');
    expect(banner.props.accessibilityLabel).toBe('Payment is late. 10 days of grace left.');
  });

  it('drops the message from the label when there is none', async () => {
    await renderInTheme(<Banner title="Saved" tone="success" />);
    expect(screen.getByTestId('banner').props.accessibilityLabel).toBe('Saved');
  });

  it.each(TONE_CASES)('paints the %s tone in %s and gives it an icon', async (tone, scheme) => {
    await renderInTheme(<Banner title={tone} tone={tone} />, scheme);
    const skin = BANNER_TONES[tone];
    const style = flattenStyle(screen.getByTestId('banner').props.style);
    expect(style.backgroundColor).toBe(colorsFor(scheme)[skin.bg]);
    expect(style.borderColor).toBe(colorsFor(scheme)[skin.fg]);
    expect(screen.getByTestId(`icon-${skin.icon}`, INCLUDING_HIDDEN)).toBeTruthy();
  });

  it('gives each tone a distinguishable icon, so colour is never the only signal', () => {
    expect(BANNER_TONES.success.icon).not.toBe(BANNER_TONES.info.icon);
    expect(BANNER_TONES.warning.icon).not.toBe(BANNER_TONES.info.icon);
    expect(BANNER_TONES.danger.icon).not.toBe(BANNER_TONES.success.icon);
  });

  it('lets the caller override the tone icon', async () => {
    await renderInTheme(<Banner title="Late" tone="warning" icon="clock" />);
    expect(screen.getByTestId('icon-clock', INCLUDING_HIDDEN)).toBeTruthy();
  });

  it('has no dismiss control unless onDismiss is given', async () => {
    await renderInTheme(<Banner title="Static" />);
    expect(screen.queryByTestId('banner-dismiss')).toBeNull();
  });

  it('dismisses through a labelled button', async () => {
    const onDismiss = jest.fn();
    await renderInTheme(<Banner title="Dismiss me" onDismiss={onDismiss} />);
    const button = screen.getByRole('button', { name: 'Dismiss' });
    await fireEvent.press(button);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('accepts a custom dismiss label', async () => {
    await renderInTheme(
      <Banner title="Bye" onDismiss={() => undefined} dismissAccessibilityLabel="Hide reminder" />,
    );
    expect(screen.getByRole('button', { name: 'Hide reminder' })).toBeTruthy();
  });

  it('is a radius-12 card, not a full-bleed strip', async () => {
    await renderInTheme(<Banner title="Shape" />);
    expect(flattenStyle(screen.getByTestId('banner').props.style).borderRadius).toBe(tokens.radii.lg);
  });
});
