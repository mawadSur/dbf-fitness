import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { blockUser } from '../../features/community/api';
import type { RosterEntry } from '../../features/community/roster';
import { useOptionalTheme } from '../../theme/ThemeProvider';
import { friendlyErrorMessage } from '../friendlyError';
import { Banner, Button, Card, initialsOf, Text } from '../ui';
import type { Notice } from './NoticeBanner';
import { PresenceLabel } from './PresenceLabel';
import { ReportPanel } from './ReportPanel';

type Panel = 'closed' | 'report' | 'block' | 'reported';

type PersonRowProps = {
  entry: RosterEntry;
  onNotice: (notice: Notice) => void;
};

/**
 * One person in a group roster: avatar initials, name, presence as a dot AND a
 * word, and the two safety actions as permanently visible labelled buttons —
 * never a long-press or any other hidden gesture.
 */
export function PersonRow({ entry, onNotice }: PersonRowProps) {
  const queryClient = useQueryClient();
  const { colors, tokens } = useOptionalTheme();
  const [panel, setPanel] = useState<Panel>('closed');

  const blockMutation = useMutation({
    mutationFn: () => blockUser(entry.memberId),
    onSuccess: () => {
      onNotice({ tone: 'success', text: `Blocked ${entry.fullName}. They no longer appear in your groups.` });
      void queryClient.invalidateQueries({ queryKey: ['community'] });
    },
    onError: (error) => {
      onNotice({
        tone: 'error',
        text: friendlyErrorMessage(error, `Could not block ${entry.fullName}.`),
      });
    },
  });

  return (
    <Card testID={`person-${entry.memberId}`} style={{ gap: tokens.space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space.md }}>
        <View
          accessible={false}
          style={{
            width: 40,
            height: 40,
            flexShrink: 0,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: tokens.radii.pill,
            backgroundColor: colors.bgSoft,
          }}
        >
          <Text role="labelSm" tone="secondary" numberOfLines={1}>
            {initialsOf(entry.fullName)}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text role="label" numberOfLines={1}>
            {entry.fullName}
          </Text>
          <PresenceLabel online={entry.online} />
        </View>
      </View>

      {panel === 'closed' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.sm }}>
          <Button
            label="Report"
            variant="secondary"
            size="sm"
            onPress={() => setPanel('report')}
            accessibilityLabel={`Report ${entry.fullName}`}
          />
          <Button
            label="Block"
            variant="ghost"
            size="sm"
            onPress={() => setPanel('block')}
            accessibilityLabel={`Block ${entry.fullName}`}
          />
        </View>
      ) : null}

      {panel === 'report' ? (
        <ReportPanel
          memberId={entry.memberId}
          fullName={entry.fullName}
          onSent={() => setPanel('reported')}
          onCancel={() => setPanel('closed')}
        />
      ) : null}

      {panel === 'block' ? (
        <View style={{ gap: tokens.space.md }}>
          <Text role="bodySm">
            Block {entry.fullName}? You will stop seeing each other in group rosters.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.sm }}>
            <Button
              label="Yes, block"
              variant="danger"
              size="sm"
              onPress={() => blockMutation.mutate()}
              loading={blockMutation.isPending}
              accessibilityLabel={`Yes, block ${entry.fullName}`}
            />
            <Button
              label="Keep as is"
              variant="ghost"
              size="sm"
              onPress={() => setPanel('closed')}
              disabled={blockMutation.isPending}
              accessibilityLabel="Keep as is"
            />
          </View>
        </View>
      ) : null}

      {panel === 'reported' ? (
        <Banner
          tone="success"
          title="Report sent. Thanks for keeping the group safe."
          testID="report-sent"
        />
      ) : null}
    </Card>
  );
}
