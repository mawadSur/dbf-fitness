/**
 * The TermsGate state matrix: loading, accepted, needs-accept, saving, error + retry,
 * offline, and the Sign out escape.
 *
 * This gate is the half of Apple guideline 1.2 that a sign-up checkbox cannot cover —
 * accounts that predate the terms, and everybody after a `TERMS_VERSION` bump. It also has
 * the most dangerous failure mode in the app: it renders an absolutely-positioned overlay
 * across the whole navigator, so a wrong verdict locks a paying member out of their class.
 * Both directions are pinned here, in particular the deliberate choice to FAIL OPEN.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { TERMS_VERSION } from '../../config/legal';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { TermsGate } from './TermsGate';

const mockRpc = jest.fn();
const mockSignOut = jest.fn();
jest.mock('../../services/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    auth: { signOut: () => mockSignOut() },
  },
}));

async function renderGate(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ThemeProvider>
        <QueryClientProvider client={client}>{ui}</QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/** A promise the test resolves by hand, to hold the gate in its pending state. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSignOut.mockResolvedValue({ error: null });
});

describe('TermsGate: when it stays out of the way', () => {
  it('renders nothing at all for a signed-out visitor, and never asks the server', async () => {
    await renderGate(<TermsGate signedIn={false} />);

    expect(screen.queryByTestId('terms-gate')).toBeNull();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('does not flash the prompt while the lookup is still in flight', async () => {
    const pending = deferred<{ data: boolean; error: null }>();
    mockRpc.mockReturnValue(pending.promise);

    await renderGate(<TermsGate signedIn />);

    expect(screen.queryByTestId('terms-gate')).toBeNull();

    pending.resolve({ data: true, error: null });
    await waitFor(() => expect(mockRpc).toHaveBeenCalled());
  });

  it('stays hidden once the user has accepted this version', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });

    await renderGate(<TermsGate signedIn />);

    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('has_accepted_terms', { p_version: TERMS_VERSION })
    );
    expect(screen.queryByTestId('terms-gate')).toBeNull();
  });

  it('FAILS OPEN when the lookup itself errors — offline must not lock anyone out', async () => {
    // Deliberate posture: a timed-out acceptance lookup showing the prompt one launch late
    // is a far smaller failure than barring a member from a class they paid for.
    mockRpc.mockResolvedValue({ data: null, error: new Error('network request failed') });

    await renderGate(<TermsGate signedIn />);

    await waitFor(() => expect(mockRpc).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId('terms-gate')).toBeNull());
  });
});

describe('TermsGate: when acceptance is outstanding', () => {
  beforeEach(() => {
    mockRpc.mockImplementation((fn: string) =>
      fn === 'has_accepted_terms'
        ? Promise.resolve({ data: false, error: null })
        : Promise.resolve({ data: null, error: null })
    );
  });

  it('blocks the app with a modal overlay, both links and the version on show', async () => {
    await renderGate(<TermsGate signedIn />);

    const gate = await screen.findByTestId('terms-gate');
    // Nothing behind the overlay may be reachable by touch or by a screen reader.
    expect(gate.props.accessibilityViewIsModal).toBe(true);
    expect(screen.getByTestId('terms-gate-terms')).toBeTruthy();
    expect(screen.getByTestId('terms-gate-privacy')).toBeTruthy();
    expect(screen.getByText(`Version ${TERMS_VERSION}`)).toBeTruthy();
  });

  it('records the acceptance and gets out of the way', async () => {
    await renderGate(<TermsGate signedIn />);

    await fireEvent.press(await screen.findByTestId('terms-gate-accept'));

    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('accept_terms', { p_version: TERMS_VERSION })
    );
    await waitFor(() => expect(screen.queryByTestId('terms-gate')).toBeNull());
  });

  it('shows a busy, un-pressable pair of buttons while saving', async () => {
    const saving = deferred<{ data: null; error: null }>();
    mockRpc.mockImplementation((fn: string) =>
      fn === 'has_accepted_terms'
        ? Promise.resolve({ data: false, error: null })
        : saving.promise
    );

    await renderGate(<TermsGate signedIn />);
    await fireEvent.press(await screen.findByTestId('terms-gate-accept'));

    await waitFor(() =>
      expect(screen.getByTestId('terms-gate-accept').props.accessibilityState).toMatchObject({
        busy: true,
      })
    );
    // A double tap during the round trip must not fire a second write, and the escape
    // hatch must not sign the user out mid-save.
    expect(screen.getByTestId('terms-gate-sign-out').props.accessibilityState).toMatchObject({
      disabled: true,
    });

    saving.resolve({ data: null, error: null });
    await waitFor(() => expect(screen.queryByTestId('terms-gate')).toBeNull());
  });

  it('surfaces a save failure and lets the user retry into success', async () => {
    let attempts = 0;
    mockRpc.mockImplementation((fn: string) => {
      if (fn === 'has_accepted_terms') return Promise.resolve({ data: false, error: null });
      attempts += 1;
      return attempts === 1
        ? Promise.resolve({ data: null, error: new Error('offline') })
        : Promise.resolve({ data: null, error: null });
    });

    await renderGate(<TermsGate signedIn />);
    await fireEvent.press(await screen.findByTestId('terms-gate-accept'));

    // Error is visible, and the gate is still up — the agreement was NOT recorded.
    await screen.findByTestId('terms-gate-error');
    expect(screen.getByTestId('terms-gate')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('terms-gate-accept'));

    await waitFor(() => expect(screen.queryByTestId('terms-gate')).toBeNull());
    expect(attempts).toBe(2);
  });

  it('lets a user who will not accept sign out instead of being trapped', async () => {
    await renderGate(<TermsGate signedIn />);

    await fireEvent.press(await screen.findByTestId('terms-gate-sign-out'));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
    // Signing out must never be mistaken for accepting.
    expect(mockRpc).not.toHaveBeenCalledWith('accept_terms', expect.anything());
  });
});
