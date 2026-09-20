/**
 * Contract test for the client side of the `agora-rtc-token` Edge Function (the real enforcement
 * point for video access). Asserts the exact function name, request body, and how each documented
 * HTTP failure becomes a typed RtcCredentialsError.
 */
import { fetchRtcCredentials, RtcCredentialsError } from './credentials';

const mockInvoke = jest.fn();
const mockFrom = jest.fn();
const mockRpc = jest.fn();
jest.mock('../supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

const CLASS = '88888888-8888-8888-8888-888888888888';

const okBody = {
  mode: 'mock',
  app_id: null,
  channel: 'class-88888888',
  uid: 1234,
  token: null,
  expires_at: null,
  subscription: { state: 'active', days_overdue: 0, grace_days_left: 0 },
};

const httpError = (status: number, body: unknown) => ({
  message: 'Edge Function returned a non-2xx status code',
  context: { status, json: async () => body },
});

beforeEach(() => jest.clearAllMocks());

describe('fetchRtcCredentials contract', () => {
  it('calls exactly one function, agora-rtc-token, with exactly { class_id } and touches no table or rpc', async () => {
    mockInvoke.mockResolvedValue({ data: okBody, error: null });
    await fetchRtcCredentials(CLASS);

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const [name, options] = mockInvoke.mock.calls[0];
    expect(name).toBe('agora-rtc-token');
    expect(options).toEqual({ body: { class_id: CLASS } });
    // The client never sends identity, role or entitlement: the server derives them from the JWT.
    expect(Object.keys((options as { body: object }).body)).toEqual(['class_id']);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('returns the response untouched, including the subscription block used for grace reminders', async () => {
    const grace = { ...okBody, subscription: { state: 'grace', days_overdue: 4, grace_days_left: 6 } };
    mockInvoke.mockResolvedValue({ data: grace, error: null });
    await expect(fetchRtcCredentials(CLASS)).resolves.toBe(grace);
  });

  it('prefers the body error code over the status (a 403 can be subscription_required OR not_entitled)', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: httpError(403, { error: 'subscription_required' }) });
    await expect(fetchRtcCredentials(CLASS)).rejects.toMatchObject({ code: 'subscription_required' });
    mockInvoke.mockResolvedValue({ data: null, error: httpError(403, { error: 'not_entitled' }) });
    await expect(fetchRtcCredentials(CLASS)).rejects.toMatchObject({ code: 'not_entitled' });
  });

  it('a body code that contradicts the status still wins when it is a known code', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: httpError(500, { error: 'class_not_joinable' }) });
    await expect(fetchRtcCredentials(CLASS)).rejects.toMatchObject({ code: 'class_not_joinable' });
  });

  it('falls back to the status when the body code is missing or not a known string', async () => {
    const cases: [number, unknown, string][] = [
      [401, {}, 'unauthorized'],
      [403, { error: 42 }, 'not_entitled'],
      [404, { error: 'made_up' }, 'class_not_found'],
      [409, null, 'class_not_joinable'],
      [418, {}, 'unknown'],
      [500, {}, 'unknown'],
    ];
    for (const [status, body, code] of cases) {
      mockInvoke.mockResolvedValue({ data: null, error: httpError(status, body) });
      const error = await fetchRtcCredentials(CLASS).catch((caught) => caught);
      expect(error).toBeInstanceOf(RtcCredentialsError);
      expect(`${status}:${error.code}`).toBe(`${status}:${code}`);
    }
  });

  it('carries the server subscription block on a typed error so the UI can explain a refusal', async () => {
    const subscription = { state: 'grace', days_overdue: 2, grace_days_left: 8 };
    mockInvoke.mockResolvedValue({
      data: null,
      error: httpError(409, { error: 'class_not_joinable', subscription }),
    });
    const error = await fetchRtcCredentials(CLASS).catch((caught) => caught);
    expect(error.subscription).toEqual(subscription);
    expect(error.name).toBe('RtcCredentialsError');
  });

  it('never resolves with partial credentials: non-object, missing channel or non-string channel is unknown', async () => {
    for (const data of [null, undefined, 'ok', 7, {}, { channel: 5, token: 't' }]) {
      mockInvoke.mockResolvedValueOnce({ data, error: null });
      await expect(fetchRtcCredentials(CLASS)).rejects.toMatchObject({ code: 'unknown' });
    }
  });

  it('an error object with no response context (offline) is unknown, not a crash', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error('Failed to fetch') });
    const error = await fetchRtcCredentials(CLASS).catch((caught) => caught);
    expect(error).toBeInstanceOf(RtcCredentialsError);
    expect(error.code).toBe('unknown');
    expect(error.message).toBe('Failed to fetch');
  });
});
