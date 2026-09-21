/**
 * Streaks and the one-per-day rule are computed in the MEMBER's timezone
 * (D1b), so a stale `profiles.timezone` silently moves the day boundary.
 *
 * The hard constraint: until the D1b column exists every failure must be
 * SILENT and must not retry-storm — the app cannot show a member a 42703.
 */

import { fakeCalls, resetFake, setTable } from '../diet/fakeSupabase';
import { deviceTimezone, resetTimezoneSyncCache, syncProfileTimezone } from './timezoneSync';

jest.mock('../../services/supabase/client', () => ({
  supabase: jest.requireActual('../diet/fakeSupabase').fakeSupabase,
}));

const USER = 'u-jordan';
const ok = (data: unknown) => ({ data, error: null });
/** PostgrestError carries a `code`; the fake types `error` as `Error`, so carry both. */
const dbError = (code: string) => ({
  data: null,
  error: Object.assign(new Error(code), { code }),
});

/** Pin the device zone for the test, restoring the real resolver afterwards. */
function withDeviceZone(zone: string | null) {
  const original = Intl.DateTimeFormat;
  const spy = jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(
    () => ({ resolvedOptions: () => ({ timeZone: zone }) }) as unknown as Intl.DateTimeFormat,
  );
  return () => {
    spy.mockRestore();
    Intl.DateTimeFormat = original;
  };
}

let restoreZone: (() => void) | undefined;

beforeEach(() => {
  resetFake();
  resetTimezoneSyncCache();
  restoreZone = withDeviceZone('Europe/Berlin');
});

afterEach(() => restoreZone?.());

const updates = () => fakeCalls.filter((c) => c.table === 'profiles' && c.method === 'update');
const reads = () => fakeCalls.filter((c) => c.table === 'profiles' && c.method !== 'update');

describe('deviceTimezone', () => {
  it('returns the device IANA zone', () => {
    expect(deviceTimezone()).toBe('Europe/Berlin');
  });

  it('returns null when the runtime cannot tell us', () => {
    restoreZone?.();
    restoreZone = withDeviceZone(null);
    expect(deviceTimezone()).toBeNull();
  });

  it('returns null instead of throwing when Intl blows up', () => {
    restoreZone?.();
    const spy = jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('no Intl in this build');
    });
    restoreZone = () => spy.mockRestore();
    expect(deviceTimezone()).toBeNull();
  });
});

describe('syncProfileTimezone', () => {
  it('writes the device zone when the profile disagrees', async () => {
    setTable('profiles', () => ok({ timezone: 'UTC' }));
    await expect(syncProfileTimezone(USER)).resolves.toBe('updated');
    expect(updates()).toHaveLength(1);
    expect(updates()[0].payload).toEqual({ timezone: 'Europe/Berlin' });
  });

  it('writes nothing when the profile already matches', async () => {
    setTable('profiles', () => ok({ timezone: 'Europe/Berlin' }));
    await expect(syncProfileTimezone(USER)).resolves.toBe('unchanged');
    expect(updates()).toHaveLength(0);
  });

  it('skips entirely when signed out', async () => {
    setTable('profiles', () => ok({ timezone: 'UTC' }));
    await expect(syncProfileTimezone(null)).resolves.toBe('skipped');
    expect(fakeCalls).toHaveLength(0);
  });

  it('skips when the device has no zone to offer', async () => {
    restoreZone?.();
    restoreZone = withDeviceZone(null);
    setTable('profiles', () => ok({ timezone: 'UTC' }));
    await expect(syncProfileTimezone(USER)).resolves.toBe('skipped');
    expect(fakeCalls).toHaveLength(0);
  });

  // Pre-D1b the column does not exist: 42703. It must be silent.
  it('fails silently when the timezone column does not exist yet', async () => {
    setTable('profiles', () => dbError('42703'));
    await expect(syncProfileTimezone(USER)).resolves.toBe('failed');
    expect(updates()).toHaveLength(0);
  });

  it('does not retry-storm a missing column on the next foreground', async () => {
    setTable('profiles', () => dbError('42703'));
    await syncProfileTimezone(USER);
    await syncProfileTimezone(USER);
    await syncProfileTimezone(USER);
    // One read, then the cache answers: the app does not hammer a broken column.
    expect(reads()).toHaveLength(1);
  });

  it('reports a rejected write as failed without throwing', async () => {
    setTable('profiles', (op) =>
      op.method === 'update' ? dbError('42501') : ok({ timezone: 'UTC' }),
    );
    await expect(syncProfileTimezone(USER)).resolves.toBe('failed');
  });

  it('never throws when the client itself blows up', async () => {
    setTable('profiles', () => {
      throw new Error('Network request failed');
    });
    await expect(syncProfileTimezone(USER)).resolves.toBe('failed');
  });

  it('does not re-read on a second foreground for the same user and zone', async () => {
    setTable('profiles', () => ok({ timezone: 'UTC' }));
    await expect(syncProfileTimezone(USER)).resolves.toBe('updated');
    await expect(syncProfileTimezone(USER)).resolves.toBe('unchanged');
    expect(updates()).toHaveLength(1);
    expect(reads()).toHaveLength(1);
  });

  // The actual scenario: fly Dubai -> Berlin, app foregrounds.
  it('pushes again when the device zone changes mid-session', async () => {
    setTable('profiles', () => ok({ timezone: 'Asia/Dubai' }));
    restoreZone?.();
    restoreZone = withDeviceZone('Asia/Dubai');
    await expect(syncProfileTimezone(USER)).resolves.toBe('unchanged');

    restoreZone?.();
    restoreZone = withDeviceZone('Europe/Berlin');
    await expect(syncProfileTimezone(USER)).resolves.toBe('updated');
    expect(updates()[0].payload).toEqual({ timezone: 'Europe/Berlin' });
  });

  it('re-syncs for a different account on the same device', async () => {
    setTable('profiles', () => ok({ timezone: 'UTC' }));
    await syncProfileTimezone(USER);
    await expect(syncProfileTimezone('u-dana')).resolves.toBe('updated');
    expect(updates()).toHaveLength(2);
  });
});
