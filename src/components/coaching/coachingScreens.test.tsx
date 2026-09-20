import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Linking } from 'react-native';

import CoachProfileScreen from '../../../app/coach/profile';
import PickCoachScreen from '../../../app/coach/pick';
import ProfileScreen from '../../../app/(tabs)/profile';
import { ChooseCoachError } from '../../features/coaching/api';
import * as coachingApi from '../../features/coaching/api';
import * as subApi from '../../features/subscriptions/api';
import { supabase } from '../../services/supabase/client';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../services/supabase/client', () => ({
  supabase: { auth: { signOut: jest.fn(), getSession: jest.fn() }, rpc: jest.fn(), from: jest.fn() },
}));
jest.mock('../../features/coaching/api', () => ({
  ...jest.requireActual('../../features/coaching/api'),
  fetchCoaches: jest.fn(),
  fetchMyCoach: jest.fn(),
  chooseCoach: jest.fn(),
  fetchMyCoachProfile: jest.fn(),
  saveMyCoachProfile: jest.fn(),
}));
jest.mock('../../features/subscriptions/api', () => ({ fetchSubscriptionState: jest.fn() }));

const api = coachingApi as jest.Mocked<typeof coachingApi>;
const subs = subApi as jest.Mocked<typeof subApi>;

type TestAccount = { id: string; email: string; fullName: string; role: 'member' | 'coach' };
function setAccount(a: TestAccount) {
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: { user: { id: a.id, email: a.email } } } });
  (supabase.from as jest.Mock).mockReturnValue({
    select: () => ({
      eq: () => ({ maybeSingle: () => Promise.resolve({ data: { full_name: a.fullName, role: a.role }, error: null }) }),
    }),
  });
}

const DANA = { coachId: 'c1', fullName: 'Dana Reyes', bio: 'Strength coach', specialties: ['Strength'], acceptingMembers: true, memberCount: 4 };
const FULL = { coachId: 'c2', fullName: 'Full Coach', bio: null, specialties: [], acceptingMembers: false, memberCount: 20 };

const member = { id: 'u1', email: 'jordan@example.com', fullName: 'Jordan', role: 'member' as const };
const coach = { id: 'u2', email: 'dana@example.com', fullName: 'Dana', role: 'coach' as const };

async function renderWithQuery(ui: ReactElement, existing?: QueryClient) {
  const client = existing ?? new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const sub = (state: string, extra = {}) => ({ state, currentPeriodEnd: '2026-10-01T00:00:00Z', daysOverdue: 0, graceDaysLeft: 0, ...extra }) as never;

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.EXPO_PUBLIC_BILLING_URL;
  setAccount(member);
  subs.fetchSubscriptionState.mockResolvedValue(sub('active'));
  api.fetchMyCoach.mockResolvedValue(null);
  api.fetchCoaches.mockResolvedValue([DANA, FULL]);
  mockRouter.canGoBack.mockReturnValue(true);
});

