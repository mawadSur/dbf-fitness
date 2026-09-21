import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, View, type TextInput } from 'react-native';

import { AuthAlert, AuthBrandHeader, AuthField, AuthSwitchLink } from '../../src/components/auth';
import { Button, ScreenShell } from '../../src/components/ui';
import {
  describeSignInError,
  errorBannerTitle,
  validateCurrentPassword,
  validateEmail,
} from '../../src/features/auth/authForm';
import { supabase } from '../../src/services/supabase/client';

export default function SignInScreen() {
  const router = useRouter();
  const { deleted } = useLocalSearchParams<{ deleted?: string }>();
  const passwordRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState({ email: false, password: false });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);

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

  const errors = {
    email: validateEmail(email),
    password: validateCurrentPassword(password),
  };
  // Kept from the pre-redesign screen: the button stays inert until both fields
  // carry something, so the first tap is never a guaranteed failure.
  const isSubmitDisabled = isSubmitting || !email || !password;

  const handleSubmit = async () => {
    if (isSubmitDisabled) return;
    if (errors.email || errors.password) {
      setTouched({ email: true, password: true });
      return;
    }
    Keyboard.dismiss();
    setSubmitError(null);
    setIsSubmitting(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setIsSubmitting(false);

    if (error) {
      setSubmitError(error);
      return;
    }

    router.replace('/');
  };

  return (
    <ScreenShell keyboardAvoiding testID="sign-in-screen">
      <View style={{ gap: 16, paddingTop: 8, paddingBottom: 24 }}>
        <AuthBrandHeader title="Sign in" />

        {showDeletedNotice ? (
          <AuthAlert
            testID="deleted-notice"
            tone="info"
            title="Your account was deleted."
            onDismiss={() => setShowDeletedNotice(false)}
            dismissAccessibilityLabel="Dismiss notice"
          />
        ) : null}

        {submitError ? (
          <AuthAlert
            testID="sign-in-error"
            tone="danger"
            title={errorBannerTitle(submitError)}
            message={describeSignInError(submitError)}
          />
        ) : null}

        <View style={{ gap: 12 }}>
          <AuthField
            testID="sign-in-email"
            label="Email"
            value={email}
            onChangeText={setEmail}
            error={touched.email ? errors.email : null}
            onBlur={() => setTouched((previous) => ({ ...previous, email: true }))}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
          <AuthField
            testID="sign-in-password"
            inputRef={passwordRef}
            label="Password"
            value={password}
            onChangeText={setPassword}
            error={touched.password ? errors.password : null}
            onBlur={() => setTouched((previous) => ({ ...previous, password: true }))}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />
        </View>

        <Button
          testID="sign-in-submit"
          label="Sign in"
          onPress={handleSubmit}
          fullWidth
          disabled={isSubmitDisabled}
          loading={isSubmitting}
        />

        <AuthSwitchLink
          testID="sign-in-switch"
          prompt="New here?"
          action="Create account"
          href="/sign-up"
        />
      </View>
    </ScreenShell>
  );
}
