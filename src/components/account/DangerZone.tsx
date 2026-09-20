import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { deleteAccount, fetchMyMemberCount } from '../../features/account/api';
import type { AccountRole } from '../../features/account/deleteAccount';
import { supabase } from '../../services/supabase/client';
import { DeleteAccountPanel } from './DeleteAccountPanel';

export const MEMBER_COUNT_QUERY_KEY = ['account', 'member-count'] as const;

/**
 * Wires DeleteAccountPanel to the Edge Function, to the coach's member count, and to the
 * sign-out + navigation that has to happen once the account is gone. Kept out of
 * app/(tabs)/profile.tsx so the screen's edit stays a single element.
 *
 * The member count is fetched ONLY after the panel is expanded (`enabled: expanded`): the
 * collapsed danger zone must not add a request to every Profile render, and a member never needs
 * the number at all.
 */
export function DangerZone({ role, onFieldFocus }: { role: AccountRole; onFieldFocus?: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const memberCount = useQuery({
    queryKey: MEMBER_COUNT_QUERY_KEY,
    queryFn: fetchMyMemberCount,
    enabled: expanded && role === 'coach',
    staleTime: 60_000,
  });

  const onDeleted = () => {
    // The account no longer exists, so the local session is meaningless: drop it and every cached
    // row that belonged to it before leaving. The root layout also redirects on the auth-state
    // change; the explicit replace carries `deleted=1` so sign-in can say what happened.
    void (async () => {
      try {
        await supabase.auth.signOut();
      } catch {
        // Signing out against a deleted user can fail; the session is worthless either way.
      }
      queryClient.clear();
      router.replace('/(auth)/sign-in?deleted=1');
    })();
  };

  return (
    <DeleteAccountPanel
      role={role}
      memberCount={role === 'coach' ? (memberCount.data ?? null) : null}
      onOpen={() => setExpanded(true)}
      onFieldFocus={onFieldFocus}
      onDelete={deleteAccount}
      onDeleted={onDeleted}
    />
  );
}