describe('profile tab', () => {
  it('member without coach sees Choose your coach', async () => {
    await renderWithQuery(<ProfileScreen />);
    expect(await screen.findByText('Jordan')).toBeTruthy();
    expect(screen.getByText('jordan@example.com')).toBeTruthy();
    await fireEvent.press(await screen.findByLabelText('Choose your coach'));
    expect(mockRouter.push).toHaveBeenCalledWith('/coach/pick');
  });

  it('member with coach sees bio and Change coach', async () => {
    api.fetchMyCoach.mockResolvedValue({ coachId: 'c1', fullName: 'Dana Reyes', bio: 'Strength coach', specialties: [], acceptingMembers: true });
    await renderWithQuery(<ProfileScreen />);
    expect(await screen.findByText('Dana Reyes')).toBeTruthy();
    expect(screen.getByText('Strength coach')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Change coach'));
    expect(mockRouter.push).toHaveBeenCalledWith('/coach/pick');
  });

  it('coach sees My coach profile and no subscription or picker', async () => {
    setAccount(coach);
    await renderWithQuery(<ProfileScreen />);
    await fireEvent.press(await screen.findByLabelText('My coach profile'));
    expect(mockRouter.push).toHaveBeenCalledWith('/coach/profile');
    expect(screen.queryByText('Subscription')).toBeNull();
    expect(subs.fetchSubscriptionState).not.toHaveBeenCalled();
  });

  it.each([
    ['active', 'Active', null],
    ['grace', 'Payment overdue', 'Renew'],
    ['expired', 'Expired', 'Renew'],
    ['none', 'Not subscribed', 'Subscribe'],
  ])('shows the %s subscription state', async (state, chip, cta) => {
    process.env.EXPO_PUBLIC_BILLING_URL = 'https://billing.example.com';
    subs.fetchSubscriptionState.mockResolvedValue(sub(state, state === 'grace' ? { daysOverdue: 3, graceDaysLeft: 7 } : {}));
    await renderWithQuery(<ProfileScreen />);
    expect((await screen.findByTestId('subscription-chip')).props.children).toBeTruthy();
    expect(screen.getAllByText(chip).length).toBeGreaterThan(0);
    if (cta) {
      const spy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
      await fireEvent.press(screen.getByLabelText(cta));
      expect(spy).toHaveBeenCalledWith('https://billing.example.com');
    } else {
      expect(screen.queryByLabelText('Renew')).toBeNull();
    }
  });

  it('falls back to contacting the coach when no billing URL is set', async () => {
    subs.fetchSubscriptionState.mockResolvedValue(sub('expired'));
    await renderWithQuery(<ProfileScreen />);
    expect(await screen.findByText('Contact your coach to renew')).toBeTruthy();
  });

  it('shows a retryable error when the subscription fails', async () => {
    subs.fetchSubscriptionState.mockRejectedValueOnce(new Error('boom'));
    await renderWithQuery(<ProfileScreen />);
    expect(await screen.findByText('Could not load your subscription.')).toBeTruthy();
    subs.fetchSubscriptionState.mockResolvedValue(sub('active'));
    await fireEvent.press(screen.getAllByLabelText('Retry')[0]);
    await waitFor(() => expect(screen.queryByText('Could not load your subscription.')).toBeNull());
  });

  it('signs out, clears the cache and goes to sign-in', async () => {
    (supabase.auth.signOut as jest.Mock).mockResolvedValue({ error: null });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60000 } } });
    client.setQueryData(['coaching', 'stale-user-a'], { coachId: 'stale' });
    const clearSpy = jest.spyOn(client, 'clear');
    await renderWithQuery(<ProfileScreen />, client);
    await fireEvent.press(await screen.findByLabelText('Sign out'));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/sign-in'));
    expect(supabase.auth.signOut).toHaveBeenCalled();
    expect(clearSpy).toHaveBeenCalled();
    expect(client.getQueryData(['coaching', 'stale-user-a'])).toBeUndefined();
  });

  it('reports a sign-out failure and stays put', async () => {
    (supabase.auth.signOut as jest.Mock).mockResolvedValue({ error: new Error('x') });
    await renderWithQuery(<ProfileScreen />);
    await fireEvent.press(await screen.findByLabelText('Sign out'));
    expect(await screen.findByText(/Could not sign out/)).toBeTruthy();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});

