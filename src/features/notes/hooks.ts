import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fetchCheckedKeys,
  fetchCoachClassById,
  fetchCoachClasses,
  fetchCoachRecordings,
  fetchNotesViewer,
  fetchPublishedRecordings,
  fetchRecordingDetail,
  setItemChecked,
} from './api';
import { toggleKey } from './progress';
import { pollIntervalFor } from './status';

export const notesKeys = {
  viewer: ['notes', 'viewer'] as const,
  coachList: (viewerId: string | undefined) => ['notes', 'coach-list', viewerId] as const,
  memberList: ['notes', 'member-list'] as const,
  detail: (recordingId: string) => ['notes', 'detail', recordingId] as const,
  classById: (viewerId: string | undefined, classId: string | undefined) =>
    ['notes', 'class', viewerId, classId] as const,
  classes: (viewerId: string | undefined) => ['notes', 'classes', viewerId] as const,
  progress: (noteId: string | null | undefined) => ['notes', 'progress', noteId] as const,
};

export function useNotesViewer() {
  return useQuery({ queryKey: notesKeys.viewer, queryFn: fetchNotesViewer });
}

export function useCoachRecordings(viewerId: string | undefined) {
  return useQuery({
    queryKey: notesKeys.coachList(viewerId),
    queryFn: () => fetchCoachRecordings(viewerId as string),
    enabled: !!viewerId,
    // Recordings in flight move on their own; keep the list honest without a manual refresh. The
    // fastest row sets the pace, so a list of nothing but stalled recordings backs off.
    refetchInterval: (query) => {
      const intervals = (query.state.data ?? [])
        .map((r) => pollIntervalFor(r))
        .filter((ms): ms is number => ms !== false);
      return intervals.length === 0 ? false : Math.min(...intervals);
    },
  });
}

export function usePublishedRecordings(enabled: boolean) {
  return useQuery({ queryKey: notesKeys.memberList, queryFn: fetchPublishedRecordings, enabled });
}

export function useCoachClasses(viewerId: string | undefined) {
  return useQuery({
    queryKey: notesKeys.classes(viewerId),
    queryFn: () => fetchCoachClasses(viewerId as string),
    enabled: !!viewerId,
  });
}

/** The `?classId=` deep-link target, fetched by id so it works past the first 50 listed classes. */
export function useDeepLinkedClass(viewerId: string | undefined, classId: string | undefined) {
  return useQuery({
    queryKey: notesKeys.classById(viewerId, classId),
    queryFn: () => fetchCoachClassById(viewerId as string, classId as string),
    enabled: !!viewerId && !!classId,
  });
}

/**
 * Re-renders the caller every `intervalMs` while `active`. Retry eligibility depends on the clock
 * (grace windows, lease expiry) but a refetch that returns identical data does not re-render, so
 * without a tick a "stalled" recording would only be flagged once something else changed.
 */
export function useNowTick(active: boolean, intervalMs = 5000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return now;
}

/** Refetches whenever the screen regains focus, but not on the first mount (the query covers it). */
export function useRefetchOnFocus(refetch: () => unknown) {
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      void refetch();
    }, [refetch])
  );
}

/**
 * The recording detail. Polls every ~3 s only while the DB says the recording is uploading or
 * transcribing; TanStack clears its interval on unmount, so no timer outlives the screen.
 */
export function useRecordingDetail(recordingId: string) {
  const query = useQuery({
    queryKey: notesKeys.detail(recordingId),
    queryFn: () => fetchRecordingDetail(recordingId),
    refetchInterval: (q) => pollIntervalFor(q.state.data),
  });
  useRefetchOnFocus(query.refetch);
  return query;
}

/** Persistent per-item checks with an optimistic toggle that rolls back on failure. */
export function useMemberProgress(noteId: string | null | undefined) {
  const queryClient = useQueryClient();
  const key = notesKeys.progress(noteId);

  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchCheckedKeys(noteId as string),
    enabled: !!noteId,
  });

  const mutation = useMutation({
    // One at a time, so rapid taps hit the server in tap order.
    scope: { id: 'notes-progress' },
    mutationFn: ({ itemKey, checked }: { itemKey: string; checked: boolean }) =>
      setItemChecked(noteId as string, itemKey, checked),
    onMutate: async ({ itemKey }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<string[]>(key) ?? [];
      queryClient.setQueryData<string[]>(key, [...toggleKey(new Set(previous), itemKey)]);
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  return {
    checkedKeys: new Set(query.data ?? []),
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    toggle: (itemKey: string, currentlyChecked: boolean) =>
      mutation.mutate({ itemKey, checked: !currentlyChecked }),
    toggleError: mutation.isError,
  };
}
