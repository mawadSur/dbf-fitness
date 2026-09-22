import { render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ConfigGate, currentSupabaseVerdict } from './ConfigGate';
import { NOT_CONFIGURED_TITLE } from './env';

/** iPhone 14 metrics: the gate pads itself off the notch and the home indicator. */
async function renderGate(ui: ReactElement) {
  return await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      {ui}
    </SafeAreaProvider>
  );
}

const OLD_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const OLD_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

afterEach(() => {
  if (OLD_URL === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  else process.env.EXPO_PUBLIC_SUPABASE_URL = OLD_URL;
  if (OLD_KEY === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = OLD_KEY;
});

describe('ConfigGate', () => {
  it('renders nothing when the build is configured', async () => {
    await renderGate(<ConfigGate verdict={{ blocked: false, problems: [] }} />);
    expect(screen.queryByTestId('config-gate')).toBeNull();
  });

  it('renders nothing in dev even with a local URL, so the local stack still works', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'local-anon-key';
    // Jest runs with __DEV__ true, which is exactly the dev case.
    expect(currentSupabaseVerdict().blocked).toBe(false);
  });

  it('blocks the app with the honest screen when the verdict says so', async () => {
    await renderGate(<ConfigGate verdict={{ blocked: true, problems: ['local_url', 'missing_key'] }} />);

    expect(screen.getByTestId('config-gate')).toBeTruthy();
    expect(screen.getByText(NOT_CONFIGURED_TITLE)).toBeTruthy();
    const problems = screen.getByTestId('config-gate-problems');
    expect(problems).toBeTruthy();
  });

  it('names the causes without ever printing the key', async () => {
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'super-secret-anon-key';
    await renderGate(<ConfigGate verdict={{ blocked: true, problems: ['placeholder_key'] }} />);

    expect(screen.queryByText(/super-secret-anon-key/)).toBeNull();
    expect(screen.getByText(/placeholder/i)).toBeTruthy();
  });
});
