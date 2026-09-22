import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LegalTextLink } from '../../components/legal/LegalTextLink';
import { Banner, Button, Heading, Text } from '../../components/ui';
import { PRIVACY_URL, TERMS_URL, TERMS_VERSION } from '../../config/legal';
import { supabase } from '../../services/supabase/client';
import { useTheme } from '../../theme/ThemeProvider';
import { useAcceptTerms, useTermsAcceptance } from './useTermsAcceptance';

export type TermsGateProps = {
  /** The gate only asks the server once a session exists. */
  signedIn: boolean;
};

/**
 * Blocks the app until the signed-in user has accepted the CURRENT terms version.
 *
 * This is the half of Apple guideline 1.2 that a sign-up checkbox alone does not cover:
 * accounts that already existed when the terms were written, and every account after a
 * version bump. Bumping `TERMS_VERSION` re-prompts everyone on their next launch.
 *
 * Rendered as an absolutely-positioned overlay sibling of the navigator rather than a wrapper,
 * so mounting it costs the root layout a single line and the router tree is untouched.
 *
 * FAILURE POSTURE: if the check itself fails (offline, server down) the gate does NOT block —
 * `isError` falls through to `null`. Locking a paying member out of their class because the
 * acceptance lookup timed out would be a worse failure than showing the prompt one launch
 * late, and the next successful launch re-prompts.
 */
export function TermsGate({ signedIn }: TermsGateProps) {
  const acceptance = useTermsAcceptance(signedIn);

  // Signed out, still loading, already accepted, or the check failed → show nothing.
  if (!signedIn || acceptance.isPending || acceptance.isError || acceptance.data !== false) {
    return null;
  }

  return <TermsGateScreen />;
}

/**
 * The blocking screen itself, split out of {@link TermsGate} deliberately: every hook it needs
 * (theme, safe-area insets, the accept mutation) then runs ONLY while an acceptance is actually
 * outstanding. Mounting the gate in the root layout therefore costs a signed-out or
 * already-accepted launch nothing but one query, and it does not drag safe-area or theme
 * context into trees that never render the prompt.
 */
export function TermsGateScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const accept = useAcceptTerms();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <View
      // `absolute` + inset 0 covers the navigator underneath, so nothing behind it is tappable.
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        backgroundColor: colors.bg,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }}
      accessibilityViewIsModal
      testID="terms-gate"
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          gap: 16,
          paddingHorizontal: 20,
          paddingVertical: 24,
          maxWidth: 520,
          width: '100%',
          alignSelf: 'center',
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Heading level={2}>We have updated our terms</Heading>

        <Text tone="secondary">
          Before you carry on, please review and accept the Terms of Service and Privacy Policy.
          They explain the rules for classes and community posts, and what DBF Fitness does with
          your data.
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 16 }}>
          <LegalTextLink
            label="Read the Terms of Service"
            url={TERMS_URL}
            target="the terms of service"
            testID="terms-gate-terms"
          />
          <LegalTextLink
            label="Read the Privacy Policy"
            url={PRIVACY_URL}
            target="the privacy policy"
            testID="terms-gate-privacy"
          />
        </View>

        {accept.isError ? (
          <Banner
            tone="danger"
            title="We could not save that"
            message="Please check your connection and try again."
            testID="terms-gate-error"
          />
        ) : null}

        <Button
          label="Accept and continue"
          onPress={() => accept.mutate()}
          fullWidth
          loading={accept.isPending}
          disabled={accept.isPending || signingOut}
          testID="terms-gate-accept"
        />

        {/* The escape hatch: a user who will not accept must still be able to leave. */}
        <Button
          label="Sign out"
          variant="ghost"
          onPress={() => {
            setSigningOut(true);
            void supabase.auth.signOut().finally(() => setSigningOut(false));
          }}
          fullWidth
          disabled={accept.isPending || signingOut}
          testID="terms-gate-sign-out"
        />

        <Text role="caption" tone="muted" align="center">
          Version {TERMS_VERSION}
        </Text>
      </ScrollView>
    </View>
  );
}
