import { Stack } from 'expo-router';

import { useOptionalTheme } from '../../src/theme/ThemeProvider';

/**
 * The signed-out stack. Each screen owns its own `ScreenShell` (headers off), so
 * the only thing the layout contributes is the scene background: without it the
 * navigator paints its default white behind the transition and dark mode flashes
 * white when you move between sign-in and sign-up.
 */
export default function AuthLayout() {
  const { colors } = useOptionalTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}
