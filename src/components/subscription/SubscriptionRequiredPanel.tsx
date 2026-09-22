import { View } from 'react-native';

import { Banner, Button, Card } from '../ui';
import { billingUrl, MANAGED_BY_DBF, openBilling } from './billing';
import { MembershipSupportLink } from './MembershipSupportLink';

type Props = {
  /** `expired`: had a subscription that lapsed past the grace window. `none`: never subscribed. */
  state: 'expired' | 'none';
  onRecheck?: () => void;
  checking?: boolean;
};

export const REQUIRED_COPY = {
  expired: {
    title: 'Your membership has lapsed',
    body: 'Renew to read your workout notes again.',
    cta: 'Renew subscription',
  },
  none: {
    title: 'Workout notes are for members',
    body: 'Workout notes are for subscribed members.',
    cta: 'Subscribe',
  },
} as const;

/**
 * Body text used when `billingLinkAllowed()` is false (every store build). It states how
 * membership works instead of inviting a purchase, so no surface carries a call to action
 * toward an external payment. See the policy note in `billing.ts`.
 */
export const NEUTRAL_BODY = {
  expired: `Workout notes are for members with an active membership. ${MANAGED_BY_DBF}`,
  none: `Workout notes are for members with an active membership. ${MANAGED_BY_DBF}`,
} as const;

/**
 * Shown in place of workout notes when the member has no access.
 *
 * The reason is a `Banner` (alert role, icon + words, so it is announced and never signalled by
 * colour alone) inside a card that carries the way out. Never crashes without a billing URL.
 */
export function SubscriptionRequiredPanel({ state, onRecheck, checking = false }: Props) {
  const copy = REQUIRED_COPY[state];
  const hasBilling = billingUrl() !== null;

  return (
    <Card padding={16} testID="subscription-required">
      <View style={{ gap: 12 }}>
        <Banner
          tone="warning"
          title={copy.title}
          message={hasBilling ? copy.body : NEUTRAL_BODY[state]}
          icon="lock"
        />
        {hasBilling ? (
          <Button label={copy.cta} onPress={() => void openBilling()} fullWidth />
        ) : (
          <MembershipSupportLink />
        )}
        {onRecheck ? (
          <Button
            label="I’ve renewed — check again"
            variant="secondary"
            onPress={onRecheck}
            loading={checking}
            fullWidth
          />
        ) : null}
      </View>
    </Card>
  );
}
