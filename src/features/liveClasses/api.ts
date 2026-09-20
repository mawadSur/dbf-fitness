import { Platform } from 'react-native';

import { supabase } from '../../services/supabase/client';
import { generateChannelName } from './scheduleForm';
import type { LiveClassStatus } from './status';

const INVALID_UUID = '22P02';

export type LiveClass = {
  id: string;
  title: string;
  starts_at: string;
  status: LiveClassStatus;
  agora_channel_name: string;
  coach_id: string;
};

export type CurrentMember = {
  id: string;
  fullName: string;
  role: 'member' | 'coach' | 'admin';
};

const LIVE_CLASS_COLUMNS = 'id, title, starts_at, status, agora_channel_name, coach_id';

export async function fetchUpcomingLiveClasses(): Promise<LiveClass[]> {
  const { data, error } = await supabase
    .from('live_classes')
    .select(LIVE_CLASS_COLUMNS)
    .in('status', ['scheduled', 'live'])
    .order('starts_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as LiveClass[];
}

/** Null when there is no such class (including a malformed id in the URL). */
export async function fetchLiveClass(classId: string): Promise<LiveClass | null> {
  const { data, error } = await supabase
    .from('live_classes')
    .select(LIVE_CLASS_COLUMNS)
    .eq('id', classId)
    .maybeSingle();
  if (error) {
    if (error.code === INVALID_UUID) return null;
    throw error;
  }
  return (data as LiveClass | null) ?? null;
}

/** The signed-in user with their own profile row (profiles are self-or-coach under RLS). */
export async function fetchCurrentMember(): Promise<CurrentMember | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id as string, fullName: data.full_name as string, role: data.role as CurrentMember['role'] };
}

export async function upsertPushToken(userId: string, expoPushToken: string): Promise<void> {
  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      { user_id: userId, expo_push_token: expoPushToken, platform: Platform.OS },
      { onConflict: 'user_id,expo_push_token' }
    );
  if (error) throw error;
}

export async function recordJoin(classId: string, memberId: string): Promise<void> {
  const { error } = await supabase
    .from('live_class_participants')
    .upsert(
      { live_class_id: classId, member_id: memberId, joined_at: new Date().toISOString(), left_at: null },
      { onConflict: 'live_class_id,member_id' }
    );
  if (error) throw error;
}

export async function recordLeave(classId: string, memberId: string): Promise<void> {
  const { error } = await supabase
    .from('live_class_participants')
    .update({ left_at: new Date().toISOString() })
    .eq('live_class_id', classId)
    .eq('member_id', memberId);
  if (error) throw error;
}

const UNIQUE_VIOLATION = '23505';
const CHANNEL_NAME_ATTEMPTS = 3;

/** Coach-side: schedules a class (status 'scheduled'). Retries when the random channel name collides. */
export async function createLiveClass(input: {
  coachId: string;
  title: string;
  startsAt: Date;
}): Promise<LiveClass> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < CHANNEL_NAME_ATTEMPTS; attempt += 1) {
    const { data, error } = await supabase
      .from('live_classes')
      .insert({
        coach_id: input.coachId,
        title: input.title,
        starts_at: input.startsAt.toISOString(),
        status: 'scheduled',
        agora_channel_name: generateChannelName(input.coachId),
      })
      .select(LIVE_CLASS_COLUMNS)
      .single();
    if (!error) return data as LiveClass;
    if (error.code !== UNIQUE_VIOLATION) throw error;
    lastError = error;
  }
  throw lastError;
}

/** Coach-side: moves a class to a new status. RLS limits this to the class's own coach. */
export async function updateLiveClassStatus(classId: string, status: LiveClassStatus): Promise<void> {
  const { data, error } = await supabase
    .from('live_classes')
    .update({ status })
    .eq('id', classId)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('Could not update this class.');
}

export type ClassAttendee = { memberId: string; fullName: string; joinedAt: string | null; leftAt: string | null };

/** Coach-side attendee list: everyone who joined (RLS: participants are visible to the class's coach). */
export async function fetchClassAttendees(classId: string): Promise<ClassAttendee[]> {
  const { data, error } = await supabase
    .from('live_class_participants')
    .select('member_id, joined_at, left_at')
    .eq('live_class_id', classId)
    .order('joined_at', { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as { member_id: string; joined_at: string | null; left_at: string | null }[];
  if (rows.length === 0) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', rows.map((row) => row.member_id));
  if (profilesError) throw profilesError;
  const names = new Map((profiles ?? []).map((profile) => [profile.id as string, profile.full_name as string]));

  return rows.map((row) => ({
    memberId: row.member_id,
    fullName: names.get(row.member_id) ?? 'Member',
    joinedAt: row.joined_at,
    leftAt: row.left_at,
  }));
}
