import { supabase } from '../../services/supabase/client';
import type { Group } from './groups';
import type { RosterMember } from './roster';

const UNIQUE_VIOLATION = '23505';

export type CommunityGroups = {
  groups: Group[];
  memberGroupIds: string[];
};

export async function getMemberId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

async function requireMemberId(): Promise<string> {
  const memberId = await getMemberId();
  if (!memberId) throw new Error('You need to be signed in.');
  return memberId;
}

export async function fetchGroups(): Promise<CommunityGroups> {
  const memberId = await getMemberId();
  if (!memberId) return { groups: [], memberGroupIds: [] };

  const [groupsResult, membershipsResult] = await Promise.all([
    supabase.from('groups').select('id, name, description').order('name'),
    supabase.from('group_members').select('group_id').eq('member_id', memberId),
  ]);
  if (groupsResult.error) throw groupsResult.error;
  if (membershipsResult.error) throw membershipsResult.error;

  return {
    groups: (groupsResult.data ?? []) as Group[],
    memberGroupIds: (membershipsResult.data ?? []).map((row) => row.group_id as string),
  };
}

// Profiles are self-or-coach under RLS, so fellow members are only reachable through this RPC.
export async function fetchRoster(groupId: string): Promise<RosterMember[]> {
  const { data, error } = await supabase.rpc('get_group_roster', { p_group_id: groupId });
  if (error) throw error;
  return (data ?? []) as RosterMember[];
}

export async function joinGroup(groupId: string): Promise<void> {
  const memberId = await requireMemberId();
  const { error } = await supabase.from('group_members').insert({ group_id: groupId, member_id: memberId });
  // Already a member (e.g. a double tap) is the state the caller wanted.
  if (error && error.code !== UNIQUE_VIOLATION) throw error;
}

export async function leaveGroup(groupId: string): Promise<void> {
  const memberId = await requireMemberId();
  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('member_id', memberId);
  if (error) throw error;
}

export async function blockUser(blockedId: string): Promise<void> {
  const blockerId = await requireMemberId();
  const { error } = await supabase.from('user_blocks').insert({ blocker_id: blockerId, blocked_id: blockedId });
  if (error && error.code !== UNIQUE_VIOLATION) throw error;
}

export async function reportUser(reportedUserId: string, reason: string): Promise<void> {
  const reporterId = await requireMemberId();
  const { error } = await supabase
    .from('moderation_reports')
    .insert({ reporter_id: reporterId, reported_user_id: reportedUserId, reason });
  if (error) throw error;
}
