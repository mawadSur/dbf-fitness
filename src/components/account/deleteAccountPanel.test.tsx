import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { DangerZone } from './DangerZone';
import { DeleteAccountPanel } from './DeleteAccountPanel';
import { DeleteAccountError } from '../../features/account/api';
import * as accountApi from '../../features/account/api';
import { supabase } from '../../services/supabase/client';
import { BOTH_THEMES, colorsFor, flattenStyle, renderInTheme } from '../ui/testing';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('../../services/supabase/client', () => ({
  supabase: {
    auth: { signOut: jest.fn(), getSession: jest.fn() },
    from: jest.fn(),
    functions: { invoke: jest.fn() },
  },
}));
jest.mock('../../features/account/api', () => ({
  ...jest.requireActual('../../features/account/api'),
  deleteAccount: jest.fn(),
  fetchMyMemberCount: jest.fn(),
}));

const api = accountApi as jest.Mocked<typeof accountApi>;

async function renderPanel(props: Partial<React.ComponentProps<typeof DeleteAccountPanel>> = {}) {
  return render(
    <DeleteAccountPanel
      role="member"
      memberCount={null}
      onDelete={jest.fn()}
      onDeleted={jest.fn()}
      {...props}
    />
  );
}

async function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const open = async () => fireEvent.press(screen.getByLabelText('Delete account'));
const tapDelete = async () => fireEvent.press(screen.getByLabelText('Permanently delete'));
const deleteButton = () => screen.getByLabelText('Permanently delete');

async function fill({ password = 'hunter2', confirm = 'DELETE' } = {}) {
  await fireEvent.changeText(screen.getByLabelText('Your password'), password);
  await fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), confirm);
}

beforeEach(() => {
  jest.clearAllMocks();
  (supabase.auth.signOut as jest.Mock).mockResolvedValue({ error: null });
});

