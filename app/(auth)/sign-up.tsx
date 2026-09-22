import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Keyboard, View, type TextInput } from 'react-native';

import { AuthAlert, AuthBrandHeader, AuthField, AuthSwitchLink } from '../../src/components/auth';
import { LegalFooter } from '../../src/components/legal/LegalTextLink';
import { TermsCheckbox } from '../../src/components/legal/TermsCheckbox';
import { Button, ScreenShell } from '../../src/components/ui';
import { TERMS_VERSION } from '../../src/config/legal';
import { acceptTerms } from '../../src/features/legal/api';
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
import { validateContent } from '../../src/features/moderation/contentFilter';
import { supabase } from '../../src/services/supabase/client';

/**
 * Empty is `validateFullName`'s business; the filter only judges what was actually typed.
 *
 * It is handed the NORMALIZED name (`normalizeFullName`, i.e. trimmed and truncated to 120)
 * rather than the raw field, for two reasons:
 *  - that is the string other members actually see, so it is the one worth filtering;
 *  - `checkContent` also caps length at 120, and running it on the raw value would turn an
 *    over-long name into a hard block. Sign-up deliberately TRUNCATES instead of blocking
 *    (see src/features/auth/signUpName.ts and its regression test) — re-introducing the
 *    stuck-onboarding bug in the name of moderation would be a bad trade.
 */
function nameContentError(normalizedName: string): string | null {
  return normalizedName ? validateContent(normalizedName, 'displayName') : null;
}

export default function SignUpScreen() {
  const router = useRouter();
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState({
    fullName: false,
    email: false,
    password: false,
    // Its own flag rather than borrowing `touched.password`: a user who fills name and email,
    // never blurs the password field and taps the disabled button was shown no reason why.
    terms: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);
  // Apple guideline 1.2 wants an ACTIVE agreement, so this starts false and gates submit.
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Exactly what the server would store (`left(btrim(name), 120)`), so the
  // profiles_text_bounds CHECK added in 20260919152000 is never reached.
  const submittedName = normalizeFullName(fullName);
  const errors = {
    // Guideline 1.2 first line of defence: the display name is visible to every other member,
    // so an objectionable one is refused here with a friendly inline reason rather than
    // silently. `validateFullName` still owns "is it a name at all"; the filter only runs
    // once something has been typed. Admin review remains the real backstop.
    fullName: validateFullName(fullName) ?? nameContentError(submittedName),
    email: validateEmail(email),
    password: validateNewPassword(password),
  };
  const isSubmitDisabled =
    isSubmitting || !submittedName || !email || !password || !agreedToTerms;

  /**
   * Why the disabled button is disabled.
   *
   * The submit button MUST stay disabled until the box is ticked (Apple guideline 1.2 wants an
   * active agreement), which means a tap on it cannot itself surface the reason. So the error
   * appears the moment the checkbox becomes the ONLY thing standing in the way — the three
   * fields are filled and the box is not ticked — and stays visible once the user has touched
   * the box at all (ticked then unticked).
   */
  const termsIsOnlyBlocker = Boolean(submittedName && email && password) && !agreedToTerms;
  const showTermsError = !agreedToTerms && (touched.terms || termsIsOnlyBlocker);

  const handleSubmit = async () => {
    // `onSubmitEditing` on the password field reaches here even while the button is disabled.
    if (!agreedToTerms) setTouched((previous) => ({ ...previous, terms: true }));
    if (isSubmitDisabled) return;
    if (errors.fullName || errors.email || errors.password) {
      setTouched({ fullName: true, email: true, password: true, terms: true });
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

      // Record the agreement the user just gave (Apple guideline 1.2).
      //
      // NON-FATAL, like the name reconcile above: the account exists and the user HAS agreed, so
      // failing them here would strand them on a screen whose only retry produces "User already
      // registered". If this call is lost (offline, email-confirmation flow with no session yet),
      // `TermsGate` catches it on the next launch and asks again — which is why the gate exists.
      try {
        await acceptTerms(TERMS_VERSION);
      } catch (acceptError) {
        console.warn('[auth] could not record terms acceptance', describeSignUpError(acceptError));
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

        <TermsCheckbox
          checked={agreedToTerms}
          onChange={(next) => {
            setTouched((previous) => ({ ...previous, terms: true }));
            setAgreedToTerms(next);
          }}
          showError={showTermsError}
          testID="sign-up-terms"
        />

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

        <LegalFooter testID="sign-up-legal-footer" />
      </View>
    </ScreenShell>
  );
}
