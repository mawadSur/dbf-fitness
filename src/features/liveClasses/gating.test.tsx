import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking, StyleSheet } from 'react-native';
import * as SafeArea from 'react-native-safe-area-context';
import type { ReactElement } from 'react';

import ClassScreen from '../../../app/(tabs)/community/live/[classId]';
import ScheduleScreen from '../../../app/(tabs)/community/live';
import NewClassScreen from '../../../app/(tabs)/community/live/new';
import { FORM_BOTTOM_PADDING } from '../../components/live/ScheduleClassForm';
import { fetchRtcCredentials, RtcCredentialsError } from '../../services/video/credentials';
import { useSubscriptionState } from '../subscriptions/useSubscriptionState';
import {
  createLiveClass,
  fetchClassAttendees,
  fetchCurrentMember,
  fetchLiveClass,
  fetchUpcomingLiveClasses,
  updateLiveClassStatus,
  type LiveClass,
} from './api';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const CLASS_ID = '88888888-8888-8888-8888-888888888888';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: mockReplace, canGoBack: () => true }),
  useLocalSearchParams: () => ({ classId: '88888888-8888-8888-8888-888888888888' }),
}));
// Capture the props the form hands to KeyboardAvoidingView (the host node does not expose `behavior`).
const kavProps: { behavior?: string }[] = [];
jest.mock('react-native/Libraries/Components/Keyboard/KeyboardAvoidingView', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: (props: { behavior?: string; children?: unknown }) => {
      kavProps.push({ behavior: props.behavior });
      return <View>{props.children as never}</View>;
    },
  };
});
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../../services/supabase/client', () => ({ supabase: {} }));
jest.mock('../../services/video/credentials', () => ({
  ...jest.requireActual('../../services/video/credentials'),
  fetchRtcCredentials: jest.fn(),
}));
jest.mock('../subscriptions/useSubscriptionState', () => ({
  SUBSCRIPTION_STATE_QUERY_KEY: ['subscription', 'state'],
  useSubscriptionState: jest.fn(),
}));
jest.mock('./api', () => ({
  fetchUpcomingLiveClasses: jest.fn(),
  fetchLiveClass: jest.fn(),
  fetchCurrentMember: jest.fn(),
  fetchClassAttendees: jest.fn(),
  createLiveClass: jest.fn(),
  updateLiveClassStatus: jest.fn(),
  recordJoin: jest.fn().mockResolvedValue(undefined),
  recordLeave: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./usePushRegistration', () => ({ usePushRegistration: jest.fn() }));
jest.mock('./useLiveClassPresence', () => ({
  useLiveClassPresence: () => ({ participants: [], unavailable: false }),
}));

const sub = (state: string, daysOverdue = 0, graceDaysLeft = 0) => ({
  data: { state, currentPeriodEnd: null, daysOverdue, graceDaysLeft },
});
const JORDAN = { id: 'u-jordan', fullName: 'Jordan Lee', role: 'member' as const };
const DANA = { id: 'u-dana', fullName: 'Dana Coach', role: 'coach' as const };

const cls = (over: Partial<LiveClass> = {}): LiveClass => ({
  id: CLASS_ID,
  title: 'Saturday Conditioning',
  starts_at: new Date(Date.now() + 2 * 24 * 60 * 60_000 + 5 * 60_000).toISOString(),
  status: 'scheduled',
  agora_channel_name: 'dbf-demo',
  coach_id: 'u-dana',
  ...over,
});

const creds = (state: 'active' | 'grace' | 'staff' = 'active', overdue = 0, left = 0) => ({
  mode: 'mock',
  app_id: null,
  channel: 'dbf-demo',
  uid: 1,
  token: null,
  expires_at: null,
  subscription: { state, days_overdue: overdue, grace_days_left: left },
});

async function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const originalBilling = process.env.EXPO_PUBLIC_BILLING_URL;

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.EXPO_PUBLIC_BILLING_URL;
  (fetchCurrentMember as jest.Mock).mockResolvedValue(JORDAN);
  (fetchLiveClass as jest.Mock).mockResolvedValue(cls());
  (fetchUpcomingLiveClasses as jest.Mock).mockResolvedValue([cls()]);
  (fetchClassAttendees as jest.Mock).mockResolvedValue([]);
  (useSubscriptionState as jest.Mock).mockReturnValue(sub('active'));
  (fetchRtcCredentials as jest.Mock).mockResolvedValue(creds());
});

afterAll(() => {
  if (originalBilling === undefined) delete process.env.EXPO_PUBLIC_BILLING_URL;
  else process.env.EXPO_PUBLIC_BILLING_URL = originalBilling;
});

describe('schedule screen gating', () => {
  it.each([
    ['expired', /lapsed/],
    ['none', /Live classes are for subscribed members/],
  ])('%s: disables Join and explains why', async (state, text) => {
    (useSubscriptionState as jest.Mock).mockReturnValue(sub(state));
    await renderWithQuery(<ScheduleScreen />);
    const join = await screen.findByLabelText('Saturday Conditioning: subscription required');
    expect(screen.getByText(text)).toBeTruthy();
    expect(join.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText('Saturday Conditioning: subscription required'));
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByText('Contact your coach to renew.')).toBeTruthy();
  });

  it.each(['active', 'grace', 'staff'])('%s: Join opens the class', async (state) => {
    (useSubscriptionState as jest.Mock).mockReturnValue(sub(state, 3, 7));
    await renderWithQuery(<ScheduleScreen />);
    await fireEvent.press(await screen.findByLabelText('Join Saturday Conditioning'));
    expect(mockPush).toHaveBeenCalledWith(`/community/live/${CLASS_ID}`);
  });

  it('renew CTA opens the billing URL when configured', async () => {
    process.env.EXPO_PUBLIC_BILLING_URL = 'https://pay.example.com/renew';
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    (useSubscriptionState as jest.Mock).mockReturnValue(sub('expired'));
    await renderWithQuery(<ScheduleScreen />);
    await screen.findByLabelText('Saturday Conditioning: subscription required');
    await fireEvent.press(await screen.findByText('Renew subscription'));
    expect(open).toHaveBeenCalledWith('https://pay.example.com/renew');
    expect(screen.queryByText('Contact your coach to renew.')).toBeNull();
    open.mockRestore();
  });

  it('shows Schedule class only to coaches', async () => {
    await renderWithQuery(<ScheduleScreen />);
    await screen.findByText('Saturday Conditioning');
    await waitFor(() => expect(fetchCurrentMember).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByLabelText('Schedule a class')).toBeNull();
  });

  it('a coach can open the schedule form', async () => {
    (fetchCurrentMember as jest.Mock).mockResolvedValue(DANA);
    (useSubscriptionState as jest.Mock).mockReturnValue(sub('staff'));
    await renderWithQuery(<ScheduleScreen />);
    await fireEvent.press(await screen.findByLabelText('Schedule a class'));
    expect(mockPush).toHaveBeenCalledWith('/community/live/new');
  });
});

