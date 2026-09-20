import { act, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

// The root layout is an expo-router route, so this test lives under src/: any *.test.* file
// inside app/ is picked up by Metro's require.context and bundled into the native app.
import RootLayout from '../../../app/_layout';
import { bindAuthAutoRefresh } from '../../services/supabase/autoRefresh';
import { supabase } from '../../services/supabase/client';
import * as SplashScreen from 'expo-splash-screen';

const mockReplace = jest.fn();
let mockSegments: string[] = [];

jest.mock('../../../global.css', () => ({}));
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  function Stack({ children }: { children?: unknown }) {
    return <View testID="stack">{children as never}</View>;
  }
  Stack.Screen = function Screen() {
    return null;
  };
  return { Stack, useRouter: () => ({ replace: mockReplace }), useSegments: () => mockSegments };
});
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaProvider: ({ children }: { children: never }) => children }));
jest.mock('../../services/supabase/autoRefresh', () => ({ bindAuthAutoRefresh: jest.fn(() => jest.fn()) }));
jest.mock('../../services/supabase/client', () => ({
  supabase: { auth: { getSession: jest.fn(), onAuthStateChange: jest.fn() } },
}));

const getSession = supabase.auth.getSession as jest.Mock;
const onAuthStateChange = supabase.auth.onAuthStateChange as jest.Mock;
const hideAsync = SplashScreen.hideAsync as jest.Mock;
const bind = bindAuthAutoRefresh as jest.Mock;
const unsubscribe = jest.fn();
const originalOS = Platform.OS;

function setOS(os: string) {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockSegments = [];
  setOS('ios');
  onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe } } });
});

afterEach(() => {
  jest.useRealTimers();
  setOS(originalOS);
});

const SESSION = { user: { id: 'u1' } };

describe('RootLayout session gate', () => {
  it('renders nothing on native and keeps the splash while the session is unresolved', async () => {
    getSession.mockReturnValue(new Promise(() => undefined));
    await render(<RootLayout />);
    expect(screen.queryByTestId('stack')).toBeNull();
    expect(hideAsync).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('shows the stack, hides the splash and sends a signed-out user to sign-in', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await render(<RootLayout />);
    expect(await screen.findByTestId('stack')).toBeTruthy();
    expect(hideAsync).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in');
  });

  it('sends a signed-in user out of the auth group to the tabs', async () => {
    mockSegments = ['(auth)'];
    getSession.mockResolvedValue({ data: { session: SESSION } });
    await render(<RootLayout />);
    await screen.findByTestId('stack');
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
  });

  it('does not redirect a signed-in user who is already in the app', async () => {
    mockSegments = ['(tabs)'];
    getSession.mockResolvedValue({ data: { session: SESSION } });
    await render(<RootLayout />);
    await screen.findByTestId('stack');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does not redirect a signed-out user already on the auth screens', async () => {
    mockSegments = ['(auth)'];
    getSession.mockResolvedValue({ data: { session: null } });
    await render(<RootLayout />);
    await screen.findByTestId('stack');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('releases the splash and falls through to sign-in when getSession rejects', async () => {
    getSession.mockRejectedValue(new Error('storage unavailable'));
    await render(<RootLayout />);
    expect(await screen.findByTestId('stack')).toBeTruthy();
    expect(hideAsync).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in');
  });

  it('releases the splash after a timeout when getSession never resolves', async () => {
    getSession.mockReturnValue(new Promise(() => undefined));
    await render(<RootLayout />);
    expect(hideAsync).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(8100);
    });
    expect(await screen.findByTestId('stack')).toBeTruthy();
    expect(hideAsync).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in');
  });

  it('becomes ready from an auth state change even if getSession is still pending', async () => {
    getSession.mockReturnValue(new Promise(() => undefined));
    await render(<RootLayout />);
    const listener = onAuthStateChange.mock.calls[0][0];
    await act(async () => {
      listener('SIGNED_IN', SESSION);
    });
    expect(await screen.findByTestId('stack')).toBeTruthy();
  });

  it('unsubscribes from auth changes on unmount', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const view = await render(<RootLayout />);
    await screen.findByTestId('stack');
    await view.unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});

describe('RootLayout auto-refresh wiring', () => {
  it('binds auth auto-refresh with the current platform', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await render(<RootLayout />);
    expect(bind).toHaveBeenCalledTimes(1);
    expect(bind.mock.calls[0][0]).toBe(supabase.auth);
    expect(bind.mock.calls[0][2]).toBe('ios');
  });

  it('runs the cleanup returned by the binding on unmount', async () => {
    const cleanup = jest.fn();
    bind.mockReturnValueOnce(cleanup);
    getSession.mockResolvedValue({ data: { session: null } });
    const view = await render(<RootLayout />);
    await view.unmount();
    expect(cleanup).toHaveBeenCalled();
  });
});

describe('RootLayout web fallback', () => {
  it('shows a spinner (not a blank page) on web while the session is unresolved', async () => {
    setOS('web');
    getSession.mockReturnValue(new Promise(() => undefined));
    await render(<RootLayout />);
    expect(screen.queryByTestId('stack')).toBeNull();
    expect(screen.getByTestId('session-spinner')).toBeTruthy();
  });

  it('replaces the web spinner with the stack once the session resolves', async () => {
    setOS('web');
    getSession.mockResolvedValue({ data: { session: null } });
    await render(<RootLayout />);
    expect(await screen.findByTestId('stack')).toBeTruthy();
    expect(screen.queryByTestId('session-spinner')).toBeNull();
  });
});
