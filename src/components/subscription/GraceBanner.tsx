import { Text, View } from 'react-native';

import { graceReminderCopy, type SubscriptionInfo } from '../../features/subscriptions/state';
import { NotesButton } from '../notes/NotesButton';
import { billingUrl, CONTACT_COACH_TO_RENEW, openBilling } from './billing';

/** Payment-overdue reminder for a member in the grace window. Access continues; this only nags. */
export function GraceBanner({ info }: { info: SubscriptionInfo }) {
  const copy = graceReminderCopy(info);
  const hasBilling = billingUrl() !== null;

  return (
    <View
      accessibilityRole="alert"
      style={{
        marginHorizontal: 16,
        marginTop: 8,
        gap: 6,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#FCD34D',
        backgroundColor: '#FFFBEB',
        padding: 12,
      }}
    >
      <Text style={{ fontSize: 15, fontWeight: '700', color: '#78350F' }}>{copy.title}</Text>
      <Text style={{ fontSize: 13, color: '#78350F' }}>{copy.body}</Text>
      {hasBilling ? (
        <NotesButton label="Renew now" variant="secondary" onPress={() => void openBilling()} />
      ) : (
        <Text style={{ fontSize: 13, fontWeight: '600', color: '#78350F' }}>{CONTACT_COACH_TO_RENEW}</Text>
      )}
    </View>
  );
}
