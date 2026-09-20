import '../global.css';

import type { Session } from '@supabase/supabase-js';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
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

function useSessionRedirect(isSessionReady: boolean, session: Session | null) {
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (!isSessionReady) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isSessionReady, session, segments, router]);
}

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

  useSessionRedirect(isSessionReady, session);

  // Native holds the real splash; expo-splash-screen is a no-op on web, so show a spinner there.
  if (!isSessionReady) {
    if (Platform.OS !== 'web') return null;
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator testID="session-spinner" color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
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
