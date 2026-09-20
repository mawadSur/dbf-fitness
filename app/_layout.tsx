import '../global.css';

import type { Session } from '@supabase/supabase-js';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { queryClient } from '../src/services/queryClient';
import { bindAuthAutoRefresh } from '../src/services/supabase/autoRefresh';
import { supabase } from '../src/services/supabase/client';
import { colors } from '../src/theme/tokens';

const SESSION_TIMEOUT_MS = 8000;

// Keep the native splash up until the session gate resolves.
SplashScreen.preventAutoHideAsync().catch(() => undefined);

function RootNavigator() {
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

  useEffect(() => {
    if (isSessionReady) SplashScreen.hideAsync().catch(() => undefined);
  }, [isSessionReady]);

  // Native holds the real splash; expo-splash-screen is a no-op on web, so show a spinner there.
  if (!isSessionReady) {
    if (Platform.OS !== 'web') return null;
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator testID="session-spinner" color={colors.primary} />
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
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
