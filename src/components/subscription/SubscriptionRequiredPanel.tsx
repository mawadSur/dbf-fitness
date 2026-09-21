import { View } from 'react-native';

import { Banner, Button, Card, Text } from '../ui';
import { billingUrl, CONTACT_COACH_TO_RENEW, openBilling } from './billing';

type Props = {
  /** `expired`: had a subscription that lapsed past the grace window. `none`: never subscribed. */
  state: 'expired' | 'none';
  onRecheck?: () => void;
  checking?: boolean;
};

export const REQUIRED_COPY = {
  expired: {
    title: 'Your subscription has lapsed',
    body: 'Renew to read your workout notes again.',
    cta: 'Renew subscription',
  },
  none: {
    title: 'Subscribe to unlock workout notes',
    body: 'Workout notes are for subscribed members.',
    cta: 'Subscribe',
  },
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
        <Banner tone="warning" title={copy.title} message={copy.body} icon="lock" />
        {hasBilling ? (
          <Button label={copy.cta} onPress={() => void openBilling()} fullWidth />
        ) : (
          <Text role="labelSm" tone="secondary">
            {CONTACT_COACH_TO_RENEW}
          </Text>
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
