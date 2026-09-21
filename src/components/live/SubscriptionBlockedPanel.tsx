import { View } from 'react-native';

import { billingUrl, CONTACT_COACH_TO_RENEW, openBilling } from '../../features/liveClasses/billing';
import type { BlockedReason } from '../../features/liveClasses/joinDecision';
import { useOptionalTheme } from '../../theme/ThemeProvider';
import { Banner, Button, Text } from '../ui';

type Props = {
  reason: BlockedReason;
  /** Class screen only: re-ask the server after the member renewed. */
  onRecheck?: () => void;
  checking?: boolean;
};

export const BLOCKED_COPY: Record<BlockedReason, { title: string; body: string; cta: string }> = {
  expired: {
    title: 'Subscription required',
    body: 'Your subscription has lapsed. Renew to join live classes again.',
    cta: 'Renew subscription',
  },
  required: {
    title: 'Subscription required',
    body: 'Live classes are for subscribed members. Subscribe to join your coach’s sessions.',
    cta: 'Subscribe',
  },
};

/**
 * Shown instead of Join when the member has no live-class access. The warning
 * `Banner` carries the icon and the words; the actions sit under it so the
 * message is never a dead end. Never crashes without a billing URL.
 */
export function SubscriptionBlockedPanel({ reason, onRecheck, checking = false }: Props) {
  const { tokens } = useOptionalTheme();
  const copy = BLOCKED_COPY[reason];
  const hasBilling = billingUrl() !== null;

  return (
    <View testID="subscription-blocked" style={{ gap: tokens.space.md }}>
      <Banner tone="warning" icon="lock" title={copy.title} message={copy.body} />
      {hasBilling ? (
        <Button label={copy.cta} onPress={() => void openBilling()} trailingIcon="external-link" />
      ) : (
        <Text role="bodySm" tone="warning">
          {CONTACT_COACH_TO_RENEW}
        </Text>
      )}
      {onRecheck ? (
        <Button
          label="I’ve renewed — check again"
          variant="secondary"
          onPress={onRecheck}
          loading={checking}
        />
      ) : null}
    </View>
  );
}
