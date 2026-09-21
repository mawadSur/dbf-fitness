import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { friendlyErrorFromMany } from '../../src/components/friendlyError';
import { MemberHome } from '../../src/components/home/MemberHome';
import { StaffHome } from '../../src/components/home/StaffHome';
import { Banner, Button, ScreenHeader, ScreenShell } from '../../src/components/ui';
import { useMyCoach } from '../../src/features/coaching';
import {
  greeting,
  isStaffRole,
  memberHomePrimary,
  type ProfileRole,
} from '../../src/features/workouts/homeState';
import { fetchPlanOverview } from '../../src/features/workouts/queries';
import { useDelayedVisible } from '../../src/components/ui/useDelayedVisible';
import { supabase } from '../../src/services/supabase/client';

export default function HomeScreen() {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [isSessionReady, setIsSessionReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
      setIsSessionReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
      setIsSessionReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const profileQuery = useQuery({
    queryKey: ['profile', userId],
    queryFn: async () => {
      if (!userId) throw new Error('Missing session');
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', userId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const statsQuery = useQuery({
    queryKey: ['workout', 'stats', userId],
    queryFn: async () => {
      if (!userId) throw new Error('Missing session');
      const { data, error } = await supabase
        .from('member_workout_stats')
        .select('*')
        .eq('member_id', userId)
        // The view is members-only: coaches/admins legitimately have no row (not an error).
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const planQuery = useQuery({
    queryKey: ['workout', 'today', userId],
    queryFn: () => fetchPlanOverview(userId),
    enabled: !!userId,
  });

  // Only members have a coach: don't fire the request for coaches/admins (or before the role is known).
  const role = (profileQuery.data?.role ?? null) as ProfileRole | null;
  const myCoachQuery = useMyCoach({ enabled: role === 'member' });
  const isStaff = isStaffRole(role);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        profileQuery.refetch(),
        statsQuery.refetch(),
        planQuery.refetch(),
        ...(role === 'member' ? [myCoachQuery.refetch()] : []),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const hasCoach = myCoachQuery.isSuccess ? myCoachQuery.data !== null : undefined;
  const primary = memberHomePrimary({
    role,
    hasCoach,
    plan: planQuery.data?.snapshot,
  });
  const loadError = profileQuery.isError || statsQuery.isError || planQuery.isError;
  const isFirstLoad = !isSessionReady || !userId || primary.kind === 'loading';
  const showSkeleton = useDelayedVisible(isFirstLoad);

  return (
    <ScreenShell
      insideTabs
      refreshing={isRefreshing}
      onRefresh={handleRefresh}
      testID="home"
      header={
        // Staff get their h1 inside the HeroPanel below, so the screen keeps
        // exactly one h1 whichever branch renders.
        isStaff ? undefined : (
          <ScreenHeader title={greeting(profileQuery.data?.full_name, role)} eyebrow="Today" />
        )
      }
    >
      <View style={{ gap: 24, paddingTop: 8 }}>
        {loadError ? (
          <View style={{ gap: 12 }}>
            <Banner
              tone="danger"
              title="Some of your info could not be loaded."
              message={friendlyErrorFromMany(
                [profileQuery.error, statsQuery.error, planQuery.error],
                'Pull down to refresh, or try again.',
              )}
            />
            <Button
              label="Try again"
              variant="secondary"
              onPress={handleRefresh}
              loading={isRefreshing}
              testID="home-retry"
            />
          </View>
        ) : null}

        {isStaff && role ? (
          <StaffHome
            role={role as 'coach' | 'admin'}
            greetingText={greeting(profileQuery.data?.full_name, role)}
            onOpen={(href) => router.push(href)}
          />
        ) : (
          <MemberHome
            primary={primary}
            currentStreak={statsQuery.isSuccess ? (statsQuery.data?.current_streak ?? 0) : null}
            showSkeleton={showSkeleton}
            onStartDay={(dayId) => router.push(`/workout/${dayId}`)}
            onPickCoach={() => router.push('/coach/pick')}
            onOpen={(href) => router.push(href)}
          />
        )}
      </View>
    </ScreenShell>
  );
}
