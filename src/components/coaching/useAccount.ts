import { useQuery } from '@tanstack/react-query';

import { supabase } from '../../services/supabase/client';

export type Account = {
  id: string;
  email: string | null;
  fullName: string;
  role: 'member' | 'coach' | 'admin';
};

export const ACCOUNT_QUERY_KEY = ['account', 'me'] as const;

export async function fetchAccount(): Promise<Account> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) throw new Error('not_authenticated');
  const { data, error } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw error;
  const row = (data ?? {}) as { full_name?: unknown; role?: unknown };
  const role = row.role === 'coach' || row.role === 'admin' ? row.role : 'member';
  return {
    id: user.id,
    email: user.email ?? null,
    fullName: typeof row.full_name === 'string' && row.full_name ? row.full_name : (user.email ?? 'Member'),
    role,
  };
}

export function useAccount() {
  return useQuery<Account>({ queryKey: ACCOUNT_QUERY_KEY, queryFn: fetchAccount });
}

export const isStaffRole = (role: Account['role']) => role === 'coach' || role === 'admin';
