import { act, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

// The root layout is an expo-router route, so this test lives under src/: any *.test.* file
// inside app/ is picked up by Metro's require.context and bundled into the native app.
import RootLayout from '../../../app/_layout';
import { bindAuthAutoRefresh } from '../../services/supabase/autoRefresh';
import { supabase } from '../../services/supabase/client';
import * as SplashScreen from 'expo-splash-screen';

// The layout must not touch the router at all: it uses declarative route guards. The expo-router
// mock therefore exports NO useRouter/useSegments/router — if the imperative redirect-in-effect
// (the bug that logged "Can't perform a React state update on a component that hasn't mounted yet")
// ever comes back, the layout throws on the missing export and these tests go red.
const mockGuards: boolean[] = [];

jest.mock('../../../global.css', () => ({}));
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  function Stack({ children }: { children?: unknown }) {
    return <View testID="stack">{children as never}</View>;
  }
  Stack.Screen = function Screen({ name }: { name: string }) {
    return <View testID={`screen-${name}`} />;
  };
  // Mirrors expo-router: children of a guarded-out <Stack.Protected> are not registered.
  Stack.Protected = function Protected({ guard, children }: { guard: boolean; children?: unknown }) {
    mockGuards.push(guard);
    return guard ? (children as never) : null;
  };
  return { Stack };
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
  mockGuards.length = 0;
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
  });

  it('shows the stack, hides the splash and exposes only the auth screens to a signed-out user', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await render(<RootLayout />);
    expect(await screen.findByTestId('stack')).toBeTruthy();
    expect(hideAsync).toHaveBeenCalled();
    expect(screen.getByTestId('screen-(auth)')).toBeTruthy();
    expect(screen.queryByTestId('screen-(tabs)')).toBeNull();
    expect(screen.queryByTestId('screen-calendar')).toBeNull();
  });

  it('exposes only the signed-in screens (never (auth)) to a signed-in user', async () => {
    getSession.mockResolvedValue({ data: { session: SESSION } });
    await render(<RootLayout />);
    await screen.findByTestId('stack');
    for (const name of [
      '(tabs)',
      'calendar',
      'effort',
      'effort-review',
      'notes/index',
      'notes/upload',
      'notes/[recordingId]',
      'coach/pick',
      'coach/profile',
    ]) {
      expect(screen.getByTestId(`screen-${name}`)).toBeTruthy();
    }
    expect(screen.queryByTestId('screen-(auth)')).toBeNull();
  });

  it('never mounts the guards before the session resolves (nothing can navigate an unmounted navigator)', async () => {
    getSession.mockReturnValue(new Promise(() => undefined));
    await render(<RootLayout />);
    expect(screen.queryByTestId('stack')).toBeNull();
    expect(mockGuards).toEqual([]);
  });

  it('flips the guards when the session changes: sign-in swaps to the app, sign-out back to (auth)', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await render(<RootLayout />);
    await screen.findByTestId('stack');
    expect(screen.getByTestId('screen-(auth)')).toBeTruthy();

    const listener = onAuthStateChange.mock.calls[0][0];
    await act(async () => {
      listener('SIGNED_IN', SESSION);
    });
    expect(screen.getByTestId('screen-(tabs)')).toBeTruthy();
    expect(screen.queryByTestId('screen-(auth)')).toBeNull();

    await act(async () => {
      listener('SIGNED_OUT', null);
    });
    expect(screen.getByTestId('screen-(auth)')).toBeTruthy();
    expect(screen.queryByTestId('screen-(tabs)')).toBeNull();
  });

  it('releases the splash and falls through to sign-in when getSession rejects', async () => {
    getSession.mockRejectedValue(new Error('storage unavailable'));
    await render(<RootLayout />);
    expect(await screen.findByTestId('stack')).toBeTruthy();
    expect(hideAsync).toHaveBeenCalled();
    expect(screen.getByTestId('screen-(auth)')).toBeTruthy();
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
    expect(screen.getByTestId('screen-(auth)')).toBeTruthy();
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
