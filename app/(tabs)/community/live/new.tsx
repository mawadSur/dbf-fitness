import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LiveButton } from '../../../../src/components/live/LiveButton';
import { ScheduleClassForm } from '../../../../src/components/live/ScheduleClassForm';
import { fetchCurrentMember } from '../../../../src/features/liveClasses/api';

/** Coach/admin only: schedule a new live class. */
export default function ScheduleClassScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const memberQuery = useQuery({ queryKey: ['liveClasses', 'me'], queryFn: fetchCurrentMember });
  const member = memberQuery.data ?? null;

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/community/live'));

  if (memberQuery.isLoading) {
    return (
      <View className="flex-1 bg-white px-4" style={{ paddingTop: insets.top + 8 }}>
        <ActivityIndicator color="#059669" />
      </View>
    );
  }

  if (memberQuery.isError) {
    return (
      <View className="flex-1 gap-3 bg-white px-4" style={{ paddingTop: insets.top + 8 }}>
        <LiveButton label="‹ Back" variant="ghost" onPress={goBack} className="self-start" accessibilityLabel="Back to live classes" />
        <Text className="text-sm text-red-700">Could not load your profile.</Text>
        <LiveButton label="Try again" variant="secondary" onPress={() => void memberQuery.refetch()} />
      </View>
    );
  }

  if (!member || (member.role !== 'coach' && member.role !== 'admin')) {
    return (
      <View className="flex-1 gap-3 bg-white px-4" style={{ paddingTop: insets.top + 8 }}>
        <LiveButton label="‹ Back" variant="ghost" onPress={goBack} className="self-start" accessibilityLabel="Back to live classes" />
        <Text className="text-lg font-bold text-slate-900">Coaches only</Text>
        <Text className="text-sm text-slate-600">Only coaches can schedule live classes.</Text>
      </View>
    );
  }

  return (
    <ScheduleClassForm
      coachId={member.id}
      onBack={goBack}
      onCreated={(created) => router.replace(`/community/live/${created.id}`)}
    />
  );
}
