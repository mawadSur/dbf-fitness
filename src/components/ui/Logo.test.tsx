import { screen } from '@testing-library/react-native';

import { lightTheme } from '../../theme/tokens';
import { Logo, LOGO_ASPECT_RATIO, LOGO_BADGE_PADDING, LOGO_BADGE_RADIUS } from './Logo';
import { flattenStyle, renderInTheme } from './testing';

describe('Logo', () => {
  it('is an image with an accessible name', async () => {
    await renderInTheme(<Logo />);
    const image = screen.getByRole('image', { name: 'DBF Fitness' });
    expect(image).toBeTruthy();
  });

  it('accepts a caller-supplied name', async () => {
    await renderInTheme(<Logo accessibilityLabel="DBF Fitness home" />);
    expect(screen.getByRole('image', { name: 'DBF Fitness home' })).toBeTruthy();
  });

  it('keeps the artwork aspect ratio at the requested height', async () => {
    await renderInTheme(<Logo height={48} />);
    const style = flattenStyle(screen.getByTestId('logo-image').props.style);
    expect(style.height).toBe(48);
    expect(style.width).toBeCloseTo(48 * LOGO_ASPECT_RATIO, 5);
  });

  it('places itself on a light rounded badge, where the black wordmark would otherwise vanish', async () => {
    await renderInTheme(<Logo />, 'dark');
    const badge = flattenStyle(screen.getByTestId('logo-badge').props.style);
    expect(badge.backgroundColor).toBe(lightTheme.bgSoft);
    expect(badge.borderRadius).toBe(LOGO_BADGE_RADIUS);
    expect(badge.padding).toBe(LOGO_BADGE_PADDING);
  });

  // The two theme tests assert the SAME constants on purpose: that is the
  // regression. `auto` used to mean "badge in dark only", so the brand mark on
  // sign-in was a flush 40pt artwork in light and a 64pt round badge in dark.
  it('is the same badge in light mode — one treatment, not one per theme', async () => {
    await renderInTheme(<Logo />, 'light');
    const badge = flattenStyle(screen.getByTestId('logo-badge').props.style);
    expect(badge.backgroundColor).toBe(lightTheme.bgSoft);
    expect(badge.borderRadius).toBe(LOGO_BADGE_RADIUS);
    expect(badge.padding).toBe(LOGO_BADGE_PADDING);
  });

  it('renders the artwork at the same size in both themes', async () => {
    await renderInTheme(<Logo height={40} />, 'light');
    const style = flattenStyle(screen.getByTestId('logo-image').props.style);
    expect(style.height).toBe(40);
    expect(style.width).toBeCloseTo(40 * LOGO_ASPECT_RATIO, 5);
  });

  it('can be forced onto the badge in light mode', async () => {
    await renderInTheme(<Logo badge="always" />, 'light');
    expect(screen.getByTestId('logo-badge')).toBeTruthy();
  });

  it('can be forced off the badge in dark mode', async () => {
    await renderInTheme(<Logo badge="never" />, 'dark');
    expect(screen.queryByTestId('logo-badge')).toBeNull();
  });

  it('scales the artwork inside the badge without stretching it', async () => {
    await renderInTheme(<Logo badge="always" height={32} />);
    expect(screen.getByTestId('logo-image').props.resizeMode).toBe('contain');
  });
});
