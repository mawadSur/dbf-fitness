import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Keyboard, Text as MockText } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import SignInScreen from '../../../app/(auth)/sign-in';
import SignUpScreen from '../../../app/(auth)/sign-up';
import { fakeCalls, fakeSupabase, resetFake, setTable } from './fakeSupabase';

const mockReplace = jest.fn();
const mockSetParams = jest.fn();
let mockParams: Record<string, string | undefined> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: jest.fn(),
    back: jest.fn(),
    setParams: mockSetParams,
  }),
  useLocalSearchParams: () => mockParams,
  Link: ({ children, ...rest }: { children: React.ReactNode }) => {
    return <MockText {...rest}>{children}</MockText>;
  },
}));
jest.mock('../../services/supabase/client', () => ({
  supabase: jest.requireActual('./fakeSupabase').fakeSupabase,
}));

const auth = fakeSupabase.auth;

async function renderScreen(ui: React.ReactElement) {
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

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  resetFake();
});

describe('SignInScreen', () => {
  it('has keyboard-friendly, autofill-friendly fields and a scroll container that keeps taps', async () => {
    await renderScreen(<SignInScreen />);
    const email = screen.getByLabelText('Email');
    const password = screen.getByLabelText('Password');

    expect(email.props.keyboardType).toBe('email-address');
    expect(email.props.textContentType).toBe('emailAddress');
    expect(email.props.autoComplete).toBe('email');
    expect(email.props.returnKeyType).toBe('next');
    expect(password.props.secureTextEntry).toBe(true);
    expect(password.props.textContentType).toBe('password');
    expect(password.props.autoComplete).toBe('current-password');
    expect(password.props.returnKeyType).toBe('done');
    // Redesign: labels are visible above the field instead of placeholder-only,
    // so there is no low-contrast placeholder left to check.
    expect(email.props.placeholder).toBeUndefined();
    expect(screen.getByText('Email')).toBeTruthy();
    expect(screen.getByText('Password')).toBeTruthy();
    expect(screen.getByTestId('sign-in-screen-scroll').props.keyboardShouldPersistTaps).toBe(
      'handled'
    );
  });

  it('disables submit until both fields are filled and exposes that state', async () => {
    await renderScreen(<SignInScreen />);
    const button = screen.getByRole('button', { name: 'Sign in' });
    expect(button.props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(screen.getByLabelText('Email'), 'a@b.co');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'pw');
    expect(screen.getByRole('button', { name: 'Sign in' }).props.accessibilityState.disabled).toBe(
      false
    );
  });

  it('dismisses the keyboard, signs in, then routes home', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    auth.signInWithPassword.mockResolvedValue({ error: null });
    await renderScreen(<SignInScreen />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'a@b.co');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'pw');
    await fireEvent(screen.getByLabelText('Password'), 'submitEditing');

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(dismiss).toHaveBeenCalled();
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'a@b.co',
      password: 'pw',
    });
  });

  it('does not submit from the keyboard while a field is empty', async () => {
    await renderScreen(<SignInScreen />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'a@b.co');
    await fireEvent(screen.getByLabelText('Password'), 'submitEditing');
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('shows a failure as a live-region alert and stays on the screen', async () => {
    auth.signInWithPassword.mockResolvedValue({
      error: { message: 'Invalid login credentials' },
    });
    await renderScreen(<SignInScreen />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'a@b.co');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'bad');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

    // Redesign: the raw GoTrue string never reaches the member; the Banner says what
    // to do instead, inside a polite live region so it is announced on appearance.
    const alert = await screen.findByRole('alert');
    expect(alert).toBeTruthy();
    expect(screen.queryByText('Invalid login credentials')).toBeNull();
    expect(
      screen.getByText('That email and password do not match. Check them and try again.')
    ).toBeTruthy();
    expect(screen.getByText('That did not work')).toBeTruthy();
    expect(screen.getByTestId('sign-in-error-live').props.accessibilityLiveRegion).toBe('polite');
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe('SignInScreen deleted-account notice', () => {
  it('shows nothing without the param', async () => {
    await renderScreen(<SignInScreen />);
    expect(screen.queryByText('Your account was deleted.')).toBeNull();
    expect(mockSetParams).not.toHaveBeenCalled();
  });

  it('shows a dismissible live-region alert for ?deleted=1 and clears the param', async () => {
    mockParams = { deleted: '1' };
    await renderScreen(<SignInScreen />);
    expect(screen.getByText('Your account was deleted.')).toBeTruthy();
    expect(screen.getByTestId('deleted-notice').props.accessibilityRole).toBe('alert');
    expect(screen.getByTestId('deleted-notice-live').props.accessibilityLiveRegion).toBe('polite');
    await waitFor(() => expect(mockSetParams).toHaveBeenCalledWith({ deleted: undefined }));

    await fireEvent.press(screen.getByRole('button', { name: 'Dismiss notice' }));
    expect(screen.queryByText('Your account was deleted.')).toBeNull();
  });

  it('ignores other values of the param', async () => {
    mockParams = { deleted: '0' };
    await renderScreen(<SignInScreen />);
    expect(screen.queryByText('Your account was deleted.')).toBeNull();
  });
});

describe('SignUpScreen', () => {
  it('uses new-password autofill and chains next/done return keys', async () => {
    await renderScreen(<SignUpScreen />);
    expect(screen.getByLabelText('Full name').props.textContentType).toBe('name');
    expect(screen.getByLabelText('Full name').props.returnKeyType).toBe('next');
    expect(screen.getByLabelText('Email').props.returnKeyType).toBe('next');
    const password = screen.getByLabelText('Password');
    expect(password.props.textContentType).toBe('newPassword');
    expect(password.props.autoComplete).toBe('new-password');
    expect(password.props.returnKeyType).toBe('done');
  });

  it('keeps the exact sign-up payload: role member and name only, no coach or subscription', async () => {
    auth.signUp.mockResolvedValue({
      data: { user: { id: 'new-user' } },
      error: null,
    });
    setTable('profiles', () => ({ data: null, error: null }));
    await renderScreen(<SignUpScreen />);
    await fireEvent.changeText(screen.getByLabelText('Full name'), 'Ada Lovelace');
    await fireEvent.changeText(screen.getByLabelText('Email'), 'ada@b.co');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'secret12');
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'ada@b.co',
      password: 'secret12',
      options: { data: { full_name: 'Ada Lovelace' } },
    });
    const upsert = fakeCalls.find((call) => call.method === 'upsert');
    expect(upsert?.table).toBe('profiles');
    expect(upsert?.payload).toEqual({
      id: 'new-user',
      role: 'member',
      full_name: 'Ada Lovelace',
    });
  });

  it('shows a sign-up error and re-enables the form', async () => {
    auth.signUp.mockResolvedValue({
      data: { user: null },
      error: { message: 'User already registered' },
    });
    await renderScreen(<SignUpScreen />);
    await fireEvent.changeText(screen.getByLabelText('Full name'), 'Ada');
    await fireEvent.changeText(screen.getByLabelText('Email'), 'ada@b.co');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'secret12');
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    // GoTrue's own copy is already member-facing, so it passes through as the detail.
    expect(screen.getByText('User already registered')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Create account' }).props.accessibilityState.busy
    ).toBe(false);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // Regression guards for the hardening in src/features/auth/signUpName.ts — the mobile
  // polish must not reintroduce the stuck-onboarding bug it fixed.
  it('sends the server-truncated name and never blocks onboarding on a profile-name error', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    auth.signUp.mockResolvedValue({ data: { user: { id: 'new-user' } }, error: null });
    setTable('profiles', () => ({
      data: null,
      error: Object.assign(
        new Error('new row for relation "profiles" violates check constraint "profiles_text_bounds"'),
        { code: '23514' }
      ),
    }));
    const longName = 'a'.repeat(200);
    await renderScreen(<SignUpScreen />);
    await fireEvent.changeText(screen.getByLabelText('Full name'), longName);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'ada@b.co');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'secret12');
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(auth.signUp.mock.calls[0][0].options.data.full_name).toHaveLength(120);
    expect(screen.queryByRole('alert')).toBeNull();
    warn.mockRestore();
  });

  it('never shows raw Postgres text for a sign-up failure', async () => {
    auth.signUp.mockResolvedValue({
      data: { user: null },
      error: Object.assign(new Error('duplicate key value violates unique constraint "x"'), {
        code: '23505',
      }),
    });
    await renderScreen(<SignUpScreen />);
    await fireEvent.changeText(screen.getByLabelText('Full name'), 'Ada');
    await fireEvent.changeText(screen.getByLabelText('Email'), 'ada@b.co');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'secret12');
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Could not create your account. Please try again.')).toBeTruthy();
    expect(screen.queryByText(/violates|duplicate key/i)).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
