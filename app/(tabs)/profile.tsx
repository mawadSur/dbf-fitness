import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DangerZone } from '../../src/components/account/DangerZone';
import { useAccount, isStaffRole } from '../../src/components/coaching/useAccount';
import { CurrentCoachCard } from '../../src/components/coaching/CoachCard';
import { KEYBOARD_AVOIDING_BEHAVIOR } from '../../src/components/keyboard';
import { Card, ErrorBlock, LoadingBlock, PrimaryButton } from '../../src/components/coaching/StateBlock';
import { SubscriptionCard } from '../../src/components/coaching/SubscriptionCard';
import { useMyCoach } from '../../src/features/coaching/hooks';
import { useSubscriptionState } from '../../src/features/subscriptions/useSubscriptionState';
import { supabase } from '../../src/services/supabase/client';

function MemberSections() {
  const router = useRouter();
  const subscription = useSubscriptionState();
  const myCoach = useMyCoach();
  return (
    <>
            <Card title="Subscription">
              {subscription.isLoading ? (
                <LoadingBlock label="Loading subscription…" />
              ) : subscription.isError || !subscription.data ? (
                <ErrorBlock message="Could not load your subscription." onRetry={() => subscription.refetch()} />
              ) : (
                <SubscriptionCard info={subscription.data} />
              )}
            </Card>

            <Card title="Your coach">
              {myCoach.isLoading ? (
                <LoadingBlock label="Loading coach…" />
              ) : myCoach.isError ? (
                <ErrorBlock message="Could not load your coach." onRetry={() => myCoach.refetch()} />
              ) : myCoach.data ? (
                <CurrentCoachCard coach={myCoach.data} onChange={() => router.push('/coach/pick')} />
              ) : (
                <View style={{ gap: 10 }}>
                  <Text style={{ fontSize: 14, color: '#334155' }}>
                    You have not chosen a coach yet. Pick one to unlock live classes and notes.
                  </Text>
                  <PrimaryButton label="Choose your coach" onPress={() => router.push('/coach/pick')} />
                </View>
              )}
            </Card>
    </>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const account = useAccount();
  const isMember = account.data?.role === 'member';
  const scrollRef = useRef<ScrollView>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        account.refetch(),
        ...(isMember
          ? [
              queryClient.refetchQueries({ queryKey: ['subscription'] }),
              queryClient.refetchQueries({ queryKey: ['coaching', 'my-coach'] }),
            ]
          : []),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const signOut = async () => {
    setSigningOut(true);
    setSignOutError(null);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      queryClient.clear();
      router.replace('/(auth)/sign-in');
    } catch {
      setSignOutError('Could not sign out. Check your connection and try again.');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#F8FAFC' }} behavior={KEYBOARD_AVOIDING_BEHAVIOR}>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 32,
          paddingHorizontal: 16,
          gap: 16,
        }}
      >
        <Text accessibilityRole="header" style={{ fontSize: 28, fontWeight: '800', color: '#0F172A' }}>
          Profile
        </Text>

        <Card title="Account">
          {account.isLoading ? (
            <LoadingBlock label="Loading account…" />
          ) : account.isError || !account.data ? (
            <ErrorBlock message="Could not load your account." onRetry={() => account.refetch()} />
          ) : (
            <View style={{ gap: 4 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#0F172A' }}>{account.data.fullName}</Text>
              <Text style={{ fontSize: 14, color: '#475569', textTransform: 'capitalize' }}>{account.data.role}</Text>
              {account.data.email ? (
                <Text style={{ fontSize: 14, color: '#334155' }}>{account.data.email}</Text>
              ) : null}
            </View>
          )}
        </Card>

        {isMember ? (
          <MemberSections />
        ) : account.data && isStaffRole(account.data.role) ? (
          <Card title="Coaching">
            <PrimaryButton label="My coach profile" variant="outline" onPress={() => router.push('/coach/profile')} />
          </Card>
        ) : null}

        {/* Danger zone — in-app account deletion (Apple guideline 5.1.1(v)). Everything it needs
            lives in src/components/account/; it stays collapsed and inert until tapped, and only
            renders once the account (and therefore the role) is known. */}
        {account.data ? (
          <Card title="Danger zone">
            <DangerZone
              role={account.data.role}
              onFieldFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)}
            />
          </Card>
        ) : null}

        <View style={{ gap: 8 }}>
          {signOutError ? (
            <Text accessibilityRole="alert" style={{ color: '#B91C1C', fontSize: 14 }}>
              {signOutError}
            </Text>
          ) : null}
          <PrimaryButton label="Sign out" variant="outline" busy={signingOut} onPress={signOut} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
