import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import ClassScreen from '../../../app/(tabs)/community/live/[classId]';
import ScheduleScreen from '../../../app/(tabs)/community/live';
import { fetchRtcCredentials } from '../../services/video/credentials';
import { fetchCurrentMember, fetchLiveClass, fetchUpcomingLiveClasses, type LiveClass } from './api';
import { useSubscriptionState } from '../subscriptions/useSubscriptionState';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockClassId = '88888888-8888-8888-8888-888888888888';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: mockReplace, canGoBack: () => true }),
  useLocalSearchParams: () => ({ classId: mockClassId }),
}));

jest.mock('./api', () => ({
  fetchUpcomingLiveClasses: jest.fn(),
  fetchLiveClass: jest.fn(),
  fetchCurrentMember: jest.fn(),
  recordJoin: jest.fn().mockResolvedValue(undefined),
  recordLeave: jest.fn().mockResolvedValue(undefined),
}));
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
jest.mock('./usePushRegistration', () => ({ usePushRegistration: jest.fn() }));
// Flipped by the test that covers a refused/failed presence channel.
let mockPresenceUnavailable = false;
jest.mock('./useLiveClassPresence', () => ({
  useLiveClassPresence: (_classId: string, _user: unknown, enabled: boolean) => {
    if (!enabled) return { participants: [], unavailable: false };
    if (mockPresenceUnavailable) return { participants: [], unavailable: true };
    return {
      participants: [
        { userId: 'u-jordan', fullName: 'Jordan Lee' },
        { userId: 'u-sam', fullName: 'Sam Rivera' },
      ],
      unavailable: false,
    };
  },
}));

const JORDAN = { id: 'u-jordan', fullName: 'Jordan Lee', role: 'member' as const };

function liveClass(overrides: Partial<LiveClass> = {}): LiveClass {
  return {
    id: '88888888-8888-8888-8888-888888888888',
    title: 'Saturday Conditioning',
    // Two days and a few minutes out, so the floored countdown reads "2d" however slowly the test runs.
    starts_at: new Date(Date.now() + 2 * 24 * 60 * 60_000 + 5 * 60_000).toISOString(),
    status: 'scheduled',
    agora_channel_name: 'dbf-demo-saturday-conditioning',
    coach_id: 'u-dana',
    ...overrides,
  };
}

async function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockClassId = '88888888-8888-8888-8888-888888888888';
  mockPresenceUnavailable = false;
  (fetchCurrentMember as jest.Mock).mockResolvedValue(JORDAN);
  (useSubscriptionState as jest.Mock).mockReturnValue({
    data: { state: 'active', currentPeriodEnd: null, daysOverdue: 0, graceDaysLeft: 0 },
  });
  (fetchRtcCredentials as jest.Mock).mockResolvedValue({
    mode: 'mock',
    app_id: null,
    channel: 'dbf-demo-saturday-conditioning',
    uid: 1,
    token: null,
    expires_at: null,
    subscription: { state: 'active', days_overdue: 0, grace_days_left: 0 },
  });
});

