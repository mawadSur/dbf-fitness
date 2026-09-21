/**
 * Render harness for the progress screens' tests.
 *
 * Test-only: nothing in `app/` imports it, so it never enters a bundle. It exists
 * so the calendar and effort suites mount a screen the same way — inside a
 * `ThemeProvider` pinned to a scheme, a `SafeAreaProvider` with a real notch, and
 * a fresh `QueryClient` per test (a shared one would leak one test's cache into
 * the next and make the loading states unobservable).
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Appearance } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '../../theme/ThemeProvider';
import type { ThemeName } from '../../theme/tokens';
import { PHONE_METRICS } from '../ui/testing';

export const ok = (data: unknown) => ({ data, error: null });
export const fail = (message: string) => ({ data: null, error: new Error(message) });
/** What Supabase returns when the device has no connection. */
export const offline = () => ({ data: null, error: new Error('Network request failed') });

export function renderScreen(
  ui: ReactElement,
  { scheme = 'light' as ThemeName }: { scheme?: ThemeName } = {},
) {
  jest.spyOn(Appearance, 'getColorScheme').mockReturnValue(scheme);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <SafeAreaProvider initialMetrics={PHONE_METRICS}>
      <QueryClientProvider client={client}>
        <ThemeProvider>{ui}</ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}
