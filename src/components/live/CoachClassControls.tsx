import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { fetchClassAttendees, updateLiveClassStatus, type LiveClass } from '../../features/liveClasses/api';
import {
  ACTION_CONFIRM_TEXT,
  ACTION_LABEL,
  ACTION_TARGET_STATUS,
  coachActionsFor,
  uploadRecordingHref,
  type CoachAction,
} from '../../features/liveClasses/coachActions';
import { LiveButton } from './LiveButton';

const ATTENDEE_REFETCH_MS = 15_000;

/** Start / End / Cancel (inline confirm, no Alert), attendee list and the post-class recording link. Owner only. */
export function CoachClassControls({ liveClass }: { liveClass: LiveClass }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<CoachAction | null>(null);
  const actions = coachActionsFor(liveClass.status);

  const attendees = useQuery({
    queryKey: ['liveClasses', 'attendees', liveClass.id],
    queryFn: () => fetchClassAttendees(liveClass.id),
    refetchInterval: liveClass.status === 'live' ? ATTENDEE_REFETCH_MS : false,
  });

  const mutation = useMutation({
    mutationFn: (action: CoachAction) => updateLiveClassStatus(liveClass.id, ACTION_TARGET_STATUS[action]),
    onSuccess: async () => {
      setPending(null);
      await queryClient.invalidateQueries({ queryKey: ['liveClasses'] });
    },
  });

  return (
    <View className="gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <Text className="text-base font-bold text-slate-900">Coach controls</Text>

      {actions.length > 0 && pending === null ? (
        <View className="flex-row flex-wrap gap-2">
          {actions.map((action) => (
            <LiveButton
              key={action}
              label={ACTION_LABEL[action]}
              variant={action === 'cancel' ? 'secondary' : 'primary'}
              onPress={() => {
                mutation.reset();
                setPending(action);
              }}
            />
          ))}
        </View>
      ) : null}

      {pending !== null ? (
        <View accessibilityRole="alert" className="gap-2 rounded-lg border border-slate-300 bg-white p-3">
          <Text className="text-sm text-slate-900">{ACTION_CONFIRM_TEXT[pending]}</Text>
          <View className="flex-row flex-wrap gap-2">
            <LiveButton
              label={`Yes, ${ACTION_LABEL[pending].toLowerCase()}`}
              variant={pending === 'start' ? 'primary' : 'danger'}
              busy={mutation.isPending}
              onPress={() => mutation.mutate(pending)}
            />
            <LiveButton
              label="Keep as is"
              variant="secondary"
              disabled={mutation.isPending}
              onPress={() => setPending(null)}
            />
          </View>
        </View>
      ) : null}

      {mutation.isError ? (
        <Text className="text-sm text-red-700">
          {mutation.error instanceof Error ? mutation.error.message : 'Could not update the class.'}
        </Text>
      ) : null}

      {liveClass.status === 'ended' ? (
        <LiveButton
          label="Upload recording"
          onPress={() => router.push(uploadRecordingHref(liveClass.id))}
        />
      ) : null}

      <View className="gap-1">
        <Text className="text-sm font-semibold text-slate-900">
          Attendees{attendees.data ? ` (${attendees.data.length})` : ''}
        </Text>
        {attendees.isLoading ? (
          <Text className="text-sm text-slate-500">Loading attendees…</Text>
        ) : attendees.isError ? (
          <Text className="text-sm text-red-700">Could not load attendees.</Text>
        ) : (attendees.data ?? []).length === 0 ? (
          <Text className="text-sm text-slate-500">No one has joined yet.</Text>
        ) : (
          (attendees.data ?? []).map((attendee) => (
            <View key={attendee.memberId} className="flex-row items-center justify-between gap-2">
              <Text className="flex-1 text-sm text-slate-700" numberOfLines={1}>
                {attendee.fullName}
              </Text>
              <Text className="text-xs text-slate-500">{attendee.leftAt ? 'Left' : 'In class'}</Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}
