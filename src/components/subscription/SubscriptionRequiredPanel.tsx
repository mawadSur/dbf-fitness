import { Text, View } from 'react-native';

import { NotesButton } from '../notes/NotesButton';
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

/** Shown in place of workout notes when the member has no access. Never crashes without a billing URL. */
export function SubscriptionRequiredPanel({ state, onRecheck, checking = false }: Props) {
  const copy = REQUIRED_COPY[state];
  const hasBilling = billingUrl() !== null;

  return (
    <View
      accessibilityRole="alert"
      style={{
        margin: 16,
        gap: 8,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#FCD34D',
        backgroundColor: '#FFFBEB',
        padding: 16,
      }}
    >
      <Text style={{ fontSize: 18, fontWeight: '700', color: '#78350F' }}>{copy.title}</Text>
      <Text style={{ fontSize: 14, color: '#78350F' }}>{copy.body}</Text>
      {hasBilling ? (
        <NotesButton label={copy.cta} onPress={() => void openBilling()} />
      ) : (
        <Text style={{ fontSize: 14, fontWeight: '600', color: '#78350F' }}>{CONTACT_COACH_TO_RENEW}</Text>
      )}
      {onRecheck ? (
        <NotesButton
          label="I’ve renewed — check again"
          variant="secondary"
          onPress={onRecheck}
          busy={checking}
        />
      ) : null}
    </View>
  );
}
