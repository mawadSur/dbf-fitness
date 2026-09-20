import { Pressable, Text } from 'react-native';

export function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      android_ripple={{ color: '#D1FAE5' }}
      hitSlop={8}
      style={({ pressed }) => ({ minHeight: 44, minWidth: 44, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
    >
      <Text style={{ fontSize: 16, fontWeight: '600', color: '#047857' }}>‹ Back</Text>
    </Pressable>
  );
}
