import { screen } from '@testing-library/react-native';

import { lightTheme } from '../../theme/tokens';
import { Logo, LOGO_ASPECT_RATIO, LOGO_BADGE_RADIUS } from './Logo';
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

  it('needs no badge on a light background', async () => {
    await renderInTheme(<Logo />, 'light');
    expect(screen.queryByTestId('logo-badge')).toBeNull();
  });

  it('places itself on a light rounded badge in dark mode, where the black wordmark would vanish', async () => {
    await renderInTheme(<Logo />, 'dark');
    const badge = flattenStyle(screen.getByTestId('logo-badge').props.style);
    expect(badge.backgroundColor).toBe(lightTheme.bgSoft);
    expect(badge.borderRadius).toBe(LOGO_BADGE_RADIUS);
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
