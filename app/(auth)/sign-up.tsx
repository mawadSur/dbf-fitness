import { Link, useRouter } from 'expo-router';
import { KEYBOARD_AVOIDING_BEHAVIOR } from '../../src/components/keyboard';
import { useRef, useState } from 'react';
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

import {
  FULL_NAME_MAX_LENGTH,
  describeSignUpError,
  normalizeFullName,
} from '../../src/features/auth/signUpName';
import { supabase } from '../../src/services/supabase/client';
import { colors } from '../../src/theme/tokens';

// slate-500: 4.7:1 on white (the old #94A3B8 was 2.6:1).
const PLACEHOLDER_COLOR = colors.textSecondary;

export default function SignUpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Exactly what the server would store (`left(btrim(name), 120)`), so the
  // profiles_text_bounds CHECK added in 20260919152000 is never reached.
  const submittedName = normalizeFullName(fullName);
  const isSubmitDisabled = isSubmitting || !submittedName || !email || !password;

  const handleSubmit = async () => {
    if (isSubmitDisabled) return;
    Keyboard.dismiss();
    setErrorMessage(null);
    setIsSubmitting(true);

    // full_name travels in the sign-up metadata so the server-side trigger
    // (public.handle_new_auth_user, migration 20260919152100) can provision the
    // profile row itself. role and coach_id are never sent: they are assigned
    // server-side and the INSERT policy rejects anything else.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: submittedName } },
    });

    if (error) {
      setIsSubmitting(false);
      setErrorMessage(describeSignUpError(error));
      return;
    }

    if (data.user) {
      // Upsert, not insert: the trigger has normally already created this row.
      // This request only reconciles the typed name, and stays correct if the
      // trigger was skipped for any reason.
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({ id: data.user.id, role: 'member', full_name: submittedName }, { onConflict: 'id' });

      // NON-FATAL by design. The auth account now exists and the trigger has already
      // provisioned the profile, so stopping here would strand the new member: the
      // only thing a retry can produce is "User already registered". Reconciling the
      // typed name is best-effort; the raw driver text is never shown either way.
      if (profileError) {
        console.warn('[auth] could not reconcile the profile name', describeSignUpError(profileError));
      }
    }

    setIsSubmitting(false);
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
            Create account
          </Text>
          <Text className="text-center text-base text-slate-600">
            Set up your member profile to get started.
          </Text>

          <View className="w-full gap-3">
            <TextInput
              className="min-h-[48px] w-full rounded-lg border border-slate-200 px-4 py-3 text-base text-slate-900"
              placeholder="Full name"
              placeholderTextColor={PLACEHOLDER_COLOR}
              accessibilityLabel="Full name"
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              maxLength={FULL_NAME_MAX_LENGTH}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => emailRef.current?.focus()}
              value={fullName}
              onChangeText={setFullName}
            />
            <TextInput
              ref={emailRef}
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
              autoComplete="new-password"
              textContentType="newPassword"
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
            accessibilityLabel="Create account"
            accessibilityState={{
              disabled: isSubmitDisabled,
              busy: isSubmitting,
            }}
            android_ripple={{ color: colors.primaryMuted }}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text className="text-base font-semibold text-white">Create account</Text>
            )}
          </Pressable>

          <Link href="/sign-in" className="py-3 text-base font-semibold text-emerald-700">
            Already have an account? Sign in
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
