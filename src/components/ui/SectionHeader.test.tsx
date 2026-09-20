import { screen } from '@testing-library/react-native';

import { typeScale } from '../../theme/tokens';
import { Button } from './Button';
import { SectionHeader } from './SectionHeader';
import { flattenStyle, renderInTheme } from './testing';

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
});
