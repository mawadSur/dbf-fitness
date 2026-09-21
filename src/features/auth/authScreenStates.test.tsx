/**
 * The state matrix for the two redesigned auth screens: idle, invalid (inline,
 * on blur and on submit), mutation pending, server error, offline, success and
 * the brand/accessibility guarantees. The pre-existing payload/redirect coverage
 * lives in src/features/diet/authScreens.test.tsx and is untouched.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import SignInScreen from '../../../app/(auth)/sign-in';
import SignUpScreen from '../../../app/(auth)/sign-up';
import { AUTH_VALUE_PROP } from '../../components/auth';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockSignIn = jest.fn();
const mockSignUp = jest.fn();
const mockUpsert = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
    back: jest.fn(),
    setParams: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('../../services/supabase/client', () => ({
  supabase: {
    auth: {
      signInWithPassword: (...args: unknown[]) => mockSignIn(...args),
      signUp: (...args: unknown[]) => mockSignUp(...args),
    },
    from: () => ({ upsert: (...args: unknown[]) => mockUpsert(...args) }),
  },
}));

const metrics = {
  frame: { x: 0, y: 0, width: 360, height: 640 },
  insets: { top: 24, left: 0, right: 0, bottom: 16 },
};

async function renderScreen(ui: React.ReactElement) {
  return await render(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);
}

async function fillSignIn(email: string, password: string) {
  await fireEvent.changeText(screen.getByLabelText('Email'), email);
  await fireEvent.changeText(screen.getByLabelText('Password'), password);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpsert.mockResolvedValue({ error: null });
});

describe('sign-in: idle', () => {
  it('shows the brand moment, both labels and an inert primary button', async () => {
    await renderScreen(<SignInScreen />);

    expect(screen.getByTestId('auth-brand-header')).toBeTruthy();
    expect(screen.getByLabelText('DBF Fitness')).toBeTruthy(); // the Logo
    expect(screen.getByText(AUTH_VALUE_PROP)).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Sign in' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();

    const submit = screen.getByTestId('sign-in-submit');
    expect(submit.props.accessibilityState).toMatchObject({ disabled: true, busy: false });
  });

  it('offers a link to sign-up that is one full-size target', async () => {
    await renderScreen(<SignInScreen />);
    const link = screen.getByTestId('sign-in-switch');
    expect(link.props.accessibilityRole).toBe('link');
    expect(link.props.accessibilityLabel).toBe('New here? Create account');
    // 3-item-row rule: the row wraps instead of clipping at large font scales.
    expect(link.props.style[0]).toMatchObject({ flexWrap: 'wrap', minHeight: 44 });
    await fireEvent.press(link);
    expect(mockPush).toHaveBeenCalledWith('/sign-up');
  });

  it('reveals and re-hides the password without leaving the field', async () => {
    await renderScreen(<SignInScreen />);
    const toggle = screen.getByTestId('sign-in-password-reveal');
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);

    await fireEvent.press(toggle);
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false);
    expect(screen.getByTestId('sign-in-password-reveal').props.accessibilityLabel).toBe(
      'Hide password'
    );

    await fireEvent.press(screen.getByTestId('sign-in-password-reveal'));
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
  });
});

describe('sign-in: invalid', () => {
  it('validates the email on blur, under the field, in a live region', async () => {
    await renderScreen(<SignInScreen />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'nope');
    await fireEvent(screen.getByLabelText('Email'), 'blur');

    expect(screen.getByTestId('sign-in-email-message')).toHaveTextContent(
      'Enter a valid email address, like you@example.com.'
    );
    expect(screen.getByLabelText('Email').props['aria-invalid']).toBe(true);
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('shows every field error on a submit attempt and sends no request', async () => {
    await renderScreen(<SignInScreen />);
    await fillSignIn('nope', 'pw');
    await fireEvent.press(screen.getByTestId('sign-in-submit'));

    expect(screen.getByTestId('sign-in-email-message')).toHaveTextContent(
      'Enter a valid email address, like you@example.com.'
    );
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe('sign-in: pending, error, offline, success', () => {
  it('announces the pending mutation and blocks a second press', async () => {
    let release: (value: { error: null }) => void = () => undefined;
    mockSignIn.mockReturnValue(new Promise((resolve) => (release = resolve)));

    await renderScreen(<SignInScreen />);
    await fillSignIn('jordan@example.test', 'password123');
    // Not awaited on purpose: the request is still in flight while we assert the
    // pending state, so `act` must not be given the chance to settle it.
    fireEvent.press(screen.getByTestId('sign-in-submit'));

    await waitFor(() =>
      expect(screen.getByTestId('sign-in-submit').props.accessibilityState).toMatchObject({
        disabled: true,
        busy: true,
      })
    );
    expect(screen.getByTestId('button-spinner')).toBeTruthy();

    fireEvent.press(screen.getByTestId('sign-in-submit'));
    expect(mockSignIn).toHaveBeenCalledTimes(1);

    release({ error: null });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  });

  it('reads a network failure as offline, with a retryable form', async () => {
    mockSignIn.mockResolvedValue({ error: new TypeError('Network request failed') });

    await renderScreen(<SignInScreen />);
    await fillSignIn('jordan@example.test', 'password123');
    await fireEvent.press(screen.getByTestId('sign-in-submit'));

    expect(await screen.findByText('You appear to be offline')).toBeTruthy();
    expect(
      screen.getByText("Can't reach the server. Check your connection and try again.")
    ).toBeTruthy();
    expect(screen.getByTestId('sign-in-submit').props.accessibilityState.busy).toBe(false);
  });

  it('trims the typed email before signing in', async () => {
    mockSignIn.mockResolvedValue({ error: null });

    await renderScreen(<SignInScreen />);
    await fillSignIn('  jordan@example.test  ', 'password123');
    await fireEvent.press(screen.getByTestId('sign-in-submit'));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(mockSignIn).toHaveBeenCalledWith({
      email: 'jordan@example.test',
      password: 'password123',
    });
  });
});

describe('sign-up: idle, invalid, pending, offline', () => {
  it('shows the brand moment, three labelled fields and the password rule', async () => {
    await renderScreen(<SignUpScreen />);

    expect(screen.getByRole('header', { name: 'Create account' })).toBeTruthy();
    expect(screen.getByText(AUTH_VALUE_PROP)).toBeTruthy();
    expect(screen.getByText('Full name')).toBeTruthy();
    expect(screen.getByTestId('sign-up-password-message')).toHaveTextContent(
      'At least 6 characters.'
    );
    expect(screen.getByTestId('sign-up-submit').props.accessibilityState).toMatchObject({
      disabled: true,
      busy: false,
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('rejects a too-short password before the request, under the field', async () => {
    await renderScreen(<SignUpScreen />);
    await fireEvent.changeText(screen.getByLabelText('Full name'), 'Ada Lovelace');
    await fireEvent.changeText(screen.getByLabelText('Email'), 'ada@example.test');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'short');
    await fireEvent.press(screen.getByTestId('sign-up-submit'));

    expect(screen.getByTestId('sign-up-password-message')).toHaveTextContent(
      'Use at least 6 characters.'
    );
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('announces the pending mutation, then reads a network failure as offline', async () => {
    let release: (value: { data: { user: null }; error: Error }) => void = () => undefined;
    mockSignUp.mockReturnValue(new Promise((resolve) => (release = resolve)));

    await renderScreen(<SignUpScreen />);
    await fireEvent.changeText(screen.getByLabelText('Full name'), 'Ada Lovelace');
    await fireEvent.changeText(screen.getByLabelText('Email'), 'ada@example.test');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'password123');
    fireEvent.press(screen.getByTestId('sign-up-submit'));

    await waitFor(() =>
      expect(screen.getByTestId('sign-up-submit').props.accessibilityState.busy).toBe(true)
    );

    release({ data: { user: null }, error: new TypeError('Network request failed') });

    expect(await screen.findByText('You appear to be offline')).toBeTruthy();
    expect(screen.getByTestId('sign-up-submit').props.accessibilityState.busy).toBe(false);
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
