import { render, screen } from '@testing-library/react-native';

import { Appearance } from 'react-native';

import { ThemeProvider } from '../theme/ThemeProvider';
import { colors, lightTheme } from '../theme/tokens';
import { ScoreRing } from './ScoreRing';

describe('theme tokens', () => {
  it('primaryStrong is the darker green used for text on white', () => {
    expect(colors.primaryStrong).toBe('#047857');
    expect(colors.primaryStrong).not.toBe(colors.primary);
  });
});

describe('ScoreRing', () => {
  it('exposes one accessible progress summary', async () => {
    await render(<ScoreRing value={5} max={30} label="Day streak" />);
    const ring = screen.getByRole('progressbar');
    expect(ring.props.accessibilityLabel).toBe('Day streak 5 of 30');
    expect(ring.props.accessibilityValue).toEqual({ min: 0, max: 30, now: 5 });
  });

  it('clamps out-of-range values in the summary', async () => {
    await render(<ScoreRing value={99} max={30} label="Day streak" />);
    expect(screen.getByRole('progressbar').props.accessibilityLabel).toBe('Day streak 30 of 30');
    await screen.rerender(<ScoreRing value={-4} max={30} label="Streak" />);
    expect(screen.getByRole('progressbar').props.accessibilityLabel).toBe('Streak 0 of 30');
  });
});

describe('ScoreRing palette pin', () => {
  /*
   * The home screen still paints the hard-coded white legacy page, so the ring
   * must keep the light palette even when the member's theme resolves to dark
   * — the same reason the status bar and the tab bar are pinned.
   */
  it('keeps the light palette under the dark theme', async () => {
    jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('dark');
    await render(
      <ThemeProvider>
        <ScoreRing value={5} max={30} label="Day streak" />
      </ThemeProvider>,
    );
    expect(screen.getByText('5').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: lightTheme.text })]),
    );
    jest.restoreAllMocks();
  });
});
