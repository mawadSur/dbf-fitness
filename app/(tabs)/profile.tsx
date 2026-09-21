import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

import { AppearanceSection } from '../../src/components/account/AppearanceSection';
import { DangerZone } from '../../src/components/account/DangerZone';
import { IdentityHeader } from '../../src/components/account/IdentityHeader';
import { LoadingSkeleton } from '../../src/components/ui/LoadingSkeleton';
import { CurrentCoachCard } from '../../src/components/coaching/CoachCard';
import { ErrorBlock } from '../../src/components/coaching/StateBlock';
import { SubscriptionCard } from '../../src/components/coaching/SubscriptionCard';
import { isStaffRole, useAccount } from '../../src/components/coaching/useAccount';
import {
  Banner,
  Button,
  Card,
  ScreenHeader,
  ScreenShell,
  SectionHeader,
  Text,
} from '../../src/components/ui';
import { useMyCoach } from '../../src/features/coaching/hooks';
import { useSubscriptionState } from '../../src/features/subscriptions/useSubscriptionState';
import { supabase } from '../../src/services/supabase/client';

/** A titled card section. Every section on this screen has the same shape. */
function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card>
      <View style={{ gap: 12 }}>
        <SectionHeader title={title} subtitle={subtitle} />
        {children}
      </View>
    </Card>
  );
}

function MemberSections() {
  const router = useRouter();
  const subscription = useSubscriptionState();
  const myCoach = useMyCoach();

  return (
    <>
      <Section title="Subscription">
        {subscription.isLoading ? (
          <LoadingSkeleton label="Loading subscription" lines={2} heading={false} />
        ) : subscription.isError || !subscription.data ? (
          <ErrorBlock message="Could not load your subscription." onRetry={() => subscription.refetch()} />
        ) : (
          <SubscriptionCard info={subscription.data} />
        )}
      </Section>

      <Section title="Your coach">
        {myCoach.isLoading ? (
          <LoadingSkeleton label="Loading coach" lines={2} heading={false} />
        ) : myCoach.isError ? (
          <ErrorBlock message="Could not load your coach." onRetry={() => myCoach.refetch()} />
        ) : myCoach.data ? (
          <CurrentCoachCard coach={myCoach.data} onChange={() => router.push('/coach/pick')} />
        ) : (
          <View style={{ gap: 12 }}>
            <Text role="bodySm" tone="secondary">
              You have not chosen a coach yet. Pick one to unlock live classes and notes.
            </Text>
            <Button label="Choose your coach" onPress={() => router.push('/coach/pick')} fullWidth />
          </View>
        )}
      </Section>
    </>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
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
    <ScreenShell
      insideTabs
      scroll={false}
      padded={false}
      keyboardAvoiding
      testID="profile"
      header={<ScreenHeader title="Profile" />}
    >
      {/* The screen owns its ScrollView (rather than the shell's) because the danger-zone form has
          to be scrolled above the keyboard by ref when a field takes focus. `ScreenShell` still
          owns the top inset, so scrolled content can never run under the status-bar clock (§6). */}
      <ScrollView
        ref={scrollRef}
        testID="profile-scroll"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 16 }}
      >
        {account.isLoading ? (
          <Card>
            <LoadingSkeleton label="Loading account" lines={2} />
          </Card>
        ) : account.isError || !account.data ? (
          <Card>
            <ErrorBlock message="Could not load your account." onRetry={() => account.refetch()} />
          </Card>
        ) : (
          <IdentityHeader account={account.data} />
        )}

        {isMember ? (
          <MemberSections />
        ) : account.data && isStaffRole(account.data.role) ? (
          <Section title="Coaching" subtitle="How members see you in the picker.">
            <Button
              label="My coach profile"
              variant="secondary"
              trailingIcon="chevron-right"
              onPress={() => router.push('/coach/profile')}
              fullWidth
            />
          </Section>
        ) : null}

        <AppearanceSection />

        <Section title="Account">
          <View style={{ gap: 12 }}>
            {signOutError ? <Banner tone="danger" title={signOutError} /> : null}
            <Button
              label="Sign out"
              variant="secondary"
              leadingIcon="log-out"
              loading={signingOut}
              onPress={signOut}
              fullWidth
            />
          </View>
        </Section>

        {/* Danger zone — in-app account deletion (Apple guideline 5.1.1(v)). It stays collapsed and
            inert until tapped, and only renders once the account (and therefore the role) is known. */}
        {account.data ? (
          <Section title="Danger zone" subtitle="Deleting your account cannot be undone.">
            <DangerZone
              role={account.data.role}
              onFieldFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)}
            />
          </Section>
        ) : null}
      </ScrollView>
    </ScreenShell>
  );
}
