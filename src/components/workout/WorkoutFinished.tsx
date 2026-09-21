import { useState } from 'react';
import { View } from 'react-native';

import { useMilestoneCheck } from '../../features/milestones/useMilestoneCheck';
import { MilestoneToast } from '../MilestoneToast';
import { Button, FixedFooter, HeroPanel, Heading, MilestoneBadge, ScreenShell, Text } from '../ui';

export type WorkoutFinishedProps = {
  onDone: () => void;
};

/**
 * The moment after a workout is logged.
 *
 * It still mounts `useMilestoneCheck`, so the milestone toast fires exactly
 * when it did before the redesign; the toast's own styling belongs to another
 * stream and is untouched here.
 */
export function WorkoutFinished({ onDone }: WorkoutFinishedProps) {
  const { newlyAchievedTier } = useMilestoneCheck();
  const [dismissed, setDismissed] = useState(false);
  const toastTier = dismissed ? null : newlyAchievedTier;

  return (
    <ScreenShell
      insideTabs
      testID="workout-finished"
      footer={
        <FixedFooter>
          <Button label="Done" onPress={onDone} fullWidth testID="workout-finished-done" />
        </FixedFooter>
      }
    >
      {toastTier ? (
        <MilestoneToast tier={toastTier} visible onDismiss={() => setDismissed(true)} />
      ) : null}

      <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 24 }}>
        <HeroPanel padding={24}>
          <View style={{ gap: 12, alignItems: 'flex-start' }}>
            <MilestoneBadge title="Workout logged" icon="check-circle" tone="success" />
            <Heading level={2}>Workout complete</Heading>
            <Text tone="secondary">Nice work — see you next session.</Text>
          </View>
        </HeroPanel>
      </View>
    </ScreenShell>
  );
}
