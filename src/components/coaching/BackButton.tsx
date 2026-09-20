import { Text } from 'react-native';

import { PressableBase } from '../ui/PressableBase';

export function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <PressableBase
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      android_ripple={{ color: '#D1FAE5' }}
      hitSlop={8}
      pressFeedback={0.6}
      // Layout NEVER goes in a style callback — see `PressableBase`.
      style={{ minHeight: 44, minWidth: 44, justifyContent: 'center' }}
    >
      <Text style={{ fontSize: 16, fontWeight: '600', color: '#047857' }}>‹ Back</Text>
    </PressableBase>
  );
}
