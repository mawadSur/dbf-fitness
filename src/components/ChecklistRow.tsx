import { Pressable, Text, View } from 'react-native';

import { colors } from '../theme/tokens';

type ChecklistRowProps = {
  label: string;
  sublabel?: string;
  checked: boolean;
  onToggle: () => void;
  onPress?: () => void;
};

export function ChecklistRow({ label, sublabel, checked, onToggle, onPress }: ChecklistRowProps) {
  return (
    <View className="flex-row items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 pr-4">
      {/* 44x44 hit area around a 24pt visual checkbox. */}
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        accessibilityState={{ checked }}
        android_ripple={{ color: colors.primaryMuted, borderless: true }}
        className="h-11 w-11 items-center justify-center"
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
      >
        <View
          className="h-6 w-6 items-center justify-center rounded-md border-2"
          style={{
            borderColor: checked ? colors.primaryStrong : colors.border,
            backgroundColor: checked ? colors.primaryStrong : colors.background,
          }}
        >
          {checked ? <Text className="text-xs font-bold text-white">✓</Text> : null}
        </View>
      </Pressable>

      <Pressable
        className="min-h-[44px] flex-1 justify-center py-2"
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={onPress ? `${label}, details` : undefined}
        android_ripple={onPress ? { color: colors.primaryMuted } : undefined}
        style={({ pressed }) => ({ opacity: pressed && onPress ? 0.6 : 1 })}
      >
        <Text
          numberOfLines={2}
          className={`text-base font-medium ${checked ? 'text-slate-500 line-through' : 'text-slate-900'}`}
        >
          {label}
        </Text>
        {sublabel ? (
          <Text numberOfLines={2} className="text-xs text-slate-600">
            {sublabel}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
}
