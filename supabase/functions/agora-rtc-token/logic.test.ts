import {
  buildSuccessBody,
  decideAccess,
  deriveAgoraUid,
  entitledState,
  isBodyTooLarge,
  MAX_BODY_BYTES,
  parseClassId,
  readSubscriptionRow,
  rejectRequest,
  resolveInvisibleClass,
  TOKEN_TTL_SECONDS,
  type CallerProfile,
  type LiveClassRow,
  type SubscriptionSnapshot,
} from './logic';

const COACH = '11111111-1111-1111-1111-111111111111';
const OTHER_COACH = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLASS_ID = '88888888-8888-8888-8888-888888888888';

const liveClass = (overrides: Partial<LiveClassRow> = {}): LiveClassRow => ({
  id: CLASS_ID,
  coach_id: COACH,
  agora_channel_name: 'dbf-demo-saturday-conditioning',
  status: 'scheduled',
  ...overrides,
});

const caller = (overrides: Partial<CallerProfile> = {}): CallerProfile => ({
  id: '22222222-2222-2222-2222-222222222222',
  role: 'member',
  coach_id: COACH,
  ...overrides,
});

const state = (s: string, daysOverdue = 0, graceDaysLeft = 0): SubscriptionSnapshot => ({
  state: s,
  days_overdue: daysOverdue,
  grace_days_left: graceDaysLeft,
});

