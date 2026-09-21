import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Keyboard, View, type TextInput } from 'react-native';

import { AuthAlert, AuthBrandHeader, AuthField, AuthSwitchLink } from '../../src/components/auth';
import { Button, ScreenShell } from '../../src/components/ui';
import {
  PASSWORD_MIN_LENGTH,
  errorBannerTitle,
  validateEmail,
  validateFullName,
  validateNewPassword,
} from '../../src/features/auth/authForm';
import {
  FULL_NAME_MAX_LENGTH,
  describeSignUpError,
  normalizeFullName,
} from '../../src/features/auth/signUpName';
import { supabase } from '../../src/services/supabase/client';

export default function SignUpScreen() {
  const router = useRouter();
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState({ fullName: false, email: false, password: false });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);

  // Exactly what the server would store (`left(btrim(name), 120)`), so the
  // profiles_text_bounds CHECK added in 20260919152000 is never reached.
  const submittedName = normalizeFullName(fullName);
  const errors = {
    fullName: validateFullName(fullName),
    email: validateEmail(email),
    password: validateNewPassword(password),
  };
  const isSubmitDisabled = isSubmitting || !submittedName || !email || !password;

  const handleSubmit = async () => {
    if (isSubmitDisabled) return;
    if (errors.fullName || errors.email || errors.password) {
      setTouched({ fullName: true, email: true, password: true });
      return;
    }
    Keyboard.dismiss();
    setSubmitError(null);
    setIsSubmitting(true);

    // full_name travels in the sign-up metadata so the server-side trigger
    // (public.handle_new_auth_user, migration 20260919152100) can provision the
    // profile row itself. role and coach_id are never sent: they are assigned
    // server-side and the INSERT policy rejects anything else.
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: submittedName } },
    });

    if (error) {
      setIsSubmitting(false);
      setSubmitError(error);
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
    <ScreenShell keyboardAvoiding testID="sign-up-screen">
      <View style={{ gap: 16, paddingTop: 8, paddingBottom: 24 }}>
        <AuthBrandHeader title="Create account" />

        {submitError ? (
          <AuthAlert
            testID="sign-up-error"
            tone="danger"
            title={errorBannerTitle(submitError)}
            message={describeSignUpError(submitError)}
          />
        ) : null}

        <View style={{ gap: 12 }}>
          <AuthField
            testID="sign-up-name"
            label="Full name"
            value={fullName}
            onChangeText={setFullName}
            error={touched.fullName ? errors.fullName : null}
            onBlur={() => setTouched((previous) => ({ ...previous, fullName: true }))}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            maxLength={FULL_NAME_MAX_LENGTH}
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => emailRef.current?.focus()}
          />
          <AuthField
            testID="sign-up-email"
            inputRef={emailRef}
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
            testID="sign-up-password"
            inputRef={passwordRef}
            label="Password"
            value={password}
            onChangeText={setPassword}
            error={touched.password ? errors.password : null}
            helperText={`At least ${PASSWORD_MIN_LENGTH} characters.`}
            onBlur={() => setTouched((previous) => ({ ...previous, password: true }))}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />
        </View>

        <Button
          testID="sign-up-submit"
          label="Create account"
          onPress={handleSubmit}
          fullWidth
          disabled={isSubmitDisabled}
          loading={isSubmitting}
        />

        <AuthSwitchLink
          testID="sign-up-switch"
          prompt="Have an account?"
          action="Sign in"
          href="/sign-in"
        />
      </View>
    </ScreenShell>
  );
}
