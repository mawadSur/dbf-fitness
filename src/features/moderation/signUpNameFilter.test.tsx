import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import SignUpScreen from '../../../app/(auth)/sign-up';

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn() }) }));

const mockSignUp = jest.fn();
jest.mock('../../services/supabase/client', () => ({
  supabase: {
    auth: { signUp: (...args: unknown[]) => mockSignUp(...args) },
    from: () => ({ upsert: jest.fn().mockResolvedValue({ error: null }) }),
    rpc: jest.fn().mockResolvedValue({ error: null }),
  },
}));

async function renderSignUp(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSignUp.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
});

describe('sign-up display name: objectionable-content filter', () => {
  it('refuses an objectionable name with a friendly, specific reason — never silently', async () => {
    await renderSignUp(<SignUpScreen />);

    const name = screen.getByTestId('sign-up-name');
    await fireEvent.changeText(name, 'fuck');
    await fireEvent(name, 'blur');

    expect(screen.getByText(/contains a word we do not allow/i)).toBeTruthy();
  });

  it('never submits a rejected name', async () => {
    await renderSignUp(<SignUpScreen />);

    await fireEvent.changeText(screen.getByTestId('sign-up-name'), 'fuck');
    await fireEvent.changeText(screen.getByTestId('sign-up-email'), 'a@b.com');
    await fireEvent.changeText(screen.getByTestId('sign-up-password'), 'longenoughpw');
    await fireEvent.press(screen.getByTestId('sign-up-terms'));
    await fireEvent.press(screen.getByTestId('sign-up-submit'));

    expect(mockSignUp).not.toHaveBeenCalled();
  });

  // The filter caps displayName at 120, but sign-up TRUNCATES an over-long name rather than
  // refusing it (src/features/auth/signUpName.ts). Feeding the filter the raw field instead of
  // the normalized one turned that truncation back into a hard block — the exact
  // stuck-onboarding bug signUpName.ts was written to fix.
  it('truncates an over-long name instead of blocking it on the length cap', async () => {
    await renderSignUp(<SignUpScreen />);

    const name = screen.getByTestId('sign-up-name');
    await fireEvent.changeText(name, 'a'.repeat(200));
    await fireEvent(name, 'blur');

    expect(screen.queryByText(/too long/i)).toBeNull();

    await fireEvent.changeText(screen.getByTestId('sign-up-email'), 'a@b.com');
    await fireEvent.changeText(screen.getByTestId('sign-up-password'), 'longenoughpw');
    await fireEvent.press(screen.getByTestId('sign-up-terms'));
    await fireEvent.press(screen.getByTestId('sign-up-submit'));

    await waitFor(() => expect(mockSignUp).toHaveBeenCalled());
    expect(mockSignUp.mock.calls[0][0].options.data.full_name).toHaveLength(120);
  });

  it('leaves ordinary names alone, including ones an over-eager filter would break', async () => {
    await renderSignUp(<SignUpScreen />);

    const name = screen.getByTestId('sign-up-name');
    for (const value of ['Dana Ali', 'Cockburn', 'Analia Scunthorpe']) {
      await fireEvent.changeText(name, value);
      await fireEvent(name, 'blur');
      expect(screen.queryByText(/contains a word we do not allow/i)).toBeNull();
    }
  });
});