describe('DeleteAccountPanel — collapsed', () => {
  it('shows only the opener and calls nothing', async () => {
    const onDelete = jest.fn();
    await renderPanel({ onDelete });
    expect(screen.getByLabelText('Delete account')).toBeTruthy();
    expect(screen.queryByLabelText('Your password')).toBeNull();
    expect(screen.queryByLabelText('Permanently delete')).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
  });

  /**
   * In the danger zone this button sits directly under "Sign out" and "Change
   * coach". It used to be a plain `secondary`, so all three had the same
   * neutral outline and the same text colour and the only thing marking the
   * irreversible one was a trash glyph.
   */
  it.each(BOTH_THEMES)('carries the danger tone, not the neutral outline, in %s', async (scheme) => {
    await renderInTheme(
      <DeleteAccountPanel
        role="member"
        memberCount={null}
        onDelete={jest.fn()}
        onDeleted={jest.fn()}
      />,
      scheme,
    );
    const colors = colorsFor(scheme);
    const style = flattenStyle(screen.getByLabelText('Delete account').props.style);
    expect(style.borderColor).toBe(colors.danger);
    // …and NOT the neutral outline a benign `secondary` (Sign out) wears.
    expect(style.borderColor).not.toBe(colors.text);
    expect(flattenStyle(screen.getByText('Delete account').props.style).color).toBe(colors.danger);
  });

  it('tells the parent when it opens, so the member count is fetched lazily', async () => {
    const onOpen = jest.fn();
    await renderPanel({ role: 'coach', onOpen });
    expect(onOpen).not.toHaveBeenCalled();
    await open();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe('DeleteAccountPanel — expanded', () => {
  it('states the member consequences and the store-subscription warning', async () => {
    await renderPanel();
    await open();
    expect(screen.getByText(/Your workout and diet progress/)).toBeTruthy();
    expect(screen.getByText(/coach relationship is removed/)).toBeTruthy();
    expect(screen.getByText(/does not cancel a paid subscription/)).toBeTruthy();
    expect(screen.getByText(/App Store or Google Play/)).toBeTruthy();
  });

  it('tells a coach how many members lose access', async () => {
    await renderPanel({ role: 'coach', memberCount: 3 });
    await open();
    expect(screen.getByText(/3 members will lose access to your classes and notes/)).toBeTruthy();
  });

  it('uses a generic sentence when the count is unknown', async () => {
    await renderPanel({ role: 'coach', memberCount: null });
    await open();
    expect(screen.getByText(/Your members will lose access/)).toBeTruthy();
  });

  // Regression (review 2026-09-20): a coach could confirm the delete without ever being told that
  // their members' own logged workouts and diet check-ins go with the plans they authored
  // (workout_plans.coach_id / diet_plans.coach_id are ON DELETE CASCADE).
  it('shows the coach the irreversible loss of their members own history', async () => {
    await renderPanel({ role: 'coach', memberCount: 3 });
    await open();
    expect(screen.getByText(/workout and diet plans you wrote for them/)).toBeTruthy();
    expect(screen.getByText(/cannot be recovered/)).toBeTruthy();
  });

  it('does not show that warning to a member deleting their own account', async () => {
    await renderPanel();
    await open();
    expect(screen.queryByText(/workout and diet plans you wrote for them/)).toBeNull();
  });

  it('collapses again on Cancel and forgets what was typed', async () => {
    await renderPanel();
    await open();
    await fill();
    await fireEvent.press(screen.getByLabelText('Cancel'));
    expect(screen.queryByLabelText('Your password')).toBeNull();
    await open();
    expect(screen.getByLabelText('Your password').props.value).toBe('');
    expect(screen.getByLabelText('Type DELETE to confirm').props.value).toBe('');
  });

  it('masks the password field and asks the OS for the saved password', async () => {
    await renderPanel();
    await open();
    const field = screen.getByLabelText('Your password');
    expect(field.props.secureTextEntry).toBe(true);
    expect(field.props.textContentType).toBe('password');
    expect(field.props.autoComplete).toBe('current-password');
  });
});

describe('DeleteAccountPanel — confirm gating', () => {
  it('keeps the destructive button disabled until both fields are right', async () => {
    await renderPanel({ onDelete: jest.fn().mockResolvedValue(undefined) });
    await open();
    expect(deleteButton().props.accessibilityState.disabled).toBe(true);

    await fill({ password: 'pw', confirm: '' });
    expect(deleteButton().props.accessibilityState.disabled).toBe(true);

    await fill({ password: '', confirm: 'DELETE' });
    expect(deleteButton().props.accessibilityState.disabled).toBe(true);

    await fill({ password: 'pw', confirm: 'delete' });
    expect(deleteButton().props.accessibilityState.disabled).toBe(true);

    await fill({ password: 'pw', confirm: 'DELETE' });
    expect(deleteButton().props.accessibilityState.disabled).toBe(false);
  });

  it('does not fire when pressed while still disabled', async () => {
    const onDelete = jest.fn();
    await renderPanel({ onDelete });
    await open();
    await fill({ password: 'pw', confirm: 'nope' });
    await tapDelete();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('sends only the password once both fields are right', async () => {
    const onDelete = jest.fn().mockResolvedValue(undefined);
    await renderPanel({ onDelete });
    await open();
    await fill({ password: 'hunter2', confirm: '  DELETE  ' });
    await tapDelete();
    expect(onDelete).toHaveBeenCalledWith('hunter2');
  });
});

describe('DeleteAccountPanel — busy and error states', () => {
  it('marks the button busy while the request is in flight and refuses a double tap', async () => {
    let release: () => void = () => undefined;
    const onDelete = jest.fn(() => new Promise<void>((resolve) => (release = resolve)));
    await renderPanel({ onDelete });
    await open();
    await fill();
    // Not awaited: the press cannot settle until `release()` runs, and the point of the test is
    // what the panel looks like WHILE it is in flight.
    const inFlight = fireEvent.press(deleteButton());

    await waitFor(() => expect(deleteButton().props.accessibilityState.busy).toBe(true));
    expect(deleteButton().props.accessibilityState.disabled).toBe(true);
    fireEvent.press(deleteButton());
    expect(onDelete).toHaveBeenCalledTimes(1);

    await act(async () => {
      release();
      await inFlight;
    });
  });

  it.each([
    ['invalid_password', /password is not right/i],
    ['confirm_required', /Type DELETE to confirm before deleting/],
    ['network', /Check your connection/i],
    ['unknown', /Could not delete your account/i],
  ])('shows the %s message and still offers a retry', async (code, copy) => {
    await renderPanel({ onDelete: jest.fn().mockRejectedValue(new DeleteAccountError(code as never)) });
    await open();
    await fill();
    await tapDelete();
    await waitFor(() => expect(screen.getByText(copy)).toBeTruthy());
    expect(screen.getByLabelText('Permanently delete')).toBeTruthy();
    expect(screen.getByLabelText('Cancel')).toBeTruthy();
  });

  it.each([
    ['admin_managed_by_operator', /operator/i],
    ['unauthorized', /session expired/i],
  ])('hides the form for %s, which no retry can fix', async (code, copy) => {
    await renderPanel({
      role: 'coach',
      memberCount: 2,
      onDelete: jest.fn().mockRejectedValue(new DeleteAccountError(code as never)),
    });
    await open();
    await fill();
    await tapDelete();
    await waitFor(() => expect(screen.getByText(copy)).toBeTruthy());
    expect(screen.queryByLabelText('Permanently delete')).toBeNull();
    expect(screen.queryByLabelText('Your password')).toBeNull();
    expect(screen.getByLabelText('Close')).toBeTruthy();
  });

  it('treats a thrown value with no code as unknown rather than crashing', async () => {
    await renderPanel({ onDelete: jest.fn().mockRejectedValue(new Error('boom')) });
    await open();
    await fill();
    await tapDelete();
    await waitFor(() => expect(screen.getByText(/Could not delete your account/i)).toBeTruthy());
  });

  it('lets the user correct the password and succeed on the retry', async () => {
    const onDelete = jest
      .fn()
      .mockRejectedValueOnce(new DeleteAccountError('invalid_password'))
      .mockResolvedValueOnce(undefined);
    const onDeleted = jest.fn();
    await renderPanel({ onDelete, onDeleted });
    await open();
    await fill({ password: 'wrong' });
    await tapDelete();
    await waitFor(() => expect(screen.getByText(/password is not right/i)).toBeTruthy());

    await fill({ password: 'right' });
    await tapDelete();
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(onDelete).toHaveBeenLastCalledWith('right');
  });
});

describe('DeleteAccountPanel — admin', () => {
  it('shows the operator note instead of a delete form', async () => {
    await renderPanel({ role: 'admin' });
    expect(screen.getByText(/managed by your operator/i)).toBeTruthy();
    expect(screen.queryByLabelText('Delete account')).toBeNull();
    expect(screen.queryByLabelText('Your password')).toBeNull();
  });
});

describe('DeleteAccountPanel — keyboard', () => {
  it('tells the parent when either field takes focus, and nests no KeyboardAvoidingView', async () => {
    const onFieldFocus = jest.fn();
    const view = await renderPanel({ onFieldFocus });
    await open();
    await fireEvent(screen.getByLabelText('Your password'), 'focus');
    await fireEvent(screen.getByLabelText('Type DELETE to confirm'), 'focus');
    expect(onFieldFocus).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(view.toJSON())).not.toMatch(/KeyboardAvoidingView/);
  });
});

describe('DeleteAccountPanel — coach copy', () => {
  it('states that groups the coach created and their memberships are removed', async () => {
    await renderPanel({ role: 'coach', memberCount: 2 });
    await open();
    expect(screen.getByText(/Groups you created are deleted along with every membership/)).toBeTruthy();
  });
});

describe('DeleteAccountPanel — success', () => {
  it('shows "Your account was deleted" and hands off to the parent', async () => {
    const onDeleted = jest.fn();
    await renderPanel({ onDelete: jest.fn().mockResolvedValue(undefined), onDeleted });
    await open();
    await fill();
    await tapDelete();
    await waitFor(() => expect(screen.getByText('Your account was deleted')).toBeTruthy());
    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Your password')).toBeNull();
  });
});

describe('DangerZone', () => {
  it('does not fetch the member count until the panel is opened', async () => {
    api.fetchMyMemberCount.mockResolvedValue(7);
    await renderWithQuery(<DangerZone role="coach" />);
    expect(api.fetchMyMemberCount).not.toHaveBeenCalled();

    await open();
    await waitFor(() => expect(screen.getByText(/7 members will lose access/)).toBeTruthy());
  });

  it('never fetches a count for a member', async () => {
    await renderWithQuery(<DangerZone role="member" />);
    await open();
    await waitFor(() => expect(screen.getByText(/Your workout and diet progress/)).toBeTruthy());
    expect(api.fetchMyMemberCount).not.toHaveBeenCalled();
  });

  it('falls back to the generic sentence when the count query fails', async () => {
    api.fetchMyMemberCount.mockRejectedValue(new Error('nope'));
    await renderWithQuery(<DangerZone role="coach" />);
    await open();
    await waitFor(() => expect(screen.getByText(/Your members will lose access/)).toBeTruthy());
  });

  it('signs out, clears the cache and leaves for sign-in after a successful delete', async () => {
    api.fetchMyMemberCount.mockResolvedValue(0);
    api.deleteAccount.mockResolvedValue(undefined);
    await renderWithQuery(<DangerZone role="member" />);
    await open();
    await fill();
    await tapDelete();
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/sign-in?deleted=1'));
    expect(supabase.auth.signOut).toHaveBeenCalled();
    expect(api.deleteAccount).toHaveBeenCalledWith('hunter2');
  });

  it('still leaves for sign-in when the sign-out call fails on a deleted user', async () => {
    api.deleteAccount.mockResolvedValue(undefined);
    (supabase.auth.signOut as jest.Mock).mockRejectedValue(new Error('user not found'));
    await renderWithQuery(<DangerZone role="member" />);
    await open();
    await fill();
    await tapDelete();
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/sign-in?deleted=1'));
  });

  it('does not navigate when the delete is refused', async () => {
    api.deleteAccount.mockRejectedValue(new DeleteAccountError('invalid_password'));
    await renderWithQuery(<DangerZone role="member" />);
    await open();
    await fill();
    await tapDelete();
    await waitFor(() => expect(screen.getByText(/password is not right/i)).toBeTruthy());
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });
});
