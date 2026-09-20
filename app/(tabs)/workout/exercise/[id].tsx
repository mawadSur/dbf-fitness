import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '../../../../src/services/supabase/client';
import { colors } from '../../../../src/theme/tokens';

type ExerciseDetail = {
  name: string;
  repsOrDuration: string;
  detail: string | null;
};

async function fetchExercise(exerciseId: string): Promise<ExerciseDetail> {
  const { data, error } = await supabase
    .from('exercises')
    .select('name, reps_or_duration, detail')
    .eq('id', exerciseId)
    .single();
  if (error) throw error;

  return {
    name: data.name,
    repsOrDuration: data.reps_or_duration,
    detail: data.detail,
  };
}

function BackLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      android_ripple={{ color: colors.primaryMuted }}
      className="min-h-[44px] justify-center self-start pr-4"
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <Text className="text-base font-semibold text-emerald-700">{label}</Text>
    </Pressable>
  );
}

export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['workout', 'exercise', id],
    queryFn: () => fetchExercise(id),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View className="flex-1 bg-white px-6" style={{ paddingTop: insets.top + 8 }}>
        <BackLink label="‹ Back" onPress={() => router.back()} />
        <View className="flex-1 items-center justify-center gap-2">
          <Text accessibilityRole="alert" className="text-center text-base text-red-700">
            {error instanceof Error ? error.message : 'Could not load this exercise.'}
          </Text>
          <Pressable
            onPress={() => refetch()}
            accessibilityRole="button"
            accessibilityLabel="Try again"
            android_ripple={{ color: colors.primaryMuted }}
            className="min-h-[44px] items-center justify-center px-4"
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Text className="text-base font-semibold text-emerald-700">Try again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerClassName="gap-4 px-6 pb-10"
      contentContainerStyle={{
        paddingTop: insets.top + 8,
        paddingBottom: insets.bottom + 24,
      }}
    >
      <BackLink label="‹ Back" onPress={() => router.back()} />

      <View className="gap-1">
        <Text accessibilityRole="header" className="text-2xl font-bold text-slate-900">
          {data.name}
        </Text>
        <Text className="text-base text-slate-600">{data.repsOrDuration}</Text>
      </View>

      {data.detail ? (
        <Text className="text-base text-slate-700">{data.detail}</Text>
      ) : (
        <Text className="text-base text-slate-600">No additional detail for this exercise.</Text>
      )}
    </ScrollView>
  );
}
