/**
 * The signed-out stack paints the theme background behind its scenes, so moving
 * between sign-in and sign-up in dark mode never flashes the navigator's default
 * white.
 */
import { render, screen } from '@testing-library/react-native';

import AuthLayout from '../../../app/(auth)/_layout';
import { darkTheme, lightTheme } from '../../theme/tokens';

const mockScreenOptions: Record<string, unknown>[] = [];

jest.mock('expo-router', () => ({
  Stack: ({ screenOptions }: { screenOptions: Record<string, unknown> }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { View } = require('react-native');
    mockScreenOptions.push(screenOptions);
    return <View testID="auth-stack" />;
  },
}));

beforeEach(() => {
  mockScreenOptions.length = 0;
});

it('hides the native header and paints a theme background', async () => {
  await render(<AuthLayout />);

  expect(screen.getByTestId('auth-stack')).toBeTruthy();
  const options = mockScreenOptions.at(-1)!;
  expect(options.headerShown).toBe(false);
  // No ThemeProvider above it in this test: the fallback snapshot is the light scheme.
  expect(options.contentStyle).toEqual({ backgroundColor: lightTheme.bg });
  expect(lightTheme.bg).not.toBe(darkTheme.bg);
});
