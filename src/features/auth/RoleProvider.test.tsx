import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { fakeCalls, resetFake, setSession, setTable } from '../diet/fakeSupabase';
import { RoleProvider, useRole } from './RoleProvider';

jest.mock('../../services/supabase/client', () => ({
  supabase: jest.requireActual('../diet/fakeSupabase').fakeSupabase,
}));

const ok = (data: unknown) => ({ data, error: null });

function Probe() {
  const { role, isLoading, isStaff, isCoach, isAdmin, isError } = useRole();
  return (
    <Text testID="probe">
      {[
        `role=${role ?? 'null'}`,
        `loading=${isLoading}`,
        `staff=${isStaff}`,
        `coach=${isCoach}`,
        `admin=${isAdmin}`,
        `error=${isError}`,
      ].join(' ')}
    </Text>
  );
}

function renderWithProvider(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const probeText = (index = 0) => String(screen.getAllByTestId('probe')[index].props.children);
const text = () => probeText(0);

beforeEach(() => {
  resetFake();
  setSession({ user: { id: 'u1' } });
});

describe('RoleProvider', () => {
  it('reports staff once, for the whole tree, from a single fetch', async () => {
    setTable('profiles', () => ok({ role: 'coach' }));
    renderWithProvider(
      <RoleProvider>
        <Probe />
        <Probe />
        <Probe />
      </RoleProvider>,
    );

    await waitFor(() => expect(probeText(0)).toContain('role=coach'));
    // Every consumer sees the same answer, not just the first.
    expect(probeText(1)).toContain('role=coach');
    expect(probeText(2)).toContain('staff=true');
    // Three consumers, ONE profiles read: this is the whole point of the provider.
    expect(fakeCalls.filter((c) => c.table === 'profiles')).toHaveLength(1);
  });

  // The flash this prevents: a coach saw a member Home for one frame while
  // their own role request was still in flight.
  it('reports isLoading before the answer arrives, never a premature "member"', async () => {
    let resolve: ((value: { data: unknown; error: null }) => void) | undefined;
    setTable('profiles', () => new Promise((r) => (resolve = r)));
    renderWithProvider(
      <RoleProvider>
        <Probe />
      </RoleProvider>,
    );

    await waitFor(() => expect(text()).toContain('loading=true'));
    expect(text()).toContain('role=null');
    expect(text()).toContain('staff=false');

    resolve?.(ok({ role: 'admin' }));
    await waitFor(() => expect(text()).toContain('role=admin'));
    expect(text()).toContain('loading=false');
    expect(text()).toContain('staff=true');
    expect(text()).toContain('admin=true');
    expect(text()).toContain('coach=false');
  });

  it('never fetches for a signed-out user and settles immediately', async () => {
    setSession(null);
    setTable('profiles', () => ok({ role: 'admin' }));
    renderWithProvider(
      <RoleProvider>
        <Probe />
      </RoleProvider>,
    );

    await waitFor(() => expect(text()).toContain('loading=false'));
    expect(text()).toContain('role=null');
    expect(fakeCalls.filter((c) => c.table === 'profiles')).toHaveLength(0);
  });

  // A flaky network must not silently demote a coach to "member": callers need
  // to tell "not staff" apart from "could not ask".
  it('surfaces a failed fetch as isError with a null role, not as member', async () => {
    setTable('profiles', () => ({ data: null, error: new Error('Network request failed') }));
    renderWithProvider(
      <RoleProvider>
        <Probe />
      </RoleProvider>,
    );

    await waitFor(() => expect(text()).toContain('error=true'));
    expect(text()).toContain('role=null');
    expect(text()).toContain('staff=false');
  });
});

describe('useRole without a provider', () => {
  // Screens are mounted standalone in tests and dev routes; being outside the
  // provider must not silently downgrade them to "not staff".
  it('falls back to fetching the role itself', async () => {
    setTable('profiles', () => ok({ role: 'coach' }));
    renderWithProvider(<Probe />);
    await waitFor(() => expect(text()).toContain('role=coach'));
    expect(text()).toContain('staff=true');
  });

  it('shares one request between several provider-less consumers', async () => {
    setTable('profiles', () => ok({ role: 'member' }));
    renderWithProvider(
      <>
        <Probe />
        <Probe />
      </>,
    );
    await waitFor(() => expect(probeText(0)).toContain('role=member'));
    expect(probeText(1)).toContain('role=member');
    expect(fakeCalls.filter((c) => c.table === 'profiles')).toHaveLength(1);
  });
});
