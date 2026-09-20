import '../global.css';

import type { Session } from '@supabase/supabase-js';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { queryClient } from '../src/services/queryClient';
import { bindAuthAutoRefresh } from '../src/services/supabase/autoRefresh';
import { supabase } from '../src/services/supabase/client';
import { chromeScheme, statusBarStyle } from '../src/theme/chrome';
import { brandFonts, FONT_LOAD_TIMEOUT_MS } from '../src/theme/fonts';
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider';
import { themes } from '../src/theme/tokens';

const SESSION_TIMEOUT_MS = 8000;

// Keep the native splash up until the session gate resolves.
SplashScreen.preventAutoHideAsync().catch(() => undefined);

/**
 * Fonts must never keep the splash up: if `useFonts` is slow or fails, the app
 * falls through to the system font after FONT_LOAD_TIMEOUT_MS.
 */
function useBrandFontsSettled(): boolean {
  const [loaded, error] = useFonts(brandFonts);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setTimedOut(true), FONT_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, []);

  return loaded || !!error || timedOut;
}

/**
 * The status bar contrasts with what the SCREEN paints, not with the member's
 * theme preference. Every product screen still hard-codes the white legacy
 * page, so following the resolved scheme drew white glyphs on white in dark
 * mode — the clock, wifi and battery simply vanished on Android. `chromeScheme`
 * is the one flag that says "the screens are still light"; when the screens
 * migrate to `useTheme()` it flips and this follows the theme again.
 */
function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar style={statusBarStyle(chromeScheme(scheme))} />;
}

function RootNavigator() {
  const { scheme } = useTheme();
  // The session gate is chrome, not content — same flag as the status/tab bar.
  const chromeColors = themes[chromeScheme(scheme)];
  const areFontsSettled = useBrandFontsSettled();
  const [session, setSession] = useState<Session | null>(null);
  const [isSessionReady, setIsSessionReady] = useState(false);

  useEffect(() => {
    let settled = false;
    const settle = (next: Session | null) => {
      settled = true;
      setSession(next);
      setIsSessionReady(true);
    };

    // A rejecting or never-resolving getSession must not hold the splash (or a blank screen) forever:
    // fall through to signed-out so the user lands on sign-in.
    supabase.auth
      .getSession()
      .then(({ data }) => settle(data.session))
      .catch(() => {
        if (!settled) settle(null);
      });
    const timeout = setTimeout(() => {
      if (!settled) settle(null);
    }, SESSION_TIMEOUT_MS);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => settle(newSession));

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => bindAuthAutoRefresh(supabase.auth, AppState, Platform.OS), []);

  // The splash covers the first frames, so it only drops once the session gate
  // AND the fonts have settled — no flash of system-font text.
  useEffect(() => {
    if (isSessionReady && areFontsSettled) SplashScreen.hideAsync().catch(() => undefined);
  }, [isSessionReady, areFontsSettled]);

  // Native holds the real splash; expo-splash-screen is a no-op on web, so show a spinner there.
  //
  // This gate paints a full page, so it is CHROME: it has to agree with the
  // status bar and the tab bar, which `chromeScheme` pins to light for exactly
  // as long as the product screens hard-code the white legacy page. Following
  // `useTheme()` here (a `bg-bg` that went emerald-950 in dark mode while the
  // status bar stayed light and the screen behind it was white) was the same
  // mismatch `src/theme/chrome.ts` exists to remove, plus a dark-to-white flash
  // the moment the session resolved. One flag now drives all three, so the day
  // the screens consume `useTheme()` the spinner follows the theme with them.
  if (!isSessionReady) {
    if (Platform.OS !== 'web') return null;
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: chromeColors.bg,
        }}
      >
        <ActivityIndicator testID="session-spinner" color={chromeColors.brand} />
      </View>
    );
  }

  // Declarative route guards, no imperative redirect. Expo Router re-evaluates them whenever
  // `session` flips: a signed-out user (cold start, deep link, sign-out from any screen) can only
  // reach `(auth)`, a signed-in user can only reach the app screens, and the router itself moves
  // to the first available screen when the current one is guarded away. Nothing here dispatches a
  // navigation action from an effect, so it cannot hit a navigator that has not mounted yet (the
  // old `router.replace` in an effect fired in the same commit that first mounted <Stack>).
  const signedIn = !!session;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="calendar"
          options={{ presentation: 'modal', headerShown: true, title: 'Calendar' }}
        />
        <Stack.Screen name="effort" />
        <Stack.Screen name="effort-review" />
        <Stack.Screen name="notes/index" />
        <Stack.Screen name="notes/upload" />
        <Stack.Screen name="notes/[recordingId]" />
        <Stack.Screen name="coach/pick" />
        <Stack.Screen name="coach/profile" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SafeAreaProvider>
          <ThemedStatusBar />
          <RootNavigator />
        </SafeAreaProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
