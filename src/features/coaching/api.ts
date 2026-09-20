import { supabase } from '../../services/supabase/client';
import type {
  ChooseCoachErrorCode,
  Coach,
  CoachProfile,
  CoachProfileInput,
  MyCoach,
} from './types';

const KNOWN_CODES = [
  'coach_not_found',
  'coach_not_accepting',
  'not_a_member',
  'not_authenticated',
] as const;

export class ChooseCoachError extends Error {
  readonly code: ChooseCoachErrorCode;
  constructor(code: ChooseCoachErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'ChooseCoachError';
    this.code = code;
  }
}

/** Maps a supabase-js / Postgres error onto the typed choose_coach error codes. */
export function mapChooseCoachError(error: unknown): ChooseCoachError {
  if (error instanceof ChooseCoachError) return error;
  const e = (error ?? {}) as { message?: unknown; code?: unknown; name?: unknown };
  const message = typeof e.message === 'string' ? e.message.trim() : '';
  if (e.code === 'P0001') {
    const known = KNOWN_CODES.find((c) => c === message);
    if (known) return new ChooseCoachError(known);
    return new ChooseCoachError('unknown', message);
  }
  if (
    error instanceof TypeError ||
    /network|fetch|timed? ?out|offline|connection/i.test(message)
  ) {
    return new ChooseCoachError('network', message);
  }
  return new ChooseCoachError('unknown', message);
}

function toStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/**
 * Fail closed on a row without a usable coach_id. `String(undefined)` would yield the
 * literal "undefined", which the UI would happily render and then hand to
 * choose_coach(), producing a confusing `coach_not_found` instead of a clear bug.
 * list_coaches()/get_my_coach() always project profiles.id (a NOT NULL primary key),
 * so this only fires on a genuinely malformed response.
 */
function requireCoachId(v: unknown): string {
  if (typeof v !== 'string' || v.trim() === '') {
    throw new Error('invalid_coach_row: missing coach_id');
  }
  return v;
}

function toCoach(r: Record<string, unknown>): Coach {
  return {
    coachId: requireCoachId(r.coach_id),
    fullName: typeof r.full_name === 'string' ? r.full_name : '',
    bio: typeof r.bio === 'string' ? r.bio : null,
    specialties: toStringArray(r.specialties),
    acceptingMembers: r.accepting_members === true,
    memberCount: typeof r.member_count === 'number' ? r.member_count : 0,
  };
}

export async function fetchCoaches(): Promise<Coach[]> {
  const { data, error } = await supabase.rpc('list_coaches');
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(toCoach);
}

/** The signed-in member's chosen coach, or null when none is chosen. */
export async function fetchMyCoach(): Promise<MyCoach | null> {
  const { data, error } = await supabase.rpc('get_my_coach');
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined;
  if (!row) return null;
  const { memberCount: _unused, ...rest } = toCoach(row);
  void _unused;
  return rest;
}

export async function chooseCoach(coachId: string): Promise<void> {
  let result;
  try {
    result = await supabase.rpc('choose_coach', { p_coach_id: coachId });
  } catch (e) {
    throw mapChooseCoachError(e);
  }
  if (result.error) throw mapChooseCoachError(result.error);
}

async function sessionUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('not_authenticated');
  return id;
}

function toProfile(r: Record<string, unknown>): CoachProfile {
  return {
    coachId: requireCoachId(r.coach_id),
    bio: typeof r.bio === 'string' ? r.bio : '',
    specialties: toStringArray(r.specialties),
    acceptingMembers: r.accepting_members === true,
  };
}

/** The caller's own coach profile, or null if the row does not exist yet. */
export async function fetchMyCoachProfile(): Promise<CoachProfile | null> {
  const userId = await sessionUserId();
  const { data, error } = await supabase
    .from('coach_profiles')
    .select('coach_id, bio, specialties, accepting_members')
    .eq('coach_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ? toProfile(data as Record<string, unknown>) : null;
}

export async function saveMyCoachProfile(input: CoachProfileInput): Promise<CoachProfile> {
  const userId = await sessionUserId();
  const { data, error } = await supabase
    .from('coach_profiles')
    .upsert(
      {
        coach_id: userId,
        // Trimmed to match validateBio()/validateCoachProfile(), which measure and
        // normalize the trimmed value: a bio of 500 chars plus trailing spaces passes
        // validation, so sending it untrimmed would trip the 500-char CHECK in
        // coach_profiles_bio_bounds.
        bio: input.bio.trim(),
        specialties: input.specialties,
        accepting_members: input.acceptingMembers,
      },
      { onConflict: 'coach_id' },
    )
    .select('coach_id, bio, specialties, accepting_members')
    .single();
  if (error) throw error;
  return toProfile(data as Record<string, unknown>);
}
