import { Linking, View } from 'react-native';

import { graceReminderCopy, type SubscriptionInfo } from '../../features/subscriptions/state';
import { Badge, Button, Text } from '../ui';
import { subscriptionChip } from './coachCardState';

export function billingUrl(): string | null {
  const url = process.env.EXPO_PUBLIC_BILLING_URL;
  return url && url.trim() ? url.trim() : null;
}

/** When the current period ends, spelled out rather than an ISO string. */
export function renewalLine(info: SubscriptionInfo): string | null {
  if (!info.currentPeriodEnd || info.state === 'staff') return null;
  const date = new Date(info.currentPeriodEnd);
  if (Number.isNaN(date.getTime())) return null;
  const when = date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  return info.state === 'active' ? `Renews ${when}` : `Period ended ${when}`;
}

export function SubscriptionCard({ info }: { info: SubscriptionInfo }) {
  const chip = subscriptionChip(info.state, info.graceDaysLeft);
  const copy = graceReminderCopy(info);
  const needsAction = info.state === 'grace' || info.state === 'expired' || info.state === 'none';
  const url = billingUrl();
  const cta = info.state === 'none' ? 'Subscribe' : 'Renew';
  const renewal = renewalLine(info);

  return (
    <View style={{ gap: 10 }}>
      <View testID="subscription-chip">
        <Badge label={chip.label} tone={chip.tone} icon={chip.icon} />
      </View>
      {renewal ? (
        <Text role="bodySm" tone="muted">
          {renewal}
        </Text>
      ) : null}
      <Text role="label">{copy.title}</Text>
      <Text role="bodySm" tone="secondary">
        {copy.body}
      </Text>
      {needsAction ? (
        url ? (
          <Button
            label={cta}
            onPress={() => {
              Linking.openURL(url).catch(() => undefined);
            }}
            fullWidth
          />
        ) : (
          <Text role="labelSm" tone="secondary">
            Contact your coach to renew
          </Text>
        )
      ) : null}
    </View>
  );
}
