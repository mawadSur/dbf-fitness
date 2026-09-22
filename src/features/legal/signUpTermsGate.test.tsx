/**
 * The sign-up half of Apple guideline 1.2: nobody gets an account without an ACTIVE
 * agreement to the Terms and Privacy Policy, and the agreement is RECORDED server-side.
 *
 * Why this file exists: the other sign-up suites only ever press `sign-up-terms` on their
 * way to the happy path, so deleting `|| !agreedToTerms` from the submit guard left all of
 * them green. Nothing asserted the gate, and nothing asserted `accept_terms` ever fired.
 * Both are load-bearing for review, so both are pinned here.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import SignUpScreen from '../../../app/(auth)/sign-up';
import { TERMS_VERSION } from '../../config/legal';

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn() }) }));

const mockSignUp = jest.fn();
const mockRpc = jest.fn();
jest.mock('../../services/supabase/client', () => ({
  supabase: {
    auth: { signUp: (...args: unknown[]) => mockSignUp(...args) },
    from: () => ({ upsert: jest.fn().mockResolvedValue({ error: null }) }),
    rpc: (...args: unknown[]) => mockRpc(...args),
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

/** Fills the three real fields and deliberately leaves the checkbox alone. */
async function fillFieldsOnly() {
  await fireEvent.changeText(screen.getByTestId('sign-up-name'), 'Dana Ali');
  await fireEvent.changeText(screen.getByTestId('sign-up-email'), 'dana@example.com');
  await fireEvent.changeText(screen.getByTestId('sign-up-password'), 'longenoughpw');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSignUp.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  mockRpc.mockResolvedValue({ data: null, error: null });
});

describe('sign-up: the terms checkbox actually gates submission', () => {
  it('keeps the submit button disabled and announced as disabled until the box is ticked', async () => {
    await renderSignUp(<SignUpScreen />);
    await fillFieldsOnly();

    // Colour alone would not be enough — a screen reader has to hear it too.
    expect(screen.getByTestId('sign-up-submit').props.accessibilityState).toMatchObject({
      disabled: true,
    });

    await fireEvent.press(screen.getByTestId('sign-up-terms'));

    expect(screen.getByTestId('sign-up-submit').props.accessibilityState).toMatchObject({
      disabled: false,
    });
  });

  it('creates NO account when the box is never ticked, however hard the button is pressed', async () => {
    await renderSignUp(<SignUpScreen />);
    await fillFieldsOnly();

    await fireEvent.press(screen.getByTestId('sign-up-submit'));
    await fireEvent.press(screen.getByTestId('sign-up-submit'));

    expect(mockSignUp).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('does not let the keyboard "go" key smuggle a submit past the unticked box', async () => {
    await renderSignUp(<SignUpScreen />);
    await fillFieldsOnly();

    // `onSubmitEditing` calls handleSubmit directly; the disabled button cannot block it.
    await fireEvent(screen.getByTestId('sign-up-password'), 'submitEditing');

    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('tells the user WHY submit is dead as soon as the box is the only thing missing', async () => {
    await renderSignUp(<SignUpScreen />);

    // Nothing filled in yet: the terms error would be noise among three empty fields.
    expect(screen.getByTestId('sign-up-terms')).toBeTruthy();
    expect(screen.queryByTestId('sign-up-terms-error')).toBeNull();

    await fillFieldsOnly();

    // Now the checkbox is the sole blocker, so the reason must be visible without a tap.
    expect(screen.getByTestId('sign-up-terms-error')).toBeTruthy();
  });

  it('clears the reason once the box is ticked', async () => {
    await renderSignUp(<SignUpScreen />);
    await fillFieldsOnly();
    await fireEvent.press(screen.getByTestId('sign-up-terms'));

    expect(screen.queryByTestId('sign-up-terms-error')).toBeNull();
  });
});

describe('sign-up: the agreement is recorded server-side', () => {
  it('calls accept_terms with the current version after the account is created', async () => {
    await renderSignUp(<SignUpScreen />);
    await fillFieldsOnly();
    await fireEvent.press(screen.getByTestId('sign-up-terms'));
    await fireEvent.press(screen.getByTestId('sign-up-submit'));

    await waitFor(() => expect(mockSignUp).toHaveBeenCalled());
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('accept_terms', { p_version: TERMS_VERSION })
    );
  });

  it('never records an acceptance for an account that was not created', async () => {
    mockSignUp.mockResolvedValue({ data: { user: null }, error: new Error('nope') });

    await renderSignUp(<SignUpScreen />);
    await fillFieldsOnly();
    await fireEvent.press(screen.getByTestId('sign-up-terms'));
    await fireEvent.press(screen.getByTestId('sign-up-submit'));

    await waitFor(() => expect(mockSignUp).toHaveBeenCalled());
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('does NOT strand the new member when recording the acceptance fails', async () => {
    // The account exists by then; the only retry available produces "User already
    // registered". TermsGate re-asks on the next launch, so this must stay non-fatal.
    mockRpc.mockRejectedValue(new Error('offline'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await renderSignUp(<SignUpScreen />);
    await fillFieldsOnly();
    await fireEvent.press(screen.getByTestId('sign-up-terms'));
    await fireEvent.press(screen.getByTestId('sign-up-submit'));

    await waitFor(() => expect(mockRpc).toHaveBeenCalled());
    expect(screen.queryByTestId('sign-up-error')).toBeNull();
    warn.mockRestore();
  });
});
