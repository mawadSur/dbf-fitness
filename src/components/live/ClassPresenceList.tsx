import { View } from 'react-native';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import { Banner, Card, Icon, SectionHeader, Skeleton, Text } from '../ui';

export type PresenceEntry = { userId: string; fullName: string };

type Props = {
  entries: readonly PresenceEntry[];
  /** True when the presence channel could not be joined — the call itself is fine. */
  unavailable: boolean;
  /** Marks the caller's own row with "(you)". */
  currentUserId?: string | null;
};

/**
 * Who else is in the call. Three states, all rendered here: the channel is
 * unavailable (partial data — say so and reassure), nobody has reported in yet
 * (placeholder rows, so the card does not resize when they arrive), and the list.
 */
export function ClassPresenceList({ entries, unavailable, currentUserId }: Props) {
  const { colors, tokens } = useOptionalTheme();

  return (
    <Card testID="class-presence" style={{ gap: tokens.space.sm }}>
      <SectionHeader
        title={unavailable ? 'In this class' : `In this class (${entries.length})`}
        style={{ marginBottom: 0 }}
      />

      {unavailable ? (
        <Banner
          tone="warning"
          icon="alert-triangle"
          title="Participant list unavailable"
          message="You are still in the class."
          testID="presence-unavailable"
        />
      ) : entries.length === 0 ? (
        <View testID="presence-connecting" style={{ gap: tokens.space.sm }}>
          <Text role="bodySm" tone="muted">
            Connecting…
          </Text>
          <Skeleton width="60%" height={16} />
          <Skeleton width="45%" height={16} />
        </View>
      ) : (
        <View style={{ gap: tokens.space.sm }}>
          {entries.map((entry) => (
            <View
              key={entry.userId}
              style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space.sm }}
            >
              <Icon name="profile" size={16} color={colors.textSecondary} />
              <Text role="bodySm" numberOfLines={1} style={{ flex: 1 }}>
                {entry.fullName}
                {entry.userId === currentUserId ? ' (you)' : ''}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}
