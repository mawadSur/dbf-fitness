import { useState } from 'react';
import { View } from 'react-native';

import type { Coach, MyCoach } from '../../features/coaching/types';
import { useOptionalTheme } from '../../theme/ThemeProvider';
import { Badge, Button, Card, Icon, PressableBase, Text } from '../ui';
import { Avatar } from './Avatar';
import { coachCardState } from './coachCardState';
import { SpecialtyChipList } from './SpecialtyChips';

export { Avatar } from './Avatar';

const BIO_COLLAPSED_LINES = 3;

type Props = {
  coach: Coach;
  currentCoachId?: string | null;
  onSelect?: (coach: Coach) => void;
  disabled?: boolean;
};

export function CoachCard({ coach, currentCoachId, onSelect, disabled }: Props) {
  const { colors } = useOptionalTheme();
  const [expanded, setExpanded] = useState(false);
  const state = coachCardState(coach, currentCoachId);
  const bio = coach.bio?.trim() ?? '';
  const longBio = bio.length > 120;
  const accepting = state.availability === 'accepting';

  return (
    <Card padding={16} tone={state.isCurrent ? 'soft' : 'surface'}>
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Avatar name={coach.fullName} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text role="h3" numberOfLines={2}>
              {coach.fullName || 'Coach'}
            </Text>
            <Text role="bodySm" tone="muted">
              {state.memberCountLabel}
            </Text>
          </View>
        </View>

        {/* The selected coach is marked by a check icon and the words "Your coach", never by the
            soft card tint alone (design system §9).

            "Your coach" used to be an `info` badge: blue text on a blue wash, the only blue in a
            deep-emerald brand, sitting right beside the green "Accepting members" pill. Two
            unrelated hues on one row read as two unrelated kinds of fact. It is now the emerald
            `success` pair — the palette's "this is settled" tone — and it comes FIRST, because
            once a coach is yours, whether they are taking new members is the lesser fact and
            drops to `neutral`. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {state.isCurrent ? (
            <Badge label="Your coach" tone="success" icon="check-circle" testID="coach-current-badge" />
          ) : null}
          <Badge
            label={accepting ? 'Accepting members' : 'Not accepting'}
            tone={accepting && !state.isCurrent ? 'success' : 'neutral'}
            icon={accepting ? 'check-circle' : 'lock'}
          />
        </View>

        {bio ? (
          <View style={{ gap: 4 }}>
            <Text role="bodySm" tone="secondary" numberOfLines={expanded ? undefined : BIO_COLLAPSED_LINES}>
              {bio}
            </Text>
            {longBio ? (
              <PressableBase
                onPress={() => setExpanded((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={expanded ? `Show less about ${coach.fullName}` : `Read more about ${coach.fullName}`}
                accessibilityState={{ expanded }}
                android_ripple={{ color: colors.bgSoft }}
                pressFeedback={0.7}
                // Layout NEVER goes in a style callback — see `PressableBase`.
                style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4 }}
              >
                <Text role="labelSm" tone="secondary">
                  {expanded ? 'Show less' : 'Read more'}
                </Text>
                <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSecondary} />
              </PressableBase>
            ) : null}
          </View>
        ) : null}

        <SpecialtyChipList items={coach.specialties} />

        {onSelect ? (
          <Button
            label={state.isCurrent ? 'Current coach' : state.selectable ? 'Choose coach' : 'Not accepting'}
            accessibilityLabel={`Choose ${coach.fullName} as your coach`}
            onPress={() => onSelect(coach)}
            disabled={!state.selectable || !!disabled}
            variant={state.selectable ? 'primary' : 'secondary'}
            fullWidth
          />
        ) : null}
      </View>
    </Card>
  );
}

/** The member's current coach, shown on the profile tab. */
export function CurrentCoachCard({ coach, onChange }: { coach: MyCoach; onChange: () => void }) {
  const bio = coach.bio?.trim() ?? '';
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Avatar name={coach.fullName} />
        <Text role="h3" numberOfLines={2} style={{ flex: 1 }}>
          {coach.fullName || 'Coach'}
        </Text>
      </View>
      {bio ? (
        <Text role="bodySm" tone="secondary">
          {bio}
        </Text>
      ) : null}
      <SpecialtyChipList items={coach.specialties} />
      <Button label="Change coach" variant="secondary" onPress={onChange} fullWidth />
    </View>
  );
}
