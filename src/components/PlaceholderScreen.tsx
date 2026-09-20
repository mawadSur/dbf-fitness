import { Text, View } from 'react-native';

type PlaceholderScreenProps = {
  title: string;
  description: string;
};

export function PlaceholderScreen({ title, description }: PlaceholderScreenProps) {
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-white px-6">
      <Text accessibilityRole="header" className="text-2xl font-bold text-slate-900">
        {title}
      </Text>
      <Text className="text-center text-base text-slate-600">{description}</Text>
    </View>
  );
}
