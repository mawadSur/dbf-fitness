import { render, screen } from '@testing-library/react-native';

import { PlaceholderScreen } from './PlaceholderScreen';

describe('PlaceholderScreen', () => {
  it('renders the title as a header and the description as body text', async () => {
    await render(<PlaceholderScreen title="Home" description="Coming soon." />);

    const title = screen.getByRole('header');
    expect(title).toHaveTextContent('Home');
    expect(screen.getByText('Coming soon.')).toBeTruthy();
    expect(screen.queryAllByRole('header')).toHaveLength(1);
  });

  it('renders exactly the props it is given and updates on rerender', async () => {
    const { rerender } = await render(<PlaceholderScreen title="Food" description="Soon." />);
    expect(screen.getByRole('header')).toHaveTextContent('Food');
    expect(screen.queryByText('Home')).toBeNull();

    await rerender(<PlaceholderScreen title="Workout" description="Later." />);
    expect(screen.getByRole('header')).toHaveTextContent('Workout');
    expect(screen.getByText('Later.')).toBeTruthy();
    expect(screen.queryByText('Soon.')).toBeNull();
  });

  it('does not truncate long text', async () => {
    const long = 'A very long description '.repeat(20).trim();
    await render(<PlaceholderScreen title="T" description={long} />);
    expect(screen.getByText(long).props.numberOfLines).toBeUndefined();
  });
});
