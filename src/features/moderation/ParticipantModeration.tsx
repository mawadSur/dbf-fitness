import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { blockUser } from '../community/api';
import { friendlyErrorMessage } from '../../components/friendlyError';
import { ReportPanel } from '../../components/community/ReportPanel';
import { Banner, Button, Card, Text } from '../../components/ui';
import { useOptionalTheme } from '../../theme/ThemeProvider';

export type ModerationTarget = { userId: string; fullName: string };

type Panel =
  | { kind: 'closed' }
  | { kind: 'picker' }
  | { kind: 'report'; target: ModerationTarget }
  | { kind: 'block'; target: ModerationTarget }
  | { kind: 'reported' }
  | { kind: 'blocked'; fullName: string };

type Props = {
  /** Everyone currently in the class, including the viewer (filtered out below). */
  participants: readonly ModerationTarget[];
  currentUserId: string | null;
  testID?: string;
};

/**
 * Report and block, reachable FROM THE LIVE CLASS — Apple guideline 1.2 expects the safety
 * actions to be available wherever other users appear, not only in the community roster.
 *
 * It reuses the roster's own `ReportPanel` and `blockUser`, so there is exactly one report
 * pipeline and one block table; this component is only the entry point for the class context.
 * Everything is a visible, labelled button (no long-press, no hidden gesture), and the flow is
 * an inline panel rather than `Alert.alert`, which is a no-op on RN-web.
 */
export function ParticipantModeration({
  participants,
  currentUserId,
  testID = 'live-moderation',
}: Props) {
  const queryClient = useQueryClient();
  const { tokens } = useOptionalTheme();
  const [panel, setPanel] = useState<Panel>({ kind: 'closed' });
  const [error, setError] = useState<string | null>(null);

  const others = participants.filter((entry) => entry.userId !== currentUserId);

  const blockMutation = useMutation({
    mutationFn: (target: ModerationTarget) => blockUser(target.userId),
    onSuccess: (_result, target) => {
      setError(null);
      setPanel({ kind: 'blocked', fullName: target.fullName });
      void queryClient.invalidateQueries({ queryKey: ['community'] });
    },
    onError: (mutationError, target) => {
      setError(friendlyErrorMessage(mutationError, `Could not block ${target.fullName}.`));
    },
  });

  // Nobody else in the room yet: the control would have nothing to act on.
  if (others.length === 0) return null;

  return (
    <Card testID={testID} style={{ gap: tokens.space.md }}>
      <Text role="label">Safety</Text>

      {error ? <Banner tone="danger" title="That did not work" message={error} /> : null}

      {panel.kind === 'closed' ? (
        <View style={{ gap: tokens.space.sm }}>
          <Text role="bodySm" tone="secondary">
            Someone behaving badly in this class? You can report or block them here.
          </Text>
          <Button
            label="Report or block someone"
            variant="secondary"
            size="sm"
            onPress={() => setPanel({ kind: 'picker' })}
            testID={`${testID}-open`}
          />
        </View>
      ) : null}

      {panel.kind === 'picker' ? (
        <View style={{ gap: tokens.space.sm }}>
          {others.map((target) => (
            <View
              key={target.userId}
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: tokens.space.sm,
              }}
            >
              <Text role="label" numberOfLines={1} style={{ flex: 1, minWidth: 120 }}>
                {target.fullName}
              </Text>
              <Button
                label="Report"
                variant="secondary"
                size="sm"
                onPress={() => setPanel({ kind: 'report', target })}
                accessibilityLabel={`Report ${target.fullName}`}
                testID={`${testID}-report-${target.userId}`}
              />
              <Button
                label="Block"
                variant="ghost"
                size="sm"
                onPress={() => setPanel({ kind: 'block', target })}
                accessibilityLabel={`Block ${target.fullName}`}
                testID={`${testID}-block-${target.userId}`}
              />
            </View>
          ))}
          <Button
            label="Close"
            variant="ghost"
            size="sm"
            onPress={() => setPanel({ kind: 'closed' })}
            accessibilityLabel="Close safety options"
          />
        </View>
      ) : null}

      {panel.kind === 'report' ? (
        <ReportPanel
          memberId={panel.target.userId}
          fullName={panel.target.fullName}
          onSent={() => setPanel({ kind: 'reported' })}
          onCancel={() => setPanel({ kind: 'picker' })}
        />
      ) : null}

      {panel.kind === 'block' ? (
        <View style={{ gap: tokens.space.md }}>
          <Text role="bodySm">
            Block {panel.target.fullName}? You will stop seeing each other in group rosters.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.sm }}>
            <Button
              label="Yes, block"
              variant="danger"
              size="sm"
              onPress={() => blockMutation.mutate(panel.target)}
              loading={blockMutation.isPending}
              accessibilityLabel={`Yes, block ${panel.target.fullName}`}
            />
            <Button
              label="Keep as is"
              variant="ghost"
              size="sm"
              onPress={() => setPanel({ kind: 'picker' })}
              disabled={blockMutation.isPending}
              accessibilityLabel="Keep as is"
            />
          </View>
        </View>
      ) : null}

      {panel.kind === 'reported' ? (
        <Banner
          tone="success"
          title="Report sent. Thanks for keeping the class safe."
          testID={`${testID}-reported`}
        />
      ) : null}

      {panel.kind === 'blocked' ? (
        <Banner
          tone="success"
          title={`Blocked ${panel.fullName}.`}
          message="They no longer appear in your groups."
          testID={`${testID}-blocked`}
        />
      ) : null}
    </Card>
  );
}
