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

import { RoleProvider } from '../src/features/auth/RoleProvider';
import { SessionEffects } from '../src/features/auth/SessionEffects';
import { bindAuthCacheReset } from '../src/services/authCacheReset';
import { queryClient } from '../src/services/queryClient';
import { bindAuthAutoRefresh } from '../src/services/supabase/autoRefresh';
import { supabase } from '../src/services/supabase/client';
import { statusBarStyle } from '../src/theme/chrome';
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
 * The status bar contrasts with what the SCREEN paints. The screens now follow
 * `useTheme()` (stage 2 migrated the last of them), so the status bar follows
 * the resolved scheme too and `statusBarStyle` just picks the glyph colour that
 * contrasts with it. Before that it had to be pinned light, or dark mode drew
 * white glyphs on the white legacy page and the clock vanished on Android.
 */
function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar style={statusBarStyle(scheme)} />;
}

function RootNavigator() {
  const { scheme } = useTheme();
  // The session gate is chrome, not content — same palette as the status/tab bar.
  const chromeColors = themes[scheme];
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

  // The TanStack cache is process-wide, so it outlives the account that filled
  // it: without this, signing into a second account on the same device served
  // the first account's plan, stats and notes from cache.
  useEffect(() => bindAuthCacheReset(supabase.auth, queryClient), []);

  // The splash covers the first frames, so it only drops once the session gate
  // AND the fonts have settled — no flash of system-font text.
  useEffect(() => {
    if (isSessionReady && areFontsSettled) SplashScreen.hideAsync().catch(() => undefined);
  }, [isSessionReady, areFontsSettled]);

  // Native holds the real splash; expo-splash-screen is a no-op on web, so show a spinner there.
  //
  // This gate paints a full page, so it is CHROME: it has to agree with the
  // status bar and the tab bar. All three follow the resolved theme now that the
  // screens do, so the spinner page matches the screen that replaces it — no
  // dark-to-white flash the moment the session resolves.
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

  // RoleProvider sits INSIDE the session gate: it never fetches for a
  // signed-out user, and every screen reads one cached answer instead of
  // running its own `profiles.select('role')` on mount. It is UI shaping only —
  // `Stack.Protected` and `useRole()` decide what to DRAW; RLS policies and the
  // SECURITY DEFINER bodies of the RPCs decide what the server will hand over.
  return (
    <RoleProvider>
      {signedIn ? <SessionEffects userId={session?.user.id ?? null} /> : null}
      <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
        {/*
          NO native header. The stack header is the one piece of chrome that
          does not read `useTheme()`, so in dark mode it drew a hard-white band
          (measured rgb(255,255,255) at y=0..99 on the Android emulator, with
          the light status-bar glyphs `statusBarStyle('dark')` asks for
          invisible on top of it) and in light mode it broke the brand: a
          system-font title and a grey hairline where every other route shows
          the letter-spaced eyebrow + Manrope `ScreenHeader`. `app/calendar.tsx`
          now draws that same header inside its `ScreenShell`, which pays the
          status-bar inset itself.
        */}
        <Stack.Screen name="calendar" options={{ presentation: 'modal' }} />
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
    </RoleProvider>
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