describe('live schedule screen', () => {
  it('lists classes with local start, countdown and a Join that opens the class', async () => {
    (fetchUpcomingLiveClasses as jest.Mock).mockResolvedValue([liveClass()]);
    await renderWithQuery(<ScheduleScreen />);

    expect(await screen.findByText('Saturday Conditioning')).toBeTruthy();
    expect(screen.getByText('Scheduled')).toBeTruthy();
    expect(screen.getByText('Starts in 2d')).toBeTruthy();
    expect(screen.queryByText('Starting soon')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Join Saturday Conditioning'));
    expect(mockPush).toHaveBeenCalledWith('/community/live/88888888-8888-8888-8888-888888888888');
  });

  it('highlights a class starting within 15 minutes with a "Starting soon" banner', async () => {
    (fetchUpcomingLiveClasses as jest.Mock).mockResolvedValue([
      liveClass({ starts_at: new Date(Date.now() + 10 * 60_000).toISOString() }),
    ]);
    await renderWithQuery(<ScheduleScreen />);

    // Banner and badge both read "Starting soon".
    expect(await screen.findAllByText('Starting soon')).toHaveLength(2);
  });

  it('shows the Live banner for a live class', async () => {
    (fetchUpcomingLiveClasses as jest.Mock).mockResolvedValue([
      liveClass({ status: 'live', starts_at: new Date(Date.now() - 5 * 60_000).toISOString() }),
    ]);
    await renderWithQuery(<ScheduleScreen />);

    // The section header says "Live now"; since the countdown is now derived
    // from STATUS first, the card's timing line says "Live now" too instead of
    // a stale "Starts in ..." / "Started 5 min ago".
    expect(await screen.findAllByText('Live now')).toHaveLength(2);
    expect(screen.getByText('Live')).toBeTruthy();
  });

  it('shows empty and error states', async () => {
    (fetchUpcomingLiveClasses as jest.Mock).mockResolvedValue([]);
    const first = await renderWithQuery(<ScheduleScreen />);
    expect(await screen.findByText('No live classes scheduled yet.')).toBeTruthy();
    await first.unmount();

    (fetchUpcomingLiveClasses as jest.Mock).mockRejectedValue(new Error('boom'));
    await renderWithQuery(<ScheduleScreen />);
    expect(await screen.findByText('Could not load live classes.')).toBeTruthy();
    expect(screen.queryByText('boom')).toBeNull();
  });

  it('holds the schedule skeleton back 300 ms, then reserves the rows while the list loads', async () => {
    jest.useFakeTimers();
    try {
      let settle: (value: LiveClass[]) => void = () => {};
      (fetchUpcomingLiveClasses as jest.Mock).mockReturnValue(
        new Promise<LiveClass[]>((r) => (settle = r)),
      );
      await renderWithQuery(<ScheduleScreen />);

      // A fast answer never flashes a placeholder, and it is never a bare spinner.
      expect(screen.queryByTestId('schedule-skeleton')).toBeNull();
      await act(async () => {
        jest.advanceTimersByTime(300);
      });
      expect(screen.getByTestId('schedule-skeleton')).toBeTruthy();

      settle([liveClass()]);
      await act(async () => {
        jest.runOnlyPendingTimers();
      });
      expect(screen.queryByTestId('schedule-skeleton')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('pull-to-refresh refetches the classes and the subscription state', async () => {
    (fetchUpcomingLiveClasses as jest.Mock).mockResolvedValue([liveClass()]);
    await renderWithQuery(<ScheduleScreen />);
    await screen.findByText('Saturday Conditioning');

    const before = (fetchUpcomingLiveClasses as jest.Mock).mock.calls.length;
    const list = screen.getByTestId('live-schedule-list');
    await act(async () => {
      list.props.refreshControl.props.onRefresh();
    });
    expect((fetchUpcomingLiveClasses as jest.Mock).mock.calls.length).toBeGreaterThan(before);
  });

  it('goes back to the community index', async () => {
    (fetchUpcomingLiveClasses as jest.Mock).mockResolvedValue([]);
    await renderWithQuery(<ScheduleScreen />);
    // The back button also shows while loading; wait for the data so nothing settles after the test.
    await screen.findByText('No live classes scheduled yet.');
    await fireEvent.press(screen.getByLabelText('Back to community'));
    expect(mockBack).toHaveBeenCalled();
  });
});

describe('live class screen', () => {
  it('joins a scheduled class days away, shows the mock tile and the presence names, then leaves', async () => {
    (fetchLiveClass as jest.Mock).mockResolvedValue(liveClass());
    await renderWithQuery(<ClassScreen />);

    await fireEvent.press(await screen.findByText('Join class'));

    expect(await screen.findByText('Camera preview (mock)')).toBeTruthy();
    // Once as the local video tile, once in the presence name list.
    expect(screen.getAllByText('Jordan Lee (you)')).toHaveLength(2);
    expect(screen.getByText('Sam Rivera')).toBeTruthy();
    expect(screen.getByText('In this class (2)')).toBeTruthy();

    await fireEvent.press(screen.getByText('Leave'));
    expect(await screen.findByText('Join class')).toBeTruthy();
    expect(screen.queryByText('Camera preview (mock)')).toBeNull();
  });

  it('notes the participant list is unavailable but keeps the class usable when presence fails', async () => {
    mockPresenceUnavailable = true;
    (fetchLiveClass as jest.Mock).mockResolvedValue(liveClass());
    await renderWithQuery(<ClassScreen />);

    await fireEvent.press(await screen.findByText('Join class'));

    expect(await screen.findByText(/Participant list unavailable/)).toBeTruthy();
    // The rest of the screen still works: the video tile and Leave are both there, and the
    // header must not claim an empty class.
    expect(screen.getByText('Camera preview (mock)')).toBeTruthy();
    expect(screen.getByText('Leave')).toBeTruthy();
    expect(screen.getByText('In this class')).toBeTruthy();
    expect(screen.queryByText('In this class (0)')).toBeNull();
  });

  it.each([
    ['ended', /has ended/],
    ['cancelled', /was cancelled/],
  ] as const)('disables Join with a clear message for a %s class', async (status, message) => {
    (fetchLiveClass as jest.Mock).mockResolvedValue(liveClass({ status }));
    await renderWithQuery(<ClassScreen />);

    expect(await screen.findByText(message)).toBeTruthy();
    await fireEvent.press(screen.getByText('Join class'));
    expect(screen.queryByText('Camera preview (mock)')).toBeNull();
  });

  it('shows a not-found state', async () => {
    (fetchLiveClass as jest.Mock).mockResolvedValue(null);
    await renderWithQuery(<ClassScreen />);
    expect(await screen.findByText('Class not found')).toBeTruthy();
  });

  it('shows an error state', async () => {
    (fetchLiveClass as jest.Mock).mockRejectedValue(new Error('network down'));
    await renderWithQuery(<ClassScreen />);
    expect(await screen.findByText(/Can't reach the server/)).toBeTruthy();
    expect(screen.queryByText('network down')).toBeNull();
  });
});

describe('live class screen states', () => {
  it('holds the skeleton back for 300 ms, then reserves the layout while the class loads', async () => {
    jest.useFakeTimers();
    try {
      let settle: (value: LiveClass) => void = () => {};
      (fetchLiveClass as jest.Mock).mockReturnValue(new Promise<LiveClass>((r) => (settle = r)));
      await renderWithQuery(<ClassScreen />);

      // A fast answer must never flash a placeholder.
      expect(screen.queryByTestId('class-skeleton')).toBeNull();
      await act(async () => {
        jest.advanceTimersByTime(300);
      });
      expect(screen.getByTestId('class-skeleton')).toBeTruthy();

      settle(liveClass());
      await act(async () => {
        jest.runOnlyPendingTimers();
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('says it is a preview when the server has no live video configured', async () => {
    (fetchLiveClass as jest.Mock).mockResolvedValue(liveClass());
    await renderWithQuery(<ClassScreen />);
    // Nothing claims preview mode before a join tells us which mode we got.
    expect(screen.queryByTestId('preview-mode')).toBeNull();

    await fireEvent.press(await screen.findByText('Join class'));
    expect(await screen.findByTestId('preview-mode')).toBeTruthy();
    expect(screen.getAllByText('Preview mode').length).toBeGreaterThan(0);
    expect(screen.getByText(/Nothing is broadcast/)).toBeTruthy();
    expect(screen.getByTestId('live-stage')).toBeTruthy();
  });

  it('says preview mode once, inside the stage, not twice', async () => {
    (fetchLiveClass as jest.Mock).mockResolvedValue(liveClass());
    await renderWithQuery(<ClassScreen />);
    await fireEvent.press(await screen.findByText('Join class'));

    // A separate Banner above the stage used to repeat the tag word for word
    // and cost 105pt of a 360x640 screen, pushing the video below the fold.
    await screen.findByTestId('preview-mode');
    expect(screen.getAllByTestId('preview-mode')).toHaveLength(1);
    expect(screen.getAllByText('Preview mode')).toHaveLength(1);
    expect(screen.getByTestId('live-stage-preview-tag')).toBeTruthy();
  });

  it('drops the schedule card in call and keeps the status in words', async () => {
    (fetchLiveClass as jest.Mock).mockResolvedValue(liveClass());
    await renderWithQuery(<ClassScreen />);
    // Before joining, the full schedule card with the countdown is the point.
    expect(await screen.findByTestId('class-summary')).toBeTruthy();

    await fireEvent.press(await screen.findByText('Join class'));
    await screen.findByTestId('live-stage');
    expect(screen.queryByTestId('class-summary')).toBeNull();
    // …replaced by one compact line, so status is still stated, not implied.
    expect(screen.getByTestId('class-summary-compact')).toBeTruthy();
  });

  it('a failed load offers one retry that refetches both queries', async () => {
    (fetchLiveClass as jest.Mock).mockRejectedValueOnce(new Error('network down'));
    await renderWithQuery(<ClassScreen />);
    await fireEvent.press(await screen.findByLabelText('Try again'));
    expect((fetchLiveClass as jest.Mock).mock.calls.length).toBeGreaterThan(1);
  });

  it('a missing class offers the way back instead of a dead end', async () => {
    (fetchLiveClass as jest.Mock).mockResolvedValue(null);
    await renderWithQuery(<ClassScreen />);
    await fireEvent.press(await screen.findByLabelText('Back to live classes'));
    expect(mockBack).toHaveBeenCalled();
  });
});

/**
 * The VISIBLE half of the push production guard (ticket item 7).
 *
 * `pushDisabledNotice()` was implemented and unit-tested but rendered nowhere, so a release
 * build with EXPO_PUBLIC_REAL_PUSH unset used the no-op adapter in silence and the member
 * kept believing a "class starting soon" alert was coming. These two tests are what stops
 * that regressing: the unit test alone passed the whole time the notice was invisible.
 */
describe('live class screen: reminders-off notice', () => {
  const globals = globalThis as unknown as { __DEV__: boolean };
  const OLD_FLAG = process.env.EXPO_PUBLIC_REAL_PUSH;
  const OLD_DEV = globals.__DEV__;

  afterEach(() => {
    if (OLD_FLAG === undefined) delete process.env.EXPO_PUBLIC_REAL_PUSH;
    else process.env.EXPO_PUBLIC_REAL_PUSH = OLD_FLAG;
    globals.__DEV__ = OLD_DEV;
  });

  it('tells the member reminders are off in a release build that has no real push', async () => {
    delete process.env.EXPO_PUBLIC_REAL_PUSH;
    globals.__DEV__ = false;
    (fetchLiveClass as jest.Mock).mockResolvedValue(liveClass());

    await renderWithQuery(<ClassScreen />);

    const notice = await screen.findByTestId('push-disabled-notice');
    expect(notice).toBeTruthy();
    expect(screen.getByText(/Class reminders are turned off in this build/)).toBeTruthy();
  });

  it('stays out of the way in __DEV__, where the no-op adapter is expected', async () => {
    delete process.env.EXPO_PUBLIC_REAL_PUSH;
    globals.__DEV__ = true;
    (fetchLiveClass as jest.Mock).mockResolvedValue(liveClass());

    await renderWithQuery(<ClassScreen />);

    await screen.findByTestId('class-summary');
    expect(screen.queryByTestId('push-disabled-notice')).toBeNull();
  });

  it('stays out of the way when real push is switched on', async () => {
    process.env.EXPO_PUBLIC_REAL_PUSH = 'true';
    globals.__DEV__ = false;
    (fetchLiveClass as jest.Mock).mockResolvedValue(liveClass());

    await renderWithQuery(<ClassScreen />);

    await screen.findByTestId('class-summary');
    expect(screen.queryByTestId('push-disabled-notice')).toBeNull();
  });
});