describe('coach picker', () => {
  it('shows loading then coaches with badges', async () => {
    await renderWithQuery(<PickCoachScreen />);
    expect(await screen.findByText('Dana Reyes')).toBeTruthy();
    expect(screen.getByText('Accepting members')).toBeTruthy();
    expect(screen.getAllByText('Not accepting').length).toBeGreaterThan(0);
    expect(screen.getByText('4 members')).toBeTruthy();
    expect(screen.getByLabelText('Choose Full Coach as your coach').props.accessibilityState.disabled).toBe(true);
  });

  it('shows the empty state', async () => {
    api.fetchCoaches.mockResolvedValue([]);
    await renderWithQuery(<PickCoachScreen />);
    expect(await screen.findByText('No coaches available yet')).toBeTruthy();
  });

  it('shows an error with retry', async () => {
    api.fetchCoaches.mockRejectedValueOnce(new Error('x'));
    await renderWithQuery(<PickCoachScreen />);
    expect(await screen.findByText('Could not load coaches.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Retry'));
    expect(await screen.findByText('Dana Reyes')).toBeTruthy();
  });

  it('shows a members-only state for staff', async () => {
    setAccount(coach);
    await renderWithQuery(<PickCoachScreen />);
    expect(await screen.findByText(/for members only/)).toBeTruthy();
    expect(api.fetchCoaches).not.toHaveBeenCalled();
  });

  it('confirms inline, chooses the coach and returns after success', async () => {
    jest.useFakeTimers();
    try {
      api.chooseCoach.mockResolvedValue(undefined);
      await renderWithQuery(<PickCoachScreen />);
      await screen.findByText('Dana Reyes');
      await fireEvent.press(screen.getByLabelText('Choose Dana Reyes as your coach'));
      expect(screen.getByText('Choose Dana Reyes as your coach?')).toBeTruthy();
      expect(screen.queryByText(/Switching coaches/)).toBeNull();
      await fireEvent.press(screen.getByLabelText('Confirm'));
      expect(await screen.findByText('Dana Reyes is now your coach.')).toBeTruthy();
      expect(api.chooseCoach).toHaveBeenCalledWith('c1');
      await act(async () => {
        jest.advanceTimersByTime(1600);
      });
      expect(mockRouter.back).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('warns about switching when a coach already exists, and cancel closes the panel', async () => {
    api.fetchMyCoach.mockResolvedValue({ coachId: 'other', fullName: 'Old', bio: null, specialties: [], acceptingMembers: true });
    await renderWithQuery(<PickCoachScreen />);
    await screen.findByText('Dana Reyes');
    await waitFor(() => expect(api.fetchMyCoach).toHaveBeenCalled());
    await fireEvent.press(screen.getByLabelText('Choose Dana Reyes as your coach'));
    await waitFor(() => expect(screen.getByText(/Switching coaches changes which classes and notes/)).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('Cancel'));
    expect(screen.queryByText('Choose Dana Reyes as your coach?')).toBeNull();
  });

  it.each([
    ['coach_not_accepting', /not accepting new members/],
    ['coach_not_found', /could not be found/],
    ['not_a_member', /Only members/],
    ['network', /Network problem/],
  ] as const)('maps %s to a message', async (code, pattern) => {
    api.chooseCoach.mockRejectedValue(new ChooseCoachError(code));
    await renderWithQuery(<PickCoachScreen />);
    await screen.findByText('Dana Reyes');
    await fireEvent.press(screen.getByLabelText('Choose Dana Reyes as your coach'));
    await fireEvent.press(screen.getByLabelText('Confirm'));
    expect(await screen.findByText(pattern)).toBeTruthy();
    expect(!!screen.queryByLabelText('Retry')).toBe(code === 'network');
  });

  it('retries after a network error', async () => {
    api.chooseCoach.mockRejectedValueOnce(new ChooseCoachError('network')).mockResolvedValue(undefined);
    await renderWithQuery(<PickCoachScreen />);
    await screen.findByText('Dana Reyes');
    await fireEvent.press(screen.getByLabelText('Choose Dana Reyes as your coach'));
    await fireEvent.press(screen.getByLabelText('Confirm'));
    await fireEvent.press(await screen.findByLabelText('Retry'));
    expect(await screen.findByText('Dana Reyes is now your coach.')).toBeTruthy();
  });

  it('back button goes back', async () => {
    await renderWithQuery(<PickCoachScreen />);
    // Wait for the loading screen to be replaced by the list so the pressed node is not unmounted mid-press.
    await screen.findByText('Dana Reyes');
    await fireEvent.press(screen.getByLabelText('Go back'));
    expect(mockRouter.back).toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('back button falls back to the profile tab when there is no history', async () => {
    mockRouter.canGoBack.mockReturnValue(false);
    await renderWithQuery(<PickCoachScreen />);
    await screen.findByText('Dana Reyes');
    await fireEvent.press(screen.getByLabelText('Go back'));
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/profile');
  });
});

describe('coach self-profile', () => {
  beforeEach(() => {
    setAccount(coach);
    api.fetchMyCoachProfile.mockResolvedValue({ coachId: 'u2', bio: 'Hello', specialties: ['Yoga'], acceptingMembers: true });
  });

  it('is coach-only', async () => {
    setAccount(member);
    await renderWithQuery(<CoachProfileScreen />);
    expect(await screen.findByText(/coaches and admins only/)).toBeTruthy();
  });

  it('shows a retryable account error instead of the coaches-only message', async () => {
    (supabase.auth.getSession as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await renderWithQuery(<CoachProfileScreen />);
    expect(await screen.findByText('Could not load your account.')).toBeTruthy();
    expect(screen.queryByText(/coaches and admins only/)).toBeNull();
    setAccount(coach);
    await fireEvent.press(screen.getByLabelText('Retry'));
    expect(await screen.findByLabelText('Bio')).toBeTruthy();
  });

  it('loads existing values and shows a live counter', async () => {
    await renderWithQuery(<CoachProfileScreen />);
    const bio = await screen.findByLabelText('Bio');
    expect(bio.props.value).toBe('Hello');
    expect(screen.getByTestId('bio-counter').props.children).toBe('5/500');
    await fireEvent.changeText(bio, 'x'.repeat(501));
    expect(screen.getByTestId('bio-counter').props.children).toBe('501/500');
  });

  it('blocks save with an inline error when the bio is too long', async () => {
    await renderWithQuery(<CoachProfileScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Bio'), 'x'.repeat(501));
    await fireEvent.press(screen.getByLabelText('Save profile'));
    expect(await screen.findByText(/Bio must be 500 characters or fewer/)).toBeTruthy();
    expect(api.saveMyCoachProfile).not.toHaveBeenCalled();
  });

  it('blocks save when there are more than 8 specialties', async () => {
    api.fetchMyCoachProfile.mockResolvedValue({
      coachId: 'u2',
      bio: '',
      specialties: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
      acceptingMembers: true,
    });
    await renderWithQuery(<CoachProfileScreen />);
    await fireEvent.press(await screen.findByLabelText('Save profile'));
    expect(await screen.findByText(/at most 8 specialties/)).toBeTruthy();
    expect(api.saveMyCoachProfile).not.toHaveBeenCalled();
  });

  it('adds a specialty, toggles accepting and saves normalized values', async () => {
    api.saveMyCoachProfile.mockResolvedValue({ coachId: 'u2', bio: 'Hi', specialties: ['Yoga', 'Mobility'], acceptingMembers: false });
    await renderWithQuery(<CoachProfileScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Bio'), '  Hi  ');
    await fireEvent.changeText(screen.getByLabelText('Add a specialty'), 'Mobility');
    await fireEvent(screen.getByLabelText('Add a specialty'), 'submitEditing');
    await fireEvent(screen.getByLabelText('Accepting members'), 'valueChange', false);
    await fireEvent.press(screen.getByLabelText('Save profile'));
    expect(await screen.findByText('Profile saved.')).toBeTruthy();
    expect(api.saveMyCoachProfile).toHaveBeenCalledWith({ bio: 'Hi', specialties: ['Yoga', 'Mobility'], acceptingMembers: false });
  });

  it('shows a save error', async () => {
    api.saveMyCoachProfile.mockRejectedValue(new Error('x'));
    await renderWithQuery(<CoachProfileScreen />);
    await fireEvent.press(await screen.findByLabelText('Save profile'));
    expect(await screen.findByText(/Could not save your profile/)).toBeTruthy();
  });
});
