import { colorScheme } from 'nativewind';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, Appearance } from 'react-native';

import { themes, tokens, type ThemeColors, type ThemeName, type Tokens } from './tokens';

/** AsyncStorage key for the System / Light / Dark setting in Profile. */
export const THEME_PREFERENCE_STORAGE_KEY = 'dbf.themePreference';

export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'] as const;

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value);
}

export type ThemeContextValue = {
  /** The theme actually in effect right now. */
  scheme: ThemeName;
  /** What the member chose; 'system' follows the OS. */
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  /** Hex colours for style props and SVG; Tailwind classes cover JSX. */
  colors: ThemeColors;
  tokens: Tokens;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemScheme(): ThemeName {
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}

function resolveScheme(preference: ThemePreference, system: ThemeName): ThemeName {
  return preference === 'system' ? system : preference;
}

type PreferenceStore = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

/**
 * AsyncStorage is a NATIVE module, so it is loaded lazily inside a try/catch
 * instead of at import time. Importing it at the top of this file would drag
 * the native module into every module that reaches `useOptionalTheme` — that
 * is every design-system component — and blow up in Jest, on web and in any
 * environment where the native side is not linked. The theme itself never
 * depends on storage: a missing store simply means "no saved preference".
 */
function preferenceStore(): PreferenceStore | null {
  try {
    /* eslint-disable-next-line @typescript-eslint/no-require-imports -- native module, loaded lazily on purpose */
    const module = require('@react-native-async-storage/async-storage');
    const store = (module?.default ?? module) as Partial<PreferenceStore> | undefined;
    if (!store || typeof store.getItem !== 'function' || typeof store.setItem !== 'function') {
      return null;
    }
    return store as PreferenceStore;
  } catch {
    return null;
  }
}

/** Storage is best effort: a failing/absent store must never break the app. */
async function readStoredPreference(): Promise<ThemePreference | null> {
  try {
    const stored = await preferenceStore()?.getItem(THEME_PREFERENCE_STORAGE_KEY);
    return isThemePreference(stored) ? stored : null;
  } catch {
    return null;
  }
}

async function writeStoredPreference(preference: ThemePreference): Promise<void> {
  try {
    await preferenceStore()?.setItem(THEME_PREFERENCE_STORAGE_KEY, preference);
  } catch {
    // Ignored on purpose: the choice still applies for this session.
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [system, setSystem] = useState<ThemeName>(() => systemScheme());

  // Set the moment the member picks a theme. The AsyncStorage read is async and
  // can land AFTER a fast tap on the Profile toggle (stored 'dark', member taps
  // Light on the first tick → the late restore flipped it straight back to dark
  // and the write raced too). A newer explicit choice always wins over the disk.
  const hasExplicitChoice = useRef(false);

  // Restore the stored choice once, on mount.
  useEffect(() => {
    let active = true;
    readStoredPreference()
      .then((stored) => {
        if (active && stored && !hasExplicitChoice.current) setPreferenceState(stored);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  // Track the OS scheme for the whole lifetime of the provider: keeping it
  // current costs nothing and means switching the preference back to 'system'
  // never shows a stale theme. `resolveScheme` is what decides whether it is
  // actually used, so an explicit light/dark choice still wins.
  useEffect(() => {
    const subscription = Appearance.addChangeListener(() => setSystem(systemScheme()));
    return () => subscription.remove();
  }, []);

  const scheme = resolveScheme(preference, system);

  // Flip NativeWind's `dark` class so every `dark:` utility follows the choice.
  useEffect(() => {
    try {
      colorScheme.set(scheme);
    } catch {
      // react-native-css-interop throws on web when darkMode is not 'class'.
    }
  }, [scheme]);

  const setPreference = useCallback((next: ThemePreference) => {
    hasExplicitChoice.current = true;
    setPreferenceState(next);
    void writeStoredPreference(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ scheme, preference, setPreference, colors: themes[scheme], tokens }),
    [scheme, preference, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside <ThemeProvider>');
  return value;
}

/** What a design-system component needs: colours, tokens and the active scheme. */
export type ThemeSnapshot = Pick<ThemeContextValue, 'scheme' | 'colors' | 'tokens'>;

const FALLBACK_THEME: ThemeSnapshot = { scheme: 'light', colors: themes.light, tokens };

/**
 * Like `useTheme`, but usable outside a provider: shared UI components must render
 * in isolation (unit tests, the dev gallery, a screen mounted before the provider)
 * instead of throwing, so they fall back to the light theme. Screens and features
 * that genuinely depend on the member's choice keep using `useTheme`.
 */
export function useOptionalTheme(): ThemeSnapshot {
  return useContext(ThemeContext) ?? FALLBACK_THEME;
}

/**
 * True when the member asked the OS to reduce motion. Every animation in the app
 * checks this and falls back to an instant state change.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let active = true;

    const read = async () => {
      try {
        const enabled = await AccessibilityInfo.isReduceMotionEnabled();
        if (active) setReduced(!!enabled);
      } catch {
        // Not every platform implements it; default to full motion.
      }
    };
    void read();

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setReduced(!!enabled);
    });

    return () => {
      active = false;
      subscription?.remove?.();
    };
  }, []);

  return reduced;
}