describe('class screen gating', () => {
  it.each([
    ['expired', /Your subscription has lapsed/],
    ['none', /Live classes are for subscribed members/],
  ])('%s: blocks Join with a Subscription required panel', async (state, text) => {
    (useSubscriptionState as jest.Mock).mockReturnValue(sub(state));
    await renderWithQuery(<ClassScreen />);
    expect(await screen.findByText(text)).toBeTruthy();
    expect(screen.getByText('Subscription required')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Join class'));
    expect(fetchRtcCredentials).not.toHaveBeenCalled();
    expect(screen.getByText('Contact your coach to renew.')).toBeTruthy();
  });

  it('the disabled Join button announces why it is disabled (accessibilityHint), not just its label', async () => {
    (useSubscriptionState as jest.Mock).mockReturnValue(sub('expired'));
    await renderWithQuery(<ClassScreen />);
    const join = await screen.findByLabelText('Join class');
    expect(join.props.accessibilityState.disabled).toBe(true);
    expect(join.props.accessibilityHint).toBe('Your subscription has lapsed. Renew to join live classes.');
  });

  it('an enabled Join button has no hint', async () => {
    await renderWithQuery(<ClassScreen />);
    const join = await screen.findByLabelText('Join class');
    expect(join.props.accessibilityHint).toBeUndefined();
  });

  it('a 403 subscription_required from the server flips an "active" client to blocked', async () => {
    (fetchRtcCredentials as jest.Mock).mockRejectedValue(new RtcCredentialsError('subscription_required'));
    await renderWithQuery(<ClassScreen />);
    await fireEvent.press(await screen.findByLabelText('Join class'));
    expect(await screen.findByText('Subscription required')).toBeTruthy();
    expect(screen.queryByText('Camera preview (mock)')).toBeNull();
  });

  it('not_entitled shows a members-only message', async () => {
    (fetchRtcCredentials as jest.Mock).mockRejectedValue(new RtcCredentialsError('not_entitled'));
    await renderWithQuery(<ClassScreen />);
    await fireEvent.press(await screen.findByLabelText('Join class'));
    expect(await screen.findByText(/only open to members of the coach/)).toBeTruthy();
  });

  it('a 409 flips the UI to the ended state', async () => {
    (fetchRtcCredentials as jest.Mock).mockRejectedValue(new RtcCredentialsError('class_not_joinable'));
    await renderWithQuery(<ClassScreen />);
    await fireEvent.press(await screen.findByLabelText('Join class'));
    expect(await screen.findByText(/no longer/)).toBeTruthy();
  });

  it('a 401 asks the member to sign in again', async () => {
    (fetchRtcCredentials as jest.Mock).mockRejectedValue(new RtcCredentialsError('unauthorized'));
    await renderWithQuery(<ClassScreen />);
    await fireEvent.press(await screen.findByLabelText('Join class'));
    expect(await screen.findByText(/session has expired/)).toBeTruthy();
  });

  it('a network error is retryable', async () => {
    (fetchRtcCredentials as jest.Mock).mockRejectedValueOnce(new RtcCredentialsError('unknown', 'offline'));
    await renderWithQuery(<ClassScreen />);
    await fireEvent.press(await screen.findByLabelText('Join class'));
    expect(await screen.findByText(/Could not reach the server/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Try joining again'));
    expect(await screen.findByText('Camera preview (mock)')).toBeTruthy();
  });
});

describe('grace reminders', () => {
  beforeEach(() => {
    (useSubscriptionState as jest.Mock).mockReturnValue(sub('grace', 3, 7));
    (fetchRtcCredentials as jest.Mock).mockResolvedValue(creds('grace', 3, 7));
  });

  it('shows the notice before joining, then a persistent banner in the call, on every join', async () => {
    await renderWithQuery(<ClassScreen />);
    await fireEvent.press(await screen.findByLabelText('Join class'));

    // Pre-join notice, nothing joined yet.
    expect(await screen.findByText('Payment overdue')).toBeTruthy();
    expect(screen.getByText('3 days overdue')).toBeTruthy();
    expect(screen.getByText('7 days of access left')).toBeTruthy();
    expect(fetchRtcCredentials).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Join anyway'));
    expect(await screen.findByText('Camera preview (mock)')).toBeTruthy();
    expect(screen.getByText('Payment overdue — 7 days of access left')).toBeTruthy();

    // Leaving and joining again shows the notice again.
    await fireEvent.press(screen.getByText('Leave'));
    await fireEvent.press(await screen.findByLabelText('Join class'));
    expect(await screen.findByText('3 days overdue')).toBeTruthy();
    expect(screen.queryByText('Camera preview (mock)')).toBeNull();
  });

  it('offers Renew now in the notice and a Renew action in the banner when billing is configured', async () => {
    process.env.EXPO_PUBLIC_BILLING_URL = 'https://pay.example.com/renew';
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await renderWithQuery(<ClassScreen />);
    await fireEvent.press(await screen.findByLabelText('Join class'));
    await fireEvent.press(await screen.findByText('Renew now'));
    expect(open).toHaveBeenCalledWith('https://pay.example.com/renew');

    await fireEvent.press(screen.getByText('Join anyway'));
    await fireEvent.press(await screen.findByLabelText('Renew subscription'));
    expect(open).toHaveBeenCalledTimes(2);
    open.mockRestore();
  });

  it('pluralizes 1 day', async () => {
    (useSubscriptionState as jest.Mock).mockReturnValue(sub('grace', 9, 1));
    (fetchRtcCredentials as jest.Mock).mockResolvedValue(creds('grace', 9, 1));
    await renderWithQuery(<ClassScreen />);
    await fireEvent.press(await screen.findByLabelText('Join class'));
    expect(await screen.findByText('1 day of access left')).toBeTruthy();
    await fireEvent.press(screen.getByText('Join anyway'));
    expect(await screen.findByText('Payment overdue — 1 day of access left')).toBeTruthy();
  });

  it('active members get no notice and no banner', async () => {
    (useSubscriptionState as jest.Mock).mockReturnValue(sub('active'));
    (fetchRtcCredentials as jest.Mock).mockResolvedValue(creds('active'));
    await renderWithQuery(<ClassScreen />);
    await fireEvent.press(await screen.findByLabelText('Join class'));
    expect(await screen.findByText('Camera preview (mock)')).toBeTruthy();
    expect(screen.queryByText(/Payment overdue/)).toBeNull();
  });

  it('the server reporting grace shows the pre-join notice even if the client thought active, then the banner', async () => {
    (useSubscriptionState as jest.Mock).mockReturnValue(sub('active'));
    (fetchRtcCredentials as jest.Mock).mockResolvedValue(creds('grace', 3, 7));
    await renderWithQuery(<ClassScreen />);
    await fireEvent.press(await screen.findByLabelText('Join class'));
    expect(await screen.findByText('3 days overdue')).toBeTruthy();
    expect(screen.queryByText('Camera preview (mock)')).toBeNull();
    await fireEvent.press(screen.getByText('Join anyway'));
    expect(await screen.findByText('Payment overdue — 7 days of access left')).toBeTruthy();
  });

  it('shows the pre-join notice from the server even when the client subscription query failed (null)', async () => {
    (useSubscriptionState as jest.Mock).mockReturnValue({ data: undefined });
    (fetchRtcCredentials as jest.Mock).mockResolvedValue(creds('grace', 2, 8));
    await renderWithQuery(<ClassScreen />);
    await fireEvent.press(await screen.findByLabelText('Join class'));
    expect(await screen.findByText('2 days overdue')).toBeTruthy();
    expect(screen.getByText('8 days of access left')).toBeTruthy();
    expect(screen.queryByText('Camera preview (mock)')).toBeNull();
  });
});

describe('coach controls', () => {
  beforeEach(() => {
    (fetchCurrentMember as jest.Mock).mockResolvedValue(DANA);
    (useSubscriptionState as jest.Mock).mockReturnValue(sub('staff'));
  });

  it('members never see them', async () => {
    (fetchCurrentMember as jest.Mock).mockResolvedValue(JORDAN);
    (useSubscriptionState as jest.Mock).mockReturnValue(sub('active'));
    await renderWithQuery(<ClassScreen />);
    await screen.findByLabelText('Join class');
    expect(screen.queryByText('Coach controls')).toBeNull();
    expect(screen.queryByText('Start class')).toBeNull();
  });

  it('an owning non-coach member does not see them', async () => {
    (fetchCurrentMember as jest.Mock).mockResolvedValue({ ...JORDAN, id: 'u-dana' });
    (useSubscriptionState as jest.Mock).mockReturnValue(sub('active'));
    await renderWithQuery(<ClassScreen />);
    await screen.findByLabelText('Join class');
    expect(screen.queryByText('Coach controls')).toBeNull();
  });

  it("a coach who doesn't own the class does not see them", async () => {
    (fetchLiveClass as jest.Mock).mockResolvedValue(cls({ coach_id: 'someone-else' }));
    await renderWithQuery(<ClassScreen />);
    await screen.findByLabelText('Join class');
    expect(screen.queryByText('Coach controls')).toBeNull();
  });

  it('starts the class after an inline confirm and lists attendees', async () => {
    (fetchClassAttendees as jest.Mock).mockResolvedValue([
      { memberId: 'u-jordan', fullName: 'Jordan Lee', joinedAt: 'x', leftAt: null },
    ]);
    (updateLiveClassStatus as jest.Mock).mockResolvedValue(undefined);
    await renderWithQuery(<ClassScreen />);
    expect(await screen.findByText('Jordan Lee')).toBeTruthy();
    expect(screen.getByText('Attendees (1)')).toBeTruthy();

    await fireEvent.press(screen.getByText('Start class'));
    expect(updateLiveClassStatus).not.toHaveBeenCalled();
    expect(screen.getByText(/Start this class now/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Yes, start class'));
    await waitFor(() => expect(updateLiveClassStatus).toHaveBeenCalledWith(CLASS_ID, 'live'));
  });

  it('cancel can be backed out of', async () => {
    await renderWithQuery(<ClassScreen />);
    await fireEvent.press(await screen.findByText('Cancel class'));
    await fireEvent.press(screen.getByText('Keep as is'));
    expect(updateLiveClassStatus).not.toHaveBeenCalled();
    expect(screen.getByText('Start class')).toBeTruthy();
  });

  it('a live class offers End; an ended class offers Upload recording', async () => {
    (fetchLiveClass as jest.Mock).mockResolvedValue(cls({ status: 'live' }));
    const first = await renderWithQuery(<ClassScreen />);
    expect(await screen.findByText('End class')).toBeTruthy();
    expect(screen.queryByText('Upload recording')).toBeNull();
    await first.unmount();

    (fetchLiveClass as jest.Mock).mockResolvedValue(cls({ status: 'ended' }));
    await renderWithQuery(<ClassScreen />);
    await fireEvent.press(await screen.findByText('Upload recording'));
    expect(mockPush).toHaveBeenCalledWith(`/notes/upload?classId=${CLASS_ID}`);
  });
});

describe('schedule class form', () => {
  it('shows friendly copy, not raw text, when the profile fails to load', async () => {
    (fetchCurrentMember as jest.Mock).mockRejectedValue(new TypeError('Network request failed'));
    await renderWithQuery(<NewClassScreen />);
    expect(await screen.findByText("Can't reach the server. Check your connection and try again.")).toBeTruthy();
    expect(screen.queryByText(/Network request failed/)).toBeNull();
  });

  it('blocks non-coaches', async () => {
    await renderWithQuery(<NewClassScreen />);
    expect(await screen.findByText('Coaches only')).toBeTruthy();
  });

  it('avoids the keyboard on both platforms and adds no bottom safe-area inset under the tab bar', async () => {
    (fetchCurrentMember as jest.Mock).mockResolvedValue(DANA);
    const insetsMock = jest.mocked(SafeArea.useSafeAreaInsets);
    insetsMock.mockReturnValue({ top: 47, bottom: 34, left: 0, right: 0 });
    try {
      await renderWithQuery(<NewClassScreen />);
      await screen.findByLabelText('Class title');
      expect(kavProps.length).toBeGreaterThan(0);
      expect(kavProps[kavProps.length - 1].behavior).toBe('padding');
      const scroll = screen.getByTestId('schedule-form-scroll');
      expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
      // With a 34pt home-indicator inset the bottom padding must stay 24 (no double inset).
      const content = StyleSheet.flatten(scroll.props.contentContainerStyle);
      expect(content.paddingBottom).toBe(24);
      // ScreenShell pays the status-bar inset once, on the shell itself.
      const shell = StyleSheet.flatten(screen.getByTestId('schedule-form').props.style);
      expect(shell.paddingTop).toBe(47);
    } finally {
      // The jest mock's own default is zero insets; restore it explicitly (mockRestore would blank it).
      insetsMock.mockReturnValue({ top: 0, bottom: 0, left: 0, right: 0 });
    }
    expect(FORM_BOTTOM_PADDING).toBe(24);
  });

  it('validates inline, then creates a scheduled class from a quick pick', async () => {
    (fetchCurrentMember as jest.Mock).mockResolvedValue(DANA);
    (createLiveClass as jest.Mock).mockResolvedValue(cls({ id: 'new-id' }));
    await renderWithQuery(<NewClassScreen />);

    await fireEvent.press(await screen.findByLabelText('Schedule class'));
    expect(await screen.findByText('Enter a class title.')).toBeTruthy();
    // Plain words, matching the field hint — no format jargon in member-facing copy.
    expect(screen.getByText('Use year-month-day, like 2026-10-03.')).toBeTruthy();
    expect(createLiveClass).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Class title'), 'Sunrise Mobility');
    await fireEvent.press(screen.getByText('Tomorrow 7am'));
    await fireEvent.press(screen.getByLabelText('Schedule class'));

    await waitFor(() => expect(createLiveClass).toHaveBeenCalledTimes(1));
    const arg = (createLiveClass as jest.Mock).mock.calls[0][0];
    expect(arg.coachId).toBe('u-dana');
    expect(arg.title).toBe('Sunrise Mobility');
    expect(arg.startsAt.getHours()).toBe(7);
    expect(arg.startsAt.getTime()).toBeGreaterThan(Date.now());
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/community/live/new-id'));
  });

  it('rejects a past time', async () => {
    (fetchCurrentMember as jest.Mock).mockResolvedValue(DANA);
    await renderWithQuery(<NewClassScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Class title'), 'Old');
    await fireEvent.changeText(screen.getByLabelText('Date'), '2020-01-01');
    await fireEvent.changeText(screen.getByLabelText('Start time'), '10:00');
    await fireEvent.press(screen.getByLabelText('Schedule class'));
    expect(await screen.findByText('Pick a time in the future.')).toBeTruthy();
    expect(createLiveClass).not.toHaveBeenCalled();
  });
});
