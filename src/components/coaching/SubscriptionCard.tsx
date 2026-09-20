import { Linking, Pressable, Text, View } from 'react-native';

import { graceReminderCopy, type SubscriptionInfo } from '../../features/subscriptions/state';
import { subscriptionChip } from './coachCardState';

const TONES = {
  good: { bg: '#D1FAE5', fg: '#065F46' },
  warn: { bg: '#FEF3C7', fg: '#92400E' },
  bad: { bg: '#FEE2E2', fg: '#991B1B' },
  neutral: { bg: '#F1F5F9', fg: '#334155' },
} as const;

export function billingUrl(): string | null {
  const url = process.env.EXPO_PUBLIC_BILLING_URL;
  return url && url.trim() ? url.trim() : null;
}

export function SubscriptionCard({ info }: { info: SubscriptionInfo }) {
  const chip = subscriptionChip(info.state);
  const tone = TONES[chip.tone];
  const copy = graceReminderCopy(info);
  const needsAction = info.state === 'grace' || info.state === 'expired' || info.state === 'none';
  const url = billingUrl();
  const cta = info.state === 'none' ? 'Subscribe' : 'Renew';

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <View testID="subscription-chip" style={{ backgroundColor: tone.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: tone.fg }}>{chip.label}</Text>
        </View>
        {info.currentPeriodEnd && info.state !== 'staff' ? (
          <Text style={{ fontSize: 13, color: '#475569' }}>
            {`Period ends ${new Date(info.currentPeriodEnd).toLocaleDateString()}`}
          </Text>
        ) : null}
      </View>
      <Text style={{ fontSize: 15, fontWeight: '600', color: '#0F172A' }}>{copy.title}</Text>
      <Text style={{ fontSize: 14, color: '#334155', lineHeight: 20 }}>{copy.body}</Text>
      {needsAction ? (
        url ? (
          <Pressable
            onPress={() => {
              Linking.openURL(url).catch(() => undefined);
            }}
            accessibilityRole="button"
            accessibilityLabel={cta}
            android_ripple={{ color: '#A7F3D0' }}
            style={({ pressed }) => ({
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 12,
              backgroundColor: '#047857',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ fontWeight: '600', color: '#FFFFFF' }}>{cta}</Text>
          </Pressable>
        ) : (
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#047857' }}>Contact your coach to renew</Text>
        )
      ) : null}
    </View>
  );
}
