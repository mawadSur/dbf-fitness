import { screen } from '@testing-library/react-native';

import { typeScale } from '../../theme/tokens';
import { Button } from './Button';
import { SectionHeader } from './SectionHeader';
import { colorsFor, flattenStyle, renderInTheme } from './testing';

describe('SectionHeader', () => {
  it('announces the title as a heading', async () => {
    await renderInTheme(<SectionHeader title="This week" />);
    expect(screen.getByRole('header', { name: 'This week' })).toBeTruthy();
  });

  it('is an h2, so the screen keeps exactly one h1', async () => {
    await renderInTheme(<SectionHeader title="This week" />);
    const style = flattenStyle(screen.getByText('This week').props.style);
    expect(style.fontSize).toBe(typeScale.h2.fontSize);
    expect(style.fontFamily).toBe(typeScale.h2.fontFamily);
  });

  it('renders the eyebrow and the subtitle', async () => {
    await renderInTheme(
      <SectionHeader title="This week" eyebrow="Progress" subtitle="4 of 5 sessions done" />,
    );
    expect(screen.getByText('Progress')).toBeTruthy();
    expect(screen.getByText('4 of 5 sessions done')).toBeTruthy();
  });

  it('omits the eyebrow and subtitle when not given', async () => {
    await renderInTheme(<SectionHeader title="This week" testID="sh" />);
    expect(screen.queryByText('Progress')).toBeNull();
    expect(screen.getByTestId('sh')).toBeTruthy();
  });

  it('places a single trailing action', async () => {
    await renderInTheme(
      <SectionHeader
        title="This week"
        action={<Button label="See all" variant="ghost" size="sm" onPress={() => undefined} />}
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'See all' })).toBeTruthy();
  });

  /*
   * The header draws ink but no page background, so a light-pinned colour here
   * would be invisible on the dark page rather than merely off-brand: the light
   * `text` is #0B1F1A, which on the dark `bg` #011A14 is 1.1:1. Every one of the
   * three text slots is asserted, because the eyebrow and the subtitle take
   * their colour from different tokens than the title and were the ones a
   * title-only check would have missed.
   */
  it.each(['light', 'dark'] as const)('takes all three text colours from the %s theme', async (scheme) => {
    await renderInTheme(
      <SectionHeader title="This week" eyebrow="Progress" subtitle="4 of 5 sessions done" />,
      scheme,
    );
    const colors = colorsFor(scheme);
    expect(flattenStyle(screen.getByText('This week').props.style).color).toBe(colors.text);
    // The eyebrow defaults to `tone="brand"`, not to a grey.
    expect(flattenStyle(screen.getByText('Progress').props.style).color).toBe(colors.brand);
    expect(flattenStyle(screen.getByText('4 of 5 sessions done').props.style).color).toBe(
      colors.textMuted,
    );
  });

  /*
   * Guards the case above: it asserts "the render equals this theme's token",
   * which would also hold if both themes happened to define the same colour —
   * the light pin the redesign removed would then pass unnoticed. These three
   * tokens must genuinely differ between the palettes.
   */
  it('uses genuinely different tokens in the two themes', () => {
    const light = colorsFor('light');
    const dark = colorsFor('dark');
    expect(light.text).not.toBe(dark.text);
    expect(light.brand).not.toBe(dark.brand);
    expect(light.textMuted).not.toBe(dark.textMuted);
  });
});
