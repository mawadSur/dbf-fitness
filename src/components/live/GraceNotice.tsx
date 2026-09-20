import { Text, View } from 'react-native';

import { billingUrl, CONTACT_COACH_TO_RENEW, openBilling } from '../../features/liveClasses/billing';
import { graceBannerText, graceNoticeFacts } from '../../features/liveClasses/graceCopy';
import { graceReminderCopy, type SubscriptionInfo } from '../../features/subscriptions/state';
import { LiveButton } from './LiveButton';

/** Pre-join payment reminder for a member in the grace window. Shown on EVERY join. */
export function GraceNotice({
  info,
  onJoinAnyway,
  onDismiss,
  joining = false,
}: {
  info: SubscriptionInfo;
  onJoinAnyway: () => void;
  /** Back out to the Join button without joining. */
  onDismiss?: () => void;
  joining?: boolean;
}) {
  const copy = graceReminderCopy(info);
  const facts = graceNoticeFacts(info);
  const hasBilling = billingUrl() !== null;

  return (
    <View accessibilityRole="alert" className="gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <Text className="text-base font-bold text-amber-900">{copy.title}</Text>
      <View className="gap-1">
        {facts.map((fact) => (
          <Text key={fact} className="text-sm font-semibold text-amber-900">
            {fact}
          </Text>
        ))}
      </View>
      <Text className="text-sm text-amber-900">{copy.body}</Text>
      {hasBilling ? (
        <LiveButton label="Renew now" onPress={() => void openBilling()} />
      ) : (
        <Text className="text-sm font-medium text-amber-900">{CONTACT_COACH_TO_RENEW}</Text>
      )}
      <LiveButton
        label={joining ? 'Joining…' : 'Join anyway'}
        variant="secondary"
        onPress={onJoinAnyway}
        busy={joining}
      />
      {onDismiss ? (
        <LiveButton label="Not now" variant="ghost" onPress={onDismiss} disabled={joining} />
      ) : null}
    </View>
  );
}

/** Persistent in-call banner. Sits in normal flow above the video so it never pushes controls off screen. */
export function GraceBanner({ info }: { info: SubscriptionInfo }) {
  const hasBilling = billingUrl() !== null;
  return (
    <View
      accessibilityRole="alert"
      className="flex-row items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-100 px-3 py-2"
    >
      <Text className="flex-1 text-sm font-semibold text-amber-900" numberOfLines={2}>
        {graceBannerText(info)}
      </Text>
      {hasBilling ? (
        <LiveButton
          label="Renew"
          variant="ghost"
          onPress={() => void openBilling()}
          accessibilityLabel="Renew subscription"
        />
      ) : null}
    </View>
  );
}
