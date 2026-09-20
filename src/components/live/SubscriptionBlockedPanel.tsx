import { Text, View } from 'react-native';

import { billingUrl, CONTACT_COACH_TO_RENEW, openBilling } from '../../features/liveClasses/billing';
import type { BlockedReason } from '../../features/liveClasses/joinDecision';
import { LiveButton } from './LiveButton';

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

/** Shown instead of Join when the member has no live-class access. Never crashes without a billing URL. */
export function SubscriptionBlockedPanel({ reason, onRecheck, checking = false }: Props) {
  const copy = BLOCKED_COPY[reason];
  const hasBilling = billingUrl() !== null;

  return (
    <View
      accessibilityRole="alert"
      className="gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4"
    >
      <Text className="text-base font-bold text-amber-900">{copy.title}</Text>
      <Text className="text-sm text-amber-900">{copy.body}</Text>
      {hasBilling ? (
        <LiveButton label={copy.cta} onPress={() => void openBilling()} />
      ) : (
        <Text className="text-sm font-medium text-amber-900">{CONTACT_COACH_TO_RENEW}</Text>
      )}
      {onRecheck ? (
        <LiveButton
          label="I’ve renewed — check again"
          variant="secondary"
          onPress={onRecheck}
          busy={checking}
        />
      ) : null}
    </View>
  );
}
