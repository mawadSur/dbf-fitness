import { View } from 'react-native';

import { billingUrl, CONTACT_COACH_TO_RENEW, openBilling } from '../../features/liveClasses/billing';
import { graceBannerText, graceNoticeFacts } from '../../features/liveClasses/graceCopy';
import { graceReminderCopy, type SubscriptionInfo } from '../../features/subscriptions/state';
import { useOptionalTheme } from '../../theme/ThemeProvider';
import { Banner, Button, Card, Icon, Text } from '../ui';

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
  const { colors, tokens } = useOptionalTheme();
  const copy = graceReminderCopy(info);
  const facts = graceNoticeFacts(info);
  const hasBilling = billingUrl() !== null;

  return (
    <Card testID="grace-notice" tone="raised" style={{ gap: tokens.space.md }}>
      <Banner tone="warning" title={copy.title} message={copy.body} />

      <View style={{ gap: tokens.space.xs }}>
        {facts.map((fact) => (
          <View key={fact} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="clock" size={16} color={colors.warning} />
            <Text role="labelSm" tone="warning">
              {fact}
            </Text>
          </View>
        ))}
      </View>

      {hasBilling ? (
        <Button label="Renew now" onPress={() => void openBilling()} trailingIcon="external-link" />
      ) : (
        <Text role="bodySm" tone="warning">
          {CONTACT_COACH_TO_RENEW}
        </Text>
      )}
      <Button
        label={joining ? 'Joining…' : 'Join anyway'}
        variant="secondary"
        onPress={onJoinAnyway}
        loading={joining}
      />
      {onDismiss ? (
        <Button label="Not now" variant="ghost" onPress={onDismiss} disabled={joining} />
      ) : null}
    </Card>
  );
}

/** Persistent in-call banner. Sits in normal flow above the video so it never pushes controls off screen. */
export function GraceBanner({ info }: { info: SubscriptionInfo }) {
  const { tokens } = useOptionalTheme();
  const hasBilling = billingUrl() !== null;

  return (
    <View testID="grace-banner" style={{ gap: tokens.space.sm }}>
      <Banner tone="warning" title={graceBannerText(info)} />
      {hasBilling ? (
        <Button
          label="Renew"
          variant="ghost"
          size="sm"
          onPress={() => void openBilling()}
          accessibilityLabel="Renew subscription"
        />
      ) : null}
    </View>
  );
}
