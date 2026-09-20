import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  chooseCoach,
  fetchCoaches,
  fetchMyCoach,
  fetchMyCoachProfile,
  saveMyCoachProfile,
  type ChooseCoachError,
} from './api';
import type { Coach, CoachProfile, CoachProfileInput, MyCoach } from './types';

export const COACHES_QUERY_KEY = ['coaching', 'coaches'] as const;
export const MY_COACH_QUERY_KEY = ['coaching', 'my-coach'] as const;
export const MY_COACH_PROFILE_QUERY_KEY = ['coaching', 'my-profile'] as const;

/** Everything that depends on which coach a member has. */
export const COACH_CHANGE_INVALIDATIONS = [
  ['coaching'],
  ['subscription'],
  ['liveClasses'],
  ['notes'],
  ['community'],
  ['workout'],
  ['effort'],
] as const;

export function useCoaches() {
  return useQuery<Coach[]>({ queryKey: COACHES_QUERY_KEY, queryFn: fetchCoaches });
}

/** `enabled` lets a caller skip the request for users who never have a coach (coaches/admins). */
export function useMyCoach(options?: { enabled?: boolean }) {
  return useQuery<MyCoach | null>({
    queryKey: MY_COACH_QUERY_KEY,
    queryFn: fetchMyCoach,
    enabled: options?.enabled ?? true,
  });
}

export function useChooseCoach() {
  const queryClient = useQueryClient();
  return useMutation<void, ChooseCoachError, string>({
    mutationFn: (coachId) => chooseCoach(coachId),
    onSuccess: async () => {
      await Promise.all(
        COACH_CHANGE_INVALIDATIONS.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey: [...queryKey] }),
        ),
      );
    },
  });
}

export function useMyCoachProfile() {
  return useQuery<CoachProfile | null>({
    queryKey: MY_COACH_PROFILE_QUERY_KEY,
    queryFn: fetchMyCoachProfile,
  });
}

export function useSaveMyCoachProfile() {
  const queryClient = useQueryClient();
  return useMutation<CoachProfile, Error, CoachProfileInput>({
    mutationFn: (input) => saveMyCoachProfile(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['coaching'] });
    },
  });
}
