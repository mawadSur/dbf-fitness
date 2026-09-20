import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type NotesScreenShellProps = {
  title: string;
  children: ReactNode;
  /** Where Back goes when there is no history (deep link / cold start). */
  fallbackHref?: string;
};

/**
 * Screens outside the tab shell draw their own header, so pad for the status bar / notch and keep
 * the Back control a 44pt target. Children own the remaining space (and the bottom inset).
 */
export function NotesScreenShell({ title, children, fallbackHref = '/(tabs)' }: NotesScreenShellProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(fallbackHref);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF', paddingTop: insets.top }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingLeft: Math.max(insets.left, 8),
          paddingRight: Math.max(insets.right, 16),
          paddingVertical: 4,
        }}
      >
        <Pressable
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          android_ripple={{ color: '#D1FAE5', borderless: true }}
          hitSlop={8}
          style={({ pressed }) => ({
            minWidth: 44,
            minHeight: 44,
            paddingHorizontal: 8,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={{ color: '#047857', fontSize: 16, fontWeight: '600' }}>‹ Back</Text>
        </Pressable>
        <Text
          numberOfLines={1}
          accessibilityRole="header"
          style={{ flex: 1, fontSize: 20, fontWeight: '700', color: '#0F172A' }}
        >
          {title}
        </Text>
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}
