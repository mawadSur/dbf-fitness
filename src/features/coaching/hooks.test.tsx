import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { chooseCoach, fetchCoaches, fetchMyCoach, saveMyCoachProfile } from './api';
import {
  useChooseCoach,
  useCoaches,
  useMyCoach,
  useSaveMyCoachProfile,
} from './hooks';

jest.mock('./api', () => ({
  chooseCoach: jest.fn(),
  fetchCoaches: jest.fn(),
  fetchMyCoach: jest.fn(),
  fetchMyCoachProfile: jest.fn(),
  saveMyCoachProfile: jest.fn(),
}));

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

beforeEach(() => jest.clearAllMocks());

describe('queries', () => {
  it('useCoaches and useMyCoach use the agreed keys', async () => {
    (fetchCoaches as jest.Mock).mockResolvedValue([]);
    (fetchMyCoach as jest.Mock).mockResolvedValue(null);
    const { client, wrapper } = setup();
    const a = await renderHook(() => useCoaches(), { wrapper });
    const b = await renderHook(() => useMyCoach(), { wrapper });
    await waitFor(() => expect(a.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(b.result.current.isSuccess).toBe(true));
    expect(client.getQueryData(['coaching', 'coaches'])).toEqual([]);
    expect(client.getQueryData(['coaching', 'my-coach'])).toBeNull();
  });
});

describe('useChooseCoach', () => {
  it('invalidates the full dependent set on success', async () => {
    (chooseCoach as jest.Mock).mockResolvedValue(undefined);
    const { client, wrapper } = setup();
    const spy = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useChooseCoach(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('c1');
    });
    expect(chooseCoach).toHaveBeenCalledWith('c1');
    const keys = spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey[0]);
    expect(keys.sort()).toEqual(
      ['coaching', 'subscription', 'liveClasses', 'notes', 'community', 'workout', 'effort'].sort(),
    );
  });

  it('does not invalidate on failure', async () => {
    (chooseCoach as jest.Mock).mockRejectedValue({ code: 'not_a_member' });
    const { client, wrapper } = setup();
    const spy = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useChooseCoach(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('c1').catch(() => undefined);
    });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('useSaveMyCoachProfile', () => {
  it('invalidates coaching on success', async () => {
    (saveMyCoachProfile as jest.Mock).mockResolvedValue({});
    const { client, wrapper } = setup();
    const spy = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useSaveMyCoachProfile(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ bio: '', specialties: [], acceptingMembers: true });
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['coaching'] });
  });
});
