import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Fixed action bar that clears the home indicator / Android gesture bar. */
export function BottomActionBar({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: '#E2E8F0',
        backgroundColor: '#FFFFFF',
        paddingTop: 12,
        paddingHorizontal: Math.max(insets.left, 16),
        paddingBottom: Math.max(insets.bottom, 12),
        gap: 8,
      }}
    >
      {children}
    </View>
  );
}
