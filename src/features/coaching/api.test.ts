import { supabase } from '../../services/supabase/client';
import {
  ChooseCoachError,
  chooseCoach,
  fetchCoaches,
  fetchMyCoach,
  fetchMyCoachProfile,
  mapChooseCoachError,
  saveMyCoachProfile,
} from './api';

jest.mock('../../services/supabase/client', () => ({
  supabase: { rpc: jest.fn(), from: jest.fn(), auth: { getSession: jest.fn() } },
}));

const rpc = supabase.rpc as unknown as jest.Mock;
const from = supabase.from as unknown as jest.Mock;
const getSession = supabase.auth.getSession as unknown as jest.Mock;

beforeEach(() => {
  jest.resetAllMocks();
  getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
});

describe('mapChooseCoachError', () => {
  it.each(['coach_not_found', 'coach_not_accepting', 'not_a_member', 'not_authenticated'])(
    'maps P0001 %s',
    (message) => {
      const e = mapChooseCoachError({ code: 'P0001', message });
      expect(e).toBeInstanceOf(ChooseCoachError);
      expect(e.code).toBe(message);
    },
  );
  it('maps unrecognized P0001 message to unknown', () => {
    expect(mapChooseCoachError({ code: 'P0001', message: 'boom' }).code).toBe('unknown');
  });
  it('does not trust a known message without the P0001 code', () => {
    expect(mapChooseCoachError({ code: '42501', message: 'not_a_member' }).code).toBe('unknown');
  });
  it('maps non-Postgres error to unknown', () => {
    expect(mapChooseCoachError({ message: 'weird' }).code).toBe('unknown');
    expect(mapChooseCoachError(null).code).toBe('unknown');
    expect(mapChooseCoachError('x').code).toBe('unknown');
  });
  it('maps network failures', () => {
    expect(mapChooseCoachError(new TypeError('Failed to fetch')).code).toBe('network');
    expect(mapChooseCoachError({ message: 'Network request failed' }).code).toBe('network');
  });
});

describe('chooseCoach', () => {
  it('calls the RPC with p_coach_id', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(chooseCoach('c1')).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith('choose_coach', { p_coach_id: 'c1' });
  });
  it('throws typed error for RPC error', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'coach_not_accepting' } });
    await expect(chooseCoach('c1')).rejects.toMatchObject({ code: 'coach_not_accepting' });
  });
  it('throws network error when the call rejects', async () => {
    rpc.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(chooseCoach('c1')).rejects.toMatchObject({ code: 'network' });
  });
});

describe('fetchCoaches / fetchMyCoach', () => {
  it('maps rows', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          coach_id: 'c1',
          full_name: 'Dana',
          bio: null,
          specialties: ['yoga'],
          accepting_members: true,
          member_count: 3,
        },
      ],
      error: null,
    });
    await expect(fetchCoaches()).resolves.toEqual([
      {
        coachId: 'c1',
        fullName: 'Dana',
        bio: null,
        specialties: ['yoga'],
        acceptingMembers: true,
        memberCount: 3,
      },
    ]);
    expect(rpc).toHaveBeenCalledWith('list_coaches');
  });
  it('throws on error', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('x') });
    await expect(fetchCoaches()).rejects.toThrow('x');
    await expect(fetchMyCoach()).rejects.toThrow('x');
  });
  it('returns null when no coach', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await expect(fetchMyCoach()).resolves.toBeNull();
  });
  it('fails closed on a row with no coach_id instead of coercing to "undefined"', async () => {
    rpc.mockResolvedValue({
      data: [{ full_name: 'Dana', bio: null, specialties: [], accepting_members: true, member_count: 0 }],
      error: null,
    });
    await expect(fetchCoaches()).rejects.toThrow('invalid_coach_row');
    rpc.mockResolvedValue({ data: [{ coach_id: '', full_name: 'Dana' }], error: null });
    await expect(fetchMyCoach()).rejects.toThrow('invalid_coach_row');
  });
  it('maps the single row without memberCount', async () => {
    rpc.mockResolvedValue({
      data: [{ coach_id: 'c1', full_name: 'Dana', bio: 'b', specialties: null, accepting_members: false }],
      error: null,
    });
    await expect(fetchMyCoach()).resolves.toEqual({
      coachId: 'c1',
      fullName: 'Dana',
      bio: 'b',
      specialties: [],
      acceptingMembers: false,
    });
  });
});

describe('coach profile', () => {
  it('fetches own row by session user', async () => {
    const maybeSingle = jest.fn().mockResolvedValue({
      data: { coach_id: 'u1', bio: 'hi', specialties: ['a'], accepting_members: true },
      error: null,
    });
    const eq = jest.fn().mockReturnValue({ maybeSingle });
    const select = jest.fn().mockReturnValue({ eq });
    from.mockReturnValue({ select });
    await expect(fetchMyCoachProfile()).resolves.toEqual({
      coachId: 'u1',
      bio: 'hi',
      specialties: ['a'],
      acceptingMembers: true,
    });
    expect(from).toHaveBeenCalledWith('coach_profiles');
    expect(eq).toHaveBeenCalledWith('coach_id', 'u1');
  });
  it('returns null when no row and rejects when signed out', async () => {
    const maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle }) }) });
    await expect(fetchMyCoachProfile()).resolves.toBeNull();
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(fetchMyCoachProfile()).rejects.toThrow('not_authenticated');
  });
  it('upserts on coach_id', async () => {
    const single = jest.fn().mockResolvedValue({
      data: { coach_id: 'u1', bio: 'x', specialties: [], accepting_members: false },
      error: null,
    });
    const select = jest.fn().mockReturnValue({ single });
    const upsert = jest.fn().mockReturnValue({ select });
    from.mockReturnValue({ upsert });
    await saveMyCoachProfile({ bio: 'x', specialties: [], acceptingMembers: false });
    expect(upsert).toHaveBeenCalledWith(
      { coach_id: 'u1', bio: 'x', specialties: [], accepting_members: false },
      { onConflict: 'coach_id' },
    );
  });
  it('sends the trimmed bio so it cannot overflow the 500-char CHECK', async () => {
    const single = jest.fn().mockResolvedValue({
      data: { coach_id: 'u1', bio: 'a'.repeat(500), specialties: [], accepting_members: true },
      error: null,
    });
    const upsert = jest.fn().mockReturnValue({ select: () => ({ single }) });
    from.mockReturnValue({ upsert });
    await saveMyCoachProfile({
      bio: `  ${'a'.repeat(500)}\n `,
      specialties: [],
      acceptingMembers: true,
    });
    expect(upsert).toHaveBeenCalledWith(
      { coach_id: 'u1', bio: 'a'.repeat(500), specialties: [], accepting_members: true },
      { onConflict: 'coach_id' },
    );
  });
  it('throws upsert errors', async () => {
    const single = jest.fn().mockResolvedValue({ data: null, error: new Error('rls') });
    from.mockReturnValue({ upsert: () => ({ select: () => ({ single }) }) });
    await expect(
      saveMyCoachProfile({ bio: '', specialties: [], acceptingMembers: true }),
    ).rejects.toThrow('rls');
  });
});
