import { fetchRtcCredentials, RtcCredentialsError } from './credentials';

const mockInvoke = jest.fn();
jest.mock('../supabase/client', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } },
}));

const httpError = (status: number, body: unknown) => ({
  message: 'Edge Function returned a non-2xx status code',
  context: { status, json: async () => body },
});

describe('fetchRtcCredentials', () => {
  beforeEach(() => mockInvoke.mockReset());

  it('posts class_id and returns the contract response', async () => {
    const payload = {
      mode: 'live',
      app_id: 'app',
      channel: 'ch',
      uid: 7,
      token: 't',
      expires_at: '2026-01-01T00:00:00Z',
      subscription: { state: 'grace', days_overdue: 3, grace_days_left: 7 },
    };
    mockInvoke.mockResolvedValue({ data: payload, error: null });
    await expect(fetchRtcCredentials('c1')).resolves.toEqual(payload);
    expect(mockInvoke).toHaveBeenCalledWith('agora-rtc-token', { body: { class_id: 'c1' } });
  });

  it.each([
    [401, { error: 'unauthorized' }, 'unauthorized'],
    [403, { error: 'subscription_required' }, 'subscription_required'],
    [403, { error: 'not_entitled' }, 'not_entitled'],
    [404, { error: 'class_not_found' }, 'class_not_found'],
    [409, { error: 'class_not_joinable' }, 'class_not_joinable'],
    [404, {}, 'class_not_found'],
    [403, {}, 'not_entitled'],
    [500, { error: 'boom' }, 'unknown'],
  ])('maps %s %j to %s', async (status, body, code) => {
    mockInvoke.mockResolvedValue({ data: null, error: httpError(status, body) });
    const err = await fetchRtcCredentials('c1').catch((e) => e);
    expect(err).toBeInstanceOf(RtcCredentialsError);
    expect(err.code).toBe(code);
  });

  it('maps a 403 with an unreadable body to not_entitled', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: { message: 'x', context: { status: 403, json: async () => { throw new Error('bad json'); } } },
    });
    await expect(fetchRtcCredentials('c1')).rejects.toMatchObject({ code: 'not_entitled' });
  });

  it('is unknown for network errors without a response and for malformed bodies', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: new Error('network') });
    await expect(fetchRtcCredentials('c1')).rejects.toMatchObject({ code: 'unknown' });
    mockInvoke.mockResolvedValueOnce({ data: {}, error: null });
    await expect(fetchRtcCredentials('c1')).rejects.toMatchObject({ code: 'unknown' });
  });
});
