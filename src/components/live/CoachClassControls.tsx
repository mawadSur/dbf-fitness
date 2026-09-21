import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { fetchClassAttendees, updateLiveClassStatus, type LiveClass } from '../../features/liveClasses/api';
import {
  ACTION_CONFIRM_TEXT,
  ACTION_LABEL,
  ACTION_TARGET_STATUS,
  coachActionsFor,
  uploadRecordingHref,
  type CoachAction,
} from '../../features/liveClasses/coachActions';
import { useOptionalTheme } from '../../theme/ThemeProvider';
import { friendlyErrorMessage } from '../friendlyError';
import { Badge, Banner, Button, Card, SectionHeader, Skeleton, Text } from '../ui';
import { useDelayedVisible } from '../ui/useDelayedVisible';

const ATTENDEE_REFETCH_MS = 15_000;

/** Start / End / Cancel (inline confirm, no Alert), attendee list and the post-class recording link. Owner only. */
export function CoachClassControls({ liveClass }: { liveClass: LiveClass }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { tokens } = useOptionalTheme();
  const [pending, setPending] = useState<CoachAction | null>(null);
  const actions = coachActionsFor(liveClass.status);

  const attendees = useQuery({
    queryKey: ['liveClasses', 'attendees', liveClass.id],
    queryFn: () => fetchClassAttendees(liveClass.id),
    refetchInterval: liveClass.status === 'live' ? ATTENDEE_REFETCH_MS : false,
  });
  const showSkeleton = useDelayedVisible(attendees.isLoading);

  const mutation = useMutation({
    mutationFn: (action: CoachAction) => updateLiveClassStatus(liveClass.id, ACTION_TARGET_STATUS[action]),
    onSuccess: async () => {
      setPending(null);
      await queryClient.invalidateQueries({ queryKey: ['liveClasses'] });
    },
  });

  const rows = attendees.data ?? [];

  return (
    <Card testID="coach-controls" tone="soft" padding={16} style={{ gap: tokens.space.md }}>
      <SectionHeader title="Coach controls" style={{ marginBottom: 0 }} />

      {actions.length > 0 && pending === null ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.sm }}>
          {actions.map((action) => (
            <Button
              key={action}
              label={ACTION_LABEL[action]}
              variant={action === 'start' ? 'primary' : 'secondary'}
              leadingIcon={action === 'start' ? 'play' : action === 'end' ? 'pause' : 'x'}
              onPress={() => {
                mutation.reset();
                setPending(action);
              }}
            />
          ))}
        </View>
      ) : null}

      {pending !== null ? (
        <Card tone="raised" padding={16} style={{ gap: tokens.space.md }}>
          <Text role="bodySm" accessibilityRole="text">
            {ACTION_CONFIRM_TEXT[pending]}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.sm }}>
            <Button
              label={`Yes, ${ACTION_LABEL[pending].toLowerCase()}`}
              variant={pending === 'start' ? 'primary' : 'danger'}
              loading={mutation.isPending}
              onPress={() => mutation.mutate(pending)}
            />
            <Button
              label="Keep as is"
              variant="ghost"
              disabled={mutation.isPending}
              onPress={() => setPending(null)}
            />
          </View>
        </Card>
      ) : null}

      {mutation.isError ? (
        <Banner
          tone="danger"
          title="Class not updated"
          message={friendlyErrorMessage(mutation.error, 'Could not update the class.')}
        />
      ) : null}

      {liveClass.status === 'ended' ? (
        <Button
          label="Upload recording"
          leadingIcon="upload"
          onPress={() => router.push(uploadRecordingHref(liveClass.id))}
        />
      ) : null}

      <View style={{ gap: tokens.space.sm }}>
        <Text role="labelSm">Attendees{attendees.data ? ` (${rows.length})` : ''}</Text>
        {attendees.isLoading ? (
          showSkeleton ? (
            <Skeleton testID="attendees-skeleton" width="70%" height={16} />
          ) : null
        ) : attendees.isError ? (
          <Banner tone="danger" title="Could not load attendees." />
        ) : rows.length === 0 ? (
          <Text role="bodySm" tone="muted">
            No one has joined yet.
          </Text>
        ) : (
          rows.map((attendee) => (
            <View
              key={attendee.memberId}
              style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space.sm }}
            >
              <Text role="bodySm" numberOfLines={1} style={{ flex: 1 }}>
                {attendee.fullName}
              </Text>
              <Badge
                label={attendee.leftAt ? 'Left' : 'In class'}
                tone={attendee.leftAt ? 'neutral' : 'success'}
                icon={attendee.leftAt ? 'log-out' : 'check-circle'}
              />
            </View>
          ))
        )}
      </View>
    </Card>
  );
}
