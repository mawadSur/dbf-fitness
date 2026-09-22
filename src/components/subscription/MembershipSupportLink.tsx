import { useState } from 'react';
import { Platform, Pressable } from 'react-native';

import { SUPPORT_EMAIL } from '../../config/legal';
import { couldNotOpenMailMessage, openExternal } from '../legal/openExternal';
import { Text } from '../ui';
import { membershipMailto } from './billing';

const LINK_HEIGHT = 28;
const LINK_HIT_SLOP = Math.ceil((44 - LINK_HEIGHT) / 2);

/** Layout stays out of the pressed callback — see `pressableSourceGuard`. */
const LINK_LAYOUT = { justifyContent: 'center' } as const;

/**
 * "Email DBF about my membership" — the ONLY affordance offered on a subscription surface
 * when `billingLinkAllowed()` is false.
 *
 * It opens the mail app, not a payment page, so it is a support contact rather than a "call
 * to action" steering the user to an external purchase (Apple 3.1.1 / 3.1.3, Play Payments
 * policy — see the comment in `billing.ts`).
 */
export function MembershipSupportLink({ testID = 'membership-support' }: { testID?: string }) {
  const [failed, setFailed] = useState(false);

  return (
    <Pressable
      onPress={() => {
        void (async () => setFailed(!(await openExternal(membershipMailto()))))();
      }}
      accessibilityRole="link"
      accessibilityLabel={`Email DBF at ${SUPPORT_EMAIL}`}
      accessibilityHint="Opens your mail app"
      hitSlop={LINK_HIT_SLOP}
      android_ripple={Platform.OS === 'android' ? { color: 'rgba(5,150,105,0.18)' } : undefined}
      style={({ pressed }) => [LINK_LAYOUT, { opacity: pressed ? 0.6 : 1 }]}
      testID={testID}
    >
      <Text role="labelSm" tone="brand" style={{ textDecorationLine: 'underline' }}>
        {SUPPORT_EMAIL}
      </Text>
      {failed ? (
        <Text role="bodySm" tone="danger" testID={`${testID}-error`}>
          {couldNotOpenMailMessage(SUPPORT_EMAIL)}
        </Text>
      ) : null}
    </Pressable>
  );
}
