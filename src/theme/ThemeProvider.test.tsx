import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, screen } from '@testing-library/react-native';
import { colorScheme } from 'nativewind';
import { useEffect } from 'react';
import { AccessibilityInfo, Appearance, Text } from 'react-native';

import {
  isThemePreference,
  THEME_PREFERENCE_STORAGE_KEY,
  ThemeProvider,
  useReducedMotion,
  useTheme,
  type ThemePreference,
} from './ThemeProvider';
import { darkTheme, lightTheme } from './tokens';

jest.mock('nativewind', () => ({ colorScheme: { set: jest.fn() } }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

const getItem = AsyncStorage.getItem as jest.Mock;
const setItem = AsyncStorage.setItem as jest.Mock;
const setScheme = colorScheme.set as jest.Mock;

let appearanceListeners: (() => void)[] = [];
const removeAppearanceListener = jest.fn();

function mockSystem(scheme: 'light' | 'dark') {
  (Appearance.getColorScheme as jest.Mock).mockReturnValue(scheme);
}

// Captured in an effect, never during render, so the probe stays a pure component.
const preferenceSetter: { current: (preference: ThemePreference) => void } = {
  current: () => undefined,
};
const setPreferenceRef = (preference: ThemePreference) => preferenceSetter.current(preference);

function Probe() {
  const { scheme, preference, setPreference, colors, tokens } = useTheme();
  useEffect(() => {
    preferenceSetter.current = setPreference;
  }, [setPreference]);
  return (
    <>
      <Text testID="scheme">{scheme}</Text>
      <Text testID="preference">{preference}</Text>
      <Text testID="text-color">{colors.text}</Text>
      <Text testID="radius">{String(tokens.radii.lg)}</Text>
    </>
  );
}

async function renderProvider() {
  // RNTL 14 renders asynchronously; awaiting also flushes the AsyncStorage read.
  return await render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  appearanceListeners = [];
  jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('light');
  jest.spyOn(Appearance, 'addChangeListener').mockImplementation((listener) => {
    appearanceListeners.push(listener as () => void);
    return { remove: removeAppearanceListener } as never;
  });
  getItem.mockResolvedValue(null);
  setItem.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ThemeProvider', () => {
  it('defaults to the system preference and publishes the matching palette', async () => {
    await renderProvider();
    expect(screen.getByTestId('preference')).toHaveTextContent('system');
    expect(screen.getByTestId('scheme')).toHaveTextContent('light');
    expect(screen.getByTestId('text-color')).toHaveTextContent(lightTheme.text);
    expect(screen.getByTestId('radius')).toHaveTextContent('12');
  });

  it('resolves a dark system scheme', async () => {
    mockSystem('dark');
    await renderProvider();
    expect(screen.getByTestId('scheme')).toHaveTextContent('dark');
    expect(screen.getByTestId('text-color')).toHaveTextContent(darkTheme.text);
  });

  it('pushes the resolved scheme into NativeWind so dark: classes flip', async () => {
    mockSystem('dark');
    await renderProvider();
    expect(setScheme).toHaveBeenCalledWith('dark');
  });

  it('survives NativeWind throwing when it sets the colour scheme', async () => {
    setScheme.mockImplementation(() => {
      throw new Error('Cannot manually set color scheme');
    });
    await renderProvider();
    expect(screen.getByTestId('scheme')).toHaveTextContent('light');
  });

  it('restores the stored preference', async () => {
    getItem.mockResolvedValue('dark');
    await renderProvider();
    expect(getItem).toHaveBeenCalledWith(THEME_PREFERENCE_STORAGE_KEY);
    expect(screen.getByTestId('preference')).toHaveTextContent('dark');
    expect(screen.getByTestId('scheme')).toHaveTextContent('dark');
  });

  /*
   * The restore is async and the Profile toggle is not. Stored 'dark', the
   * member opens Profile and taps Light on the first tick: the read then landed
   * AFTER the tap and flipped the theme straight back to dark, discarding a
   * choice the member had just made and watched apply. A newer explicit choice
   * always wins over what is on disk.
   */
  it('does not let a late restore clobber a preference set during the first tick', async () => {
    let release: (value: string | null) => void = () => undefined;
    getItem.mockReturnValue(
      new Promise<string | null>((resolve) => {
        release = resolve;
      }),
    );

    await renderProvider();
    // The member picks Light while the disk read is still in flight.
    await act(async () => setPreferenceRef('light'));
    expect(screen.getByTestId('preference')).toHaveTextContent('light');

    // The stored 'dark' arrives late. It must not win.
    await act(async () => {
      release('dark');
    });
    expect(screen.getByTestId('preference')).toHaveTextContent('light');
    expect(screen.getByTestId('scheme')).toHaveTextContent('light');
    expect(setItem).toHaveBeenCalledWith(THEME_PREFERENCE_STORAGE_KEY, 'light');
  });

  it('still restores when the member has not chosen anything yet', async () => {
    let release: (value: string | null) => void = () => undefined;
    getItem.mockReturnValue(
      new Promise<string | null>((resolve) => {
        release = resolve;
      }),
    );

    await renderProvider();
    expect(screen.getByTestId('preference')).toHaveTextContent('system');
    await act(async () => {
      release('dark');
    });
    expect(screen.getByTestId('preference')).toHaveTextContent('dark');
  });

  it('ignores a stored value that is not a preference', async () => {
    getItem.mockResolvedValue('midnight');
    await renderProvider();
    expect(screen.getByTestId('preference')).toHaveTextContent('system');
  });

  it('falls back to system when reading storage throws', async () => {
    getItem.mockRejectedValue(new Error('storage unavailable'));
    mockSystem('dark');
    await renderProvider();
    expect(screen.getByTestId('preference')).toHaveTextContent('system');
    expect(screen.getByTestId('scheme')).toHaveTextContent('dark');
  });

  it('persists a new preference and applies it immediately', async () => {
    await renderProvider();
    await act(async () => setPreferenceRef('dark'));
    expect(screen.getByTestId('preference')).toHaveTextContent('dark');
    expect(screen.getByTestId('scheme')).toHaveTextContent('dark');
    expect(setItem).toHaveBeenCalledWith(THEME_PREFERENCE_STORAGE_KEY, 'dark');
    expect(setScheme).toHaveBeenLastCalledWith('dark');
  });

  it('keeps the chosen theme when writing to storage fails', async () => {
    setItem.mockRejectedValue(new Error('disk full'));
    await renderProvider();
    await act(async () => setPreferenceRef('dark'));
    expect(screen.getByTestId('scheme')).toHaveTextContent('dark');
  });

  it('follows OS changes while the preference is system', async () => {
    await renderProvider();
    expect(appearanceListeners).toHaveLength(1);
    mockSystem('dark');
    await act(async () => appearanceListeners[0]());
    expect(screen.getByTestId('scheme')).toHaveTextContent('dark');
    expect(setScheme).toHaveBeenLastCalledWith('dark');
  });

  it('stops following the OS once an explicit theme is chosen', async () => {
    await renderProvider();
    await act(async () => setPreferenceRef('light'));
    mockSystem('dark');
    for (const listener of appearanceListeners) await act(async () => listener());
    expect(screen.getByTestId('scheme')).toHaveTextContent('light');
  });

  it('picks the OS scheme back up when the preference returns to system', async () => {
    await renderProvider();
    await act(async () => setPreferenceRef('light'));
    // The OS flips while an explicit theme is in force, so nothing changes yet.
    mockSystem('dark');
    for (const listener of appearanceListeners) await act(async () => listener());
    expect(screen.getByTestId('scheme')).toHaveTextContent('light');
    // Going back to 'system' must show the current OS scheme, not a stale one.
    await act(async () => setPreferenceRef('system'));
    expect(screen.getByTestId('scheme')).toHaveTextContent('dark');
  });

  it('removes the appearance listener on unmount', async () => {
    const view = await renderProvider();
    await view.unmount();
    expect(removeAppearanceListener).toHaveBeenCalled();
  });

  it('throws a helpful error when useTheme is used outside the provider', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(render(<Probe />)).rejects.toThrow(/useTheme must be used inside/);
    spy.mockRestore();
  });

  it('validates preference values', () => {
    expect(isThemePreference('system')).toBe(true);
    expect(isThemePreference('dark')).toBe(true);
    expect(isThemePreference('')).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });
});

