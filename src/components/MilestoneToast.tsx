import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { milestoneTiers } from '../theme/tokens';
import type { MilestoneTier } from '../theme/tokens';

const AUTO_DISMISS_MS = 4000;

type MilestoneToastProps = {
  tier: MilestoneTier;
  visible: boolean;
  onDismiss: () => void;
};

export function MilestoneToast({ tier, visible, onDismiss }: MilestoneToastProps) {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!visible) return;

    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [visible, onDismiss]);

  if (!visible) return null;

  const { label, color } = milestoneTiers[tier];

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className="absolute inset-x-4 z-10 flex-row items-center justify-between rounded-xl border bg-white px-4 py-3 shadow-md"
      style={{ borderColor: color, top: insets.top + 8 }}
    >
      <View className="flex-1 pr-3">
        <Text className="text-xs font-semibold uppercase tracking-wide" style={{ color }}>
          Milestone unlocked
        </Text>
        <Text numberOfLines={2} className="mt-0.5 text-base font-bold text-slate-900">
          {label}
        </Text>
      </View>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        android_ripple={{ color: '#E2E8F0', borderless: true }}
        className="min-h-[44px] min-w-[44px] items-center justify-center"
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
      >
        <Text className="text-sm font-semibold text-slate-600">Dismiss</Text>
      </Pressable>
    </View>
  );
}
