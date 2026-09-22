import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { PRIVACY_URL, TERMS_URL } from '../../config/legal';
import { Text } from '../ui';
import { couldNotOpenMessage, openExternal } from './openExternal';

/** Height of the tappable text link; `hitSlop` lifts the real target to 44 pt. */
const LINK_HEIGHT = 28;
const LINK_HIT_SLOP = Math.ceil((44 - LINK_HEIGHT) / 2);

/**
 * Layout stays OUT of the pressed callback (enforced by `pressableSourceGuard`): a function
 * style that returns layout keys re-runs layout on every press instead of just repainting.
 */
const LINK_LAYOUT = { justifyContent: 'center' } as const;

export type LegalTextLinkProps = {
  label: string;
  url: string;
  /** Named in the failure message, e.g. "the terms of service". */
  target: string;
  testID?: string;
};

/**
 * An inline, underlined text link for the auth screens and the sign-up checkbox.
 *
 * It is a real `Pressable` with `accessibilityRole="link"` rather than a tappable `Text`, so
 * TalkBack and VoiceOver announce it and so Android gets a ripple. The visible text is only
 * 28 pt tall to sit inside a sentence, so `hitSlop` restores the 44 pt target the store
 * accessibility guidance (and our own mobile rules) require.
 */
export function LegalTextLink({ label, url, target, testID }: LegalTextLinkProps) {
  const [failed, setFailed] = useState(false);

  return (
    <Pressable
      onPress={() => {
        void (async () => setFailed(!(await openExternal(url))))();
      }}
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint="Opens in your browser"
      hitSlop={LINK_HIT_SLOP}
      android_ripple={Platform.OS === 'android' ? { color: 'rgba(5,150,105,0.18)' } : undefined}
      style={({ pressed }) => [LINK_LAYOUT, { opacity: pressed ? 0.6 : 1 }]}
      testID={testID}
    >
      <Text role="bodySm" tone="brand" style={{ textDecorationLine: 'underline' }}>
        {label}
      </Text>
      {failed ? (
        <Text role="bodySm" tone="danger">
          {couldNotOpenMessage(target)}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * The small legal footer under the sign-in and sign-up forms.
 *
 * Both stores expect the privacy policy to be reachable BEFORE an account exists — a reviewer
 * who cannot find it without signing up files a rejection — so it lives on the unauthenticated
 * screens as well as on Profile.
 */
export function LegalFooter({ testID = 'legal-footer' }: { testID?: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        columnGap: 8,
        rowGap: 4,
        paddingTop: 8,
      }}
      testID={testID}
    >
      <LegalTextLink
        label="Privacy Policy"
        url={PRIVACY_URL}
        target="the privacy policy"
        testID={`${testID}-privacy`}
      />
      <Text role="bodySm" tone="muted">
        ·
      </Text>
      <LegalTextLink
        label="Terms of Service"
        url={TERMS_URL}
        target="the terms of service"
        testID={`${testID}-terms`}
      />
    </View>
  );
}