describe('useReducedMotion', () => {
  function MotionProbe() {
    const reduced = useReducedMotion();
    return <Text testID="reduced">{String(reduced)}</Text>;
  }

  let motionListener: ((enabled: boolean) => void) | undefined;
  const removeMotionListener = jest.fn();

  beforeEach(() => {
    motionListener = undefined;
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      .mockImplementation((event: string, listener: unknown) => {
        if (event === 'reduceMotionChanged') motionListener = listener as (v: boolean) => void;
        return { remove: removeMotionListener } as never;
      });
  });

  it('starts from the current accessibility setting', async () => {
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(true);
    await render(<MotionProbe />);
    expect(screen.getByTestId('reduced')).toHaveTextContent('true');
  });

  it('reacts to the setting being turned on', async () => {
    await render(<MotionProbe />);
    expect(screen.getByTestId('reduced')).toHaveTextContent('false');
    await act(async () => motionListener?.(true));
    expect(screen.getByTestId('reduced')).toHaveTextContent('true');
  });

  it('defaults to full motion when the query rejects', async () => {
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockRejectedValue(new Error('nope'));
    await render(<MotionProbe />);
    expect(screen.getByTestId('reduced')).toHaveTextContent('false');
  });

  it('removes its listener on unmount', async () => {
    const view = await render(<MotionProbe />);
    await view.unmount();
    expect(removeMotionListener).toHaveBeenCalled();
  });
});