describe('rejectRequest', () => {
  it('allows an authenticated POST', () => {
    expect(rejectRequest('POST', 'Bearer some.jwt.value')).toBeNull();
  });

  it('rejects every other method with 405', () => {
    for (const method of ['GET', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']) {
      expect(rejectRequest(method, 'Bearer some.jwt.value')).toEqual({
        status: 405,
        error: 'method_not_allowed',
      });
    }
  });

  it('rejects a missing or malformed Authorization header with 401', () => {
    expect(rejectRequest('POST', null)).toEqual({ status: 401, error: 'unauthorized' });
    expect(rejectRequest('POST', '')).toEqual({ status: 401, error: 'unauthorized' });
    expect(rejectRequest('POST', 'Bearer')).toEqual({ status: 401, error: 'unauthorized' });
    expect(rejectRequest('POST', 'Basic abc')).toEqual({ status: 401, error: 'unauthorized' });
  });

  it('checks the method before the credential', () => {
    expect(rejectRequest('GET', null)?.status).toBe(405);
  });
});

describe('parseClassId', () => {
  it('accepts a well-formed uuid and normalises it', () => {
    expect(parseClassId({ class_id: ` ${CLASS_ID.toUpperCase()} ` })).toBe(CLASS_ID);
  });

  it('rejects anything that is not a uuid string', () => {
    for (const body of [
      null,
      undefined,
      'a string body',
      {},
      { class_id: null },
      { class_id: 42 },
      { class_id: '' },
      { class_id: 'not-a-uuid' },
      { class_id: `${CLASS_ID} or 1=1` },
      { class_id: [CLASS_ID] },
    ]) {
      expect(parseClassId(body)).toBeNull();
    }
  });
});

describe('deriveAgoraUid', () => {
  it('is stable for the same user', () => {
    expect(deriveAgoraUid(COACH)).toBe(deriveAgoraUid(COACH));
  });

  it('differs between users', () => {
    expect(deriveAgoraUid(COACH)).not.toBe(deriveAgoraUid(OTHER_COACH));
  });

  it('is always a positive 32-bit integer, never 0', () => {
    const inputs = [COACH, OTHER_COACH, CLASS_ID, '', 'a', 'ffffffff-ffff-ffff-ffff-ffffffffffff'];
    for (const input of inputs) {
      const uid = deriveAgoraUid(input);
      expect(Number.isInteger(uid)).toBe(true);
      expect(uid).toBeGreaterThan(0);
      expect(uid).toBeLessThanOrEqual(2147483647);
    }
  });
});

describe('decideAccess', () => {
  it('lets an entitled member through', () => {
    expect(
      decideAccess({ caller: caller(), liveClass: liveClass(), canJoin: true, subscription: state('active') })
    ).toBeNull();
  });

  it('lets a member in grace through', () => {
    expect(
      decideAccess({
        caller: caller(),
        liveClass: liveClass(),
        canJoin: true,
        subscription: state('grace', 3, 7),
      })
    ).toBeNull();
  });

  it('lets the class coach through', () => {
    expect(
      decideAccess({
        caller: caller({ id: COACH, role: 'coach', coach_id: null }),
        liveClass: liveClass(),
        canJoin: true,
        subscription: state('staff'),
      })
    ).toBeNull();
  });

  it('returns 403 subscription_required for an expired member of that coach', () => {
    expect(
      decideAccess({
        caller: caller({ id: '99999999-9999-9999-9999-999999999999' }),
        liveClass: liveClass(),
        canJoin: false,
        subscription: state('expired'),
      })
    ).toEqual({ status: 403, error: 'subscription_required' });
  });

  it('returns 403 subscription_required for a member of that coach with no subscription', () => {
    expect(
      decideAccess({ caller: caller(), liveClass: liveClass(), canJoin: false, subscription: state('none') })
    ).toEqual({ status: 403, error: 'subscription_required' });
  });

  it('returns 403 not_entitled for another coach’s member, even with no subscription', () => {
    expect(
      decideAccess({
        caller: caller({ coach_id: OTHER_COACH }),
        liveClass: liveClass(),
        canJoin: false,
        subscription: state('none'),
      })
    ).toEqual({ status: 403, error: 'not_entitled' });
  });

  it('returns 403 not_entitled for a coach who does not own the class', () => {
    expect(
      decideAccess({
        caller: caller({ id: OTHER_COACH, role: 'coach', coach_id: null }),
        liveClass: liveClass(),
        canJoin: false,
        subscription: state('staff'),
      })
    ).toEqual({ status: 403, error: 'not_entitled' });
  });

  it('prefers not_entitled over subscription_required for an outsider', () => {
    // An unaffiliated caller must never be told that paying would have let them in.
    expect(
      decideAccess({
        caller: caller({ coach_id: null }),
        liveClass: liveClass(),
        canJoin: false,
        subscription: state('expired'),
      })?.error
    ).toBe('not_entitled');
  });

  it('returns 409 for an ended or cancelled class even when entitled', () => {
    for (const status of ['ended', 'cancelled']) {
      expect(
        decideAccess({
          caller: caller(),
          liveClass: liveClass({ status }),
          canJoin: true,
          subscription: state('active'),
        })
      ).toEqual({ status: 409, error: 'class_not_joinable' });
    }
  });

  it('still refuses a non-entitled caller on an ended class with 403, not 409', () => {
    expect(
      decideAccess({
        caller: caller(),
        liveClass: liveClass({ status: 'ended' }),
        canJoin: false,
        subscription: state('expired'),
      })
    ).toEqual({ status: 403, error: 'subscription_required' });
  });

  it('never allows on canJoin false, whatever the state claims', () => {
    for (const s of ['active', 'grace', 'staff', 'none', 'expired', 'nonsense']) {
      expect(
        decideAccess({ caller: caller(), liveClass: liveClass(), canJoin: false, subscription: state(s) })
      ).not.toBeNull();
    }
  });
});

describe('entitledState', () => {
  it('passes grace and staff through and treats everything else as active', () => {
    expect(entitledState('grace')).toBe('grace');
    expect(entitledState('staff')).toBe('staff');
    expect(entitledState('active')).toBe('active');
    expect(entitledState('nonsense')).toBe('active');
  });
});

describe('buildSuccessBody', () => {
  const now = new Date('2026-09-19T12:00:00.000Z');

  it('reports mock mode with no token when Agora is not configured', () => {
    expect(
      buildSuccessBody({
        channel: 'dbf-demo-saturday-conditioning',
        uid: 1234,
        appId: null,
        issued: null,
        subscription: state('grace', 3, 7),
      })
    ).toEqual({
      mode: 'mock',
      app_id: null,
      channel: 'dbf-demo-saturday-conditioning',
      uid: 1234,
      token: null,
      expires_at: null,
      subscription: { state: 'grace', days_overdue: 3, grace_days_left: 7 },
    });
  });

  it('reports live mode with the token and its expiry', () => {
    const expiresAt = new Date(now.getTime() + TOKEN_TTL_SECONDS * 1000);
    expect(
      buildSuccessBody({
        channel: 'chan',
        uid: 7,
        appId: 'app-id',
        issued: { token: 'the-token', expiresAt },
        subscription: state('active'),
      })
    ).toEqual({
      mode: 'live',
      app_id: 'app-id',
      channel: 'chan',
      uid: 7,
      token: 'the-token',
      expires_at: '2026-09-19T13:00:00.000Z',
      subscription: { state: 'active', days_overdue: 0, grace_days_left: 0 },
    });
  });
});

describe('readSubscriptionRow', () => {
  it('unwraps the single row PostgREST returns for a set-returning rpc', () => {
    expect(readSubscriptionRow([{ state: 'grace', days_overdue: 3, grace_days_left: 7 }])).toEqual({
      state: 'grace',
      days_overdue: 3,
      grace_days_left: 7,
    });
  });

  it('accepts a bare object too', () => {
    expect(readSubscriptionRow({ state: 'active', days_overdue: 0, grace_days_left: 0 }).state).toBe(
      'active'
    );
  });

  it('falls back to none for an empty or malformed payload', () => {
    for (const payload of [null, undefined, [], 'x', [{ nope: 1 }]]) {
      expect(readSubscriptionRow(payload)).toEqual({ state: 'none', days_overdue: 0, grace_days_left: 0 });
    }
  });
});

// ---------------------------------------------------------------------------
// Round 3 — body-size gate (an 8 MB padded body used to be read and JSON.parsed
// in full, returning 200) and the 404-vs-403 split for a class the caller's RLS
// hides (common.md reserves 404 for a class that does not exist).
// ---------------------------------------------------------------------------

describe('isBodyTooLarge', () => {
  it('caps the body well above the only legitimate payload', () => {
    const legitimate = JSON.stringify({ class_id: CLASS_ID });
    expect(legitimate.length).toBeLessThan(MAX_BODY_BYTES);
    expect(isBodyTooLarge(String(legitimate.length))).toBe(false);
  });

  it('rejects the reproduced 8 MB padded body on its Content-Length alone', () => {
    expect(isBodyTooLarge(String(8_000_063))).toBe(true);
  });

  it('is exclusive at the boundary', () => {
    expect(isBodyTooLarge(String(MAX_BODY_BYTES))).toBe(false);
    expect(isBodyTooLarge(String(MAX_BODY_BYTES + 1))).toBe(true);
  });

  it('also catches bytes actually read when Content-Length is absent (chunked)', () => {
    expect(isBodyTooLarge(null)).toBe(false);
    expect(isBodyTooLarge(null, MAX_BODY_BYTES)).toBe(false);
    expect(isBodyTooLarge(null, MAX_BODY_BYTES + 1)).toBe(true);
    // A lying Content-Length does not excuse an oversized read.
    expect(isBodyTooLarge('10', 8_000_063)).toBe(true);
  });

  it('treats an unparseable or negative Content-Length as unknown, not as zero', () => {
    expect(isBodyTooLarge('not-a-number')).toBe(false);
    expect(isBodyTooLarge('-1')).toBe(false);
    expect(isBodyTooLarge('')).toBe(false);
  });
});

describe('resolveInvisibleClass', () => {
  it('returns 403 not_entitled when the class exists but the caller cannot see it', () => {
    expect(resolveInvisibleClass(true)).toEqual({ status: 403, error: 'not_entitled' });
  });

  it('returns 404 class_not_found when the class really does not exist', () => {
    expect(resolveInvisibleClass(false)).toEqual({ status: 404, error: 'class_not_found' });
  });

  it('never leaks anything beyond the contract’s two refusals', () => {
    for (const exists of [true, false]) {
      const rejection = resolveInvisibleClass(exists);
      expect([403, 404]).toContain(rejection.status);
      expect(['not_entitled', 'class_not_found']).toContain(rejection.error);
    }
  });
});
