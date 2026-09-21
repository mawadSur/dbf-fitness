import { View } from 'react-native';

import { graceReminderCopy, type SubscriptionInfo } from '../../features/subscriptions/state';
import { Banner, Button, Text } from '../ui';
import { billingUrl, CONTACT_COACH_TO_RENEW, openBilling } from './billing';

/** Payment-overdue reminder for a member in the grace window. Access continues; this only nags. */
export function GraceBanner({ info }: { info: SubscriptionInfo }) {
  const copy = graceReminderCopy(info);
  const hasBilling = billingUrl() !== null;

  return (
    <View style={{ gap: 8 }}>
      <Banner tone="warning" title={copy.title} message={copy.body} />
      {hasBilling ? (
        <Button label="Renew now" variant="secondary" onPress={() => void openBilling()} fullWidth />
      ) : (
        <Text role="labelSm" tone="secondary">
          {CONTACT_COACH_TO_RENEW}
        </Text>
      )}
    </View>
  );
}
