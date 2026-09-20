import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { KEYBOARD_AVOIDING_BEHAVIOR } from '../../src/components/keyboard';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '../../src/services/supabase/client';
import { colors } from '../../src/theme/tokens';

// slate-500: 4.7:1 on white (the old #94A3B8 was 2.6:1).
const PLACEHOLDER_COLOR = colors.textSecondary;

export default function SignInScreen() {
  const router = useRouter();
  const { deleted } = useLocalSearchParams<{ deleted?: string }>();
  const insets = useSafeAreaInsets();
  const passwordRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [showDeletedNotice, setShowDeletedNotice] = useState(deleted === '1');
  const [seenDeleted, setSeenDeleted] = useState(deleted);

  // DangerZone lands here with ?deleted=1, possibly onto an already-mounted sign-in (the route
  // guards flip first). Latch the notice in state when the param changes (adjusting state during
  // render, not in an effect), then drop the param so a reload or a later visit does not repeat it.
  if (deleted !== seenDeleted) {
    setSeenDeleted(deleted);
    if (deleted === '1') setShowDeletedNotice(true);
  }

  useEffect(() => {
    if (deleted !== undefined) router.setParams({ deleted: undefined });
  }, [deleted, router]);

  const isSubmitDisabled = isSubmitting || !email || !password;

  const handleSubmit = async () => {
    if (isSubmitDisabled) return;
    Keyboard.dismiss();
    setErrorMessage(null);
    setIsSubmitting(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    router.replace('/');
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white"
      behavior={KEYBOARD_AVOIDING_BEHAVIOR}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingHorizontal: 24,
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 16,
        }}
      >
        <View className="w-full max-w-[420px] items-center gap-4 self-center">
          <Text accessibilityRole="header" className="text-2xl font-bold text-slate-900">
            Sign in
          </Text>
          <Text className="text-center text-base text-slate-600">
            Welcome back. Sign in with your email and password.
          </Text>

          {showDeletedNotice ? (
            <View
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              className="w-full flex-row items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3"
            >
              <Text className="flex-1 text-sm text-emerald-900">Your account was deleted.</Text>
              <Pressable
                onPress={() => setShowDeletedNotice(false)}
                accessibilityRole="button"
                accessibilityLabel="Dismiss notice"
                hitSlop={8}
                className="min-h-[44px] min-w-[44px] items-center justify-center"
              >
                <Text className="text-base font-semibold text-emerald-900">✕</Text>
              </Pressable>
            </View>
          ) : null}

          <View className="w-full gap-3">
            <TextInput
              className="min-h-[48px] w-full rounded-lg border border-slate-200 px-4 py-3 text-base text-slate-900"
              placeholder="Email"
              placeholderTextColor={PLACEHOLDER_COLOR}
              accessibilityLabel="Email"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              keyboardType="email-address"
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => passwordRef.current?.focus()}
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              ref={passwordRef}
              className="min-h-[48px] w-full rounded-lg border border-slate-200 px-4 py-3 text-base text-slate-900"
              placeholder="Password"
              placeholderTextColor={PLACEHOLDER_COLOR}
              accessibilityLabel="Password"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>

          {errorMessage ? (
            <Text
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              className="text-center text-sm text-red-700"
            >
              {errorMessage}
            </Text>
          ) : null}

          <Pressable
            className={`min-h-[48px] w-full items-center justify-center rounded-lg py-3 ${
              isSubmitDisabled ? 'bg-emerald-300' : 'bg-emerald-700'
            }`}
            disabled={isSubmitDisabled}
            onPress={handleSubmit}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
            accessibilityState={{
              disabled: isSubmitDisabled,
              busy: isSubmitting,
            }}
            android_ripple={{ color: colors.primaryMuted }}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text className="text-base font-semibold text-white">Sign in</Text>
            )}
          </Pressable>

          <Link href="/sign-up" className="py-3 text-base font-semibold text-emerald-700">
            Need an account? Sign up
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
