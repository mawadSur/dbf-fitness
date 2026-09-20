import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';

import CommunityScreen from '../../../app/(tabs)/community/index';
import { fetchGroups, fetchRoster, getMemberId } from '../../features/community/api';

jest.mock('expo-router', () => {
  const { Children, isValidElement, cloneElement } = jest.requireActual('react');
  return {
    // `asChild` renders the single child directly; the href is irrelevant to these assertions.
    Link: ({ children }: { children: ReactNode }) =>
      isValidElement(Children.only(children)) ? cloneElement(Children.only(children)) : children,
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('../../features/community/api', () => ({
  getMemberId: jest.fn(),
  fetchGroups: jest.fn(),
  fetchRoster: jest.fn(),
  joinGroup: jest.fn().mockResolvedValue(undefined),
  leaveGroup: jest.fn().mockResolvedValue(undefined),
  blockUser: jest.fn().mockResolvedValue(undefined),
  reportUser: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../features/community/useGroupPresence', () => ({
  useGroupPresence: () => new Set<string>(),
}));

const GROUPS = {
  groups: [{ id: 'g-1', name: 'Morning Crew', description: 'Early birds' }],
  memberGroupIds: ['g-1'],
};

async function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const TWO_GROUPS = {
  groups: [
    { id: 'g-1', name: 'Morning Crew', description: 'Early birds' },
    { id: 'g-2', name: 'Night Owls', description: null },
  ],
  memberGroupIds: ['g-1'],
};

beforeEach(() => {
  jest.clearAllMocks();
  (getMemberId as jest.Mock).mockResolvedValue('u-jordan');
  (fetchGroups as jest.Mock).mockResolvedValue(GROUPS);
  (fetchRoster as jest.Mock).mockResolvedValue([]);
});

describe('community screen', () => {
  it('renders the roster once both the current user and the groups have loaded', async () => {
    await renderWithQuery(<CommunityScreen />);

    expect(await screen.findByText('People you train with')).toBeTruthy();
    expect(screen.getAllByText('Morning Crew').length).toBeGreaterThan(0);
  });

  // Before the fix a failed current-user lookup left userId null, so presence never subscribed and
  // the whole roster silently rendered as Offline — indistinguishable from nobody being online.
  it('surfaces a failed current-user lookup instead of showing everyone as Offline', async () => {
    (getMemberId as jest.Mock).mockRejectedValue(new Error('session lookup failed'));

    await renderWithQuery(<CommunityScreen />);

    expect(await screen.findByText('session lookup failed')).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();
    expect(screen.queryByText('People you train with')).toBeNull();
  });

  it('retries both the current-user and groups lookups from the error state', async () => {
    (getMemberId as jest.Mock).mockRejectedValueOnce(new Error('session lookup failed'));
    await renderWithQuery(<CommunityScreen />);
    await screen.findByText('Try again');

    (getMemberId as jest.Mock).mockResolvedValue('u-jordan');
    await fireEvent.press(screen.getByText('Try again'));

    expect(await screen.findByText('People you train with')).toBeTruthy();
    expect(getMemberId).toHaveBeenCalledTimes(2);
    expect(fetchGroups).toHaveBeenCalledTimes(2);
  });

  it('still reports a groups failure with a retry', async () => {
    (fetchGroups as jest.Mock).mockRejectedValue(new Error('network down'));

    await renderWithQuery(<CommunityScreen />);

    expect(await screen.findByText('network down')).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();
  });

  it('uses the safe-area top inset (not a hard-coded 64pt) and keeps taps working with the keyboard open', async () => {
    await renderWithQuery(<CommunityScreen />);
    await screen.findByText('People you train with');
    const list = screen.getByTestId('community-list');
    expect(list.props.contentContainerStyle).toMatchObject({ paddingTop: 47 + 16 });
    expect(list.props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('renders as a virtualised list with the member\'s groups and a Discover section', async () => {
    (fetchGroups as jest.Mock).mockResolvedValue(TWO_GROUPS);
    await renderWithQuery(<CommunityScreen />);
    expect(await screen.findByText('Discover')).toBeTruthy();
    expect(screen.getByLabelText('Leave Morning Crew')).toBeTruthy();
    expect(screen.getByLabelText('Join Night Owls')).toBeTruthy();
  });

  it('pull-to-refresh refetches the community data (me, groups and rosters)', async () => {
    await renderWithQuery(<CommunityScreen />);
    await screen.findByText('People you train with');
    expect(fetchGroups).toHaveBeenCalledTimes(1);
    expect(fetchRoster).toHaveBeenCalledTimes(1);

    const refresh = screen.getByTestId('community-list').props.refreshControl;
    await act(async () => {
      await refresh.props.onRefresh();
    });

    await waitFor(() => expect(fetchGroups).toHaveBeenCalledTimes(2));
    expect(getMemberId).toHaveBeenCalledTimes(2);
    expect(fetchRoster).toHaveBeenCalledTimes(2);
  });

  it('shows a dismissable notice after joining a group, with a 44pt-tall dismiss target', async () => {
    (fetchGroups as jest.Mock).mockResolvedValue(TWO_GROUPS);
    await renderWithQuery(<CommunityScreen />);
    await fireEvent.press(await screen.findByLabelText('Join Night Owls'));
    expect(await screen.findByText('Joined Night Owls.')).toBeTruthy();
    const dismiss = screen.getByLabelText('Dismiss message');
    expect(dismiss.props.className).toContain('min-h-[44px]');
    await fireEvent.press(dismiss);
    expect(screen.queryByText('Joined Night Owls.')).toBeNull();
  });

  it('truncates long group names instead of pushing the button off screen', async () => {
    (fetchGroups as jest.Mock).mockResolvedValue({
      groups: [{ id: 'g-9', name: 'A very long group name '.repeat(6), description: null }],
      memberGroupIds: [],
    });
    await renderWithQuery(<CommunityScreen />);
    const name = await screen.findByText(/A very long group name/);
    expect(name.props.numberOfLines).toBe(2);
    expect(screen.getByLabelText(/^Join A very long/).props.className).toContain('shrink-0');
  });
});
