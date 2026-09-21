import { View } from 'react-native';

import type { LiveClass } from '../../features/liveClasses/api';
import { STATUS_BADGE } from '../../features/liveClasses/schedule';
import {
  formatClassTiming,
  joinBlockedMessage,
  STATUS_BADGE_LABEL,
  type LiveClassDisplayState,
} from '../../features/liveClasses/status';
import { formatStartTime } from '../../features/liveClasses/timing';
import { useOptionalTheme } from '../../theme/ThemeProvider';
import { Badge, Banner, Button, Card, Text } from '../ui';

/** In-card gate copy. Deliberately NOT the wording of `SubscriptionBlockedPanel`: the panel above the list owns the renew CTA, the card owns the per-class reason. */
export const CARD_GATE = {
  title: 'Subscribed members only',
  message: 'Renew your membership to join your coach’s classes again.',
  action: 'Subscription required',
} as const;

type Props = {
  liveClass: LiveClass;
  state: LiveClassDisplayState;
  now: Date;
  /** False when the member has no live access: the action becomes the gate. */
  canOpen: boolean;
  /** "You run this class" — the only coach fact the schedule query carries. */
  coachLabel?: string | null;
  onOpen: () => void;
};

/**
 * One class in the schedule: title, who runs it, when (relative AND absolute), a
 * status `Badge` that pairs an icon with the word, and exactly one primary action.
 *
 * A member without live access sees the reason inside the card plus a disabled
 * action that repeats that reason in its accessibility label, so the button is
 * never just "disabled" to a screen reader.
 */
export function LiveClassCard({ liveClass, state, now, canOpen, coachLabel, onOpen }: Props) {
  const { tokens } = useOptionalTheme();
  const badge = STATUS_BADGE[state];
  const closedMessage = joinBlockedMessage(liveClass.status);

  return (
    <Card
      testID={`live-class-${liveClass.id}`}
      tone={state === 'live' ? 'raised' : 'surface'}
      style={{ gap: tokens.space.sm }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: tokens.space.sm }}>
        <Text role="h3" numberOfLines={2} style={{ flex: 1 }}>
          {liveClass.title}
        </Text>
        <Badge label={STATUS_BADGE_LABEL[state]} tone={badge.tone} icon={badge.icon} />
      </View>

      {coachLabel ? (
        <Text role="bodySm" tone="secondary" numberOfLines={1}>
          {coachLabel}
        </Text>
      ) : null}

      <Text role="bodySm" tone="muted">
        {formatStartTime(liveClass.starts_at)}
      </Text>
      <Text role="labelSm" testID={`live-class-timing-${liveClass.id}`}>
        {formatClassTiming(liveClass.status, liveClass.starts_at, now)}
      </Text>

      {state === 'starting-soon' ? (
        // The badge says it once; this repeats it where the eye lands, with the clock time,
        // because a class inside the reminder window is the one thing to act on now.
        <Banner
          tone="warning"
          icon="clock"
          title="Starting soon"
          message={`Starts at ${formatStartTime(liveClass.starts_at)}.`}
          testID={`live-class-soon-${liveClass.id}`}
        />
      ) : null}

      {closedMessage ? (
        <Text role="bodySm" tone="muted">
          {closedMessage}
        </Text>
      ) : canOpen ? (
        <Button
          label="Join class"
          leadingIcon="video"
          onPress={onOpen}
          accessibilityLabel={`Join ${liveClass.title}`}
          style={{ marginTop: tokens.space.xs }}
        />
      ) : (
        <View style={{ gap: tokens.space.sm, marginTop: tokens.space.xs }}>
          <Banner tone="warning" icon="lock" title={CARD_GATE.title} message={CARD_GATE.message} />
          <Button
            label={CARD_GATE.action}
            disabled
            accessibilityLabel={`${liveClass.title}: subscription required`}
            accessibilityHint={CARD_GATE.message}
          />
        </View>
      )}
    </Card>
  );
}
