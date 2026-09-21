import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';

import CommunityScreen from '../../../app/(tabs)/community/index';
import { fetchGroups, fetchRoster, getMemberId, joinGroup, leaveGroup } from '../../features/community/api';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
}));

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

    expect(await screen.findByText('Could not load your community.')).toBeTruthy();
    expect(screen.queryByText('session lookup failed')).toBeNull();
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

    expect(await screen.findByText(/Can't reach the server/)).toBeTruthy();
    expect(screen.queryByText('network down')).toBeNull();
    expect(screen.getByText('Try again')).toBeTruthy();
  });

  it('lets ScreenShell pay the safe-area top inset once, and keeps taps working with the keyboard open', async () => {
    await renderWithQuery(<CommunityScreen />);
    await screen.findByText('People you train with');
    // The shell owns the notch padding; the list must not add it a second time.
    expect(StyleSheet.flatten(screen.getByTestId('community').props.style)).toMatchObject({
      paddingTop: 47,
    });
    const list = screen.getByTestId('community-list');
    expect(list.props.contentContainerStyle).not.toMatchObject({ paddingTop: 47 + 16 });
    expect(list.props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('opens the live classes screen from the header card', async () => {
    await renderWithQuery(<CommunityScreen />);
    await fireEvent.press(await screen.findByLabelText('Live classes'));
    expect(mockPush).toHaveBeenCalledWith('/community/live');
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

  it('shows a dismissable notice after joining a group, with a 44pt dismiss target', async () => {
    (fetchGroups as jest.Mock).mockResolvedValue(TWO_GROUPS);
    await renderWithQuery(<CommunityScreen />);
    await fireEvent.press(await screen.findByLabelText('Join Night Owls'));
    expect(await screen.findByText('Joined Night Owls.')).toBeTruthy();
    const dismiss = screen.getByLabelText('Dismiss message');
    const box = StyleSheet.flatten(dismiss.props.style) as { width: number; height: number };
    // 24pt box + 10pt of hitSlop on every side clears the 44pt minimum.
    expect(box.height + 2 * (dismiss.props.hitSlop as number)).toBeGreaterThanOrEqual(44);
    expect(box.width + 2 * (dismiss.props.hitSlop as number)).toBeGreaterThanOrEqual(44);
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
    expect(StyleSheet.flatten(screen.getByTestId('group-action-g-9').props.style)).toMatchObject({
      flexShrink: 0,
    });
  });

  it('offers a next action from each empty state', async () => {
    (fetchGroups as jest.Mock).mockResolvedValue({ groups: [], memberGroupIds: [] });
    await renderWithQuery(<CommunityScreen />);
    expect(await screen.findByTestId('community-empty-people')).toBeTruthy();
    expect(screen.getByTestId('community-empty-groups')).toBeTruthy();
    expect(screen.getByLabelText('See groups')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Check again'));
    await waitFor(() => expect(fetchGroups).toHaveBeenCalledTimes(2));
  });

  it('a join in flight is busy and unpressable, then confirms', async () => {
    (fetchGroups as jest.Mock).mockResolvedValue(TWO_GROUPS);
    let settle: () => void = () => undefined;
    (joinGroup as jest.Mock).mockReturnValue(
      new Promise<void>((resolve) => {
        settle = resolve;
      })
    );
    await renderWithQuery(<CommunityScreen />);

    const join = await screen.findByLabelText('Join Night Owls');
    await fireEvent.press(join);

    // Disabled AND announced busy: the pending state is never colour alone.
    await waitFor(() =>
      expect(screen.getByLabelText('Join Night Owls').props.accessibilityState).toMatchObject({
        disabled: true,
        busy: true,
      })
    );
    expect(screen.getByTestId('button-spinner')).toBeTruthy();
    expect((joinGroup as jest.Mock).mock.calls).toHaveLength(1);

    // A second press while it is in flight must not fire a second join.
    await fireEvent.press(screen.getByLabelText('Join Night Owls'));
    expect((joinGroup as jest.Mock).mock.calls).toHaveLength(1);

    await act(async () => {
      settle();
    });
    expect(await screen.findByText('Joined Night Owls.')).toBeTruthy();
  });

  it('a failed leave says so inline and leaves the group joined', async () => {
    // An unclassifiable failure falls back to the screen's own sentence.
    (leaveGroup as jest.Mock).mockRejectedValue(new Error('boom'));
    await renderWithQuery(<CommunityScreen />);

    await fireEvent.press(await screen.findByLabelText('Leave Morning Crew'));
    expect(await screen.findByText('Could not leave Morning Crew.')).toBeTruthy();
    expect(screen.getByLabelText('Leave Morning Crew')).toBeTruthy();
  });

  it('shows a skeleton — never a bare spinner — while the first load is slow', async () => {
    let resolveGroups: (value: typeof GROUPS) => void = () => undefined;
    (fetchGroups as jest.Mock).mockReturnValue(
      new Promise<typeof GROUPS>((resolve) => {
        resolveGroups = resolve;
      })
    );
    await renderWithQuery(<CommunityScreen />);
    expect(await screen.findByTestId('community-skeleton')).toBeTruthy();
    expect(screen.queryByTestId('activity-indicator')).toBeNull();
    await act(async () => {
      resolveGroups(GROUPS);
    });
    await screen.findByText('People you train with');
  });
});
