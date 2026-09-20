import { ActivityIndicator, Text, View } from 'react-native';
import { PressableBase } from '../ui/PressableBase';

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={{ padding: 24, alignItems: 'center', gap: 8 }}
    >
      <ActivityIndicator color="#047857" />
      <Text style={{ color: '#475569' }}>{label}</Text>
    </View>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={{ padding: 16, gap: 10, borderRadius: 12, backgroundColor: '#FEF2F2' }}>
      <Text accessibilityRole="alert" style={{ color: '#B91C1C', fontSize: 14 }}>
        {message}
      </Text>
      {onRetry ? (
        <PressableBase
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Retry"
          android_ripple={{ color: '#FECACA' }}
          pressFeedback={0.7}
          // Layout NEVER goes in a style callback — see `PressableBase`.
          style={{
            minHeight: 44,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 10,
            borderWidth: 1,
            borderColor: '#B91C1C',
          }}
        >
          <Text style={{ fontWeight: '600', color: '#B91C1C' }}>Retry</Text>
        </PressableBase>
      ) : null}
    </View>
  );
}

export function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 16,
        backgroundColor: '#FFFFFF',
        padding: 16,
        gap: 12,
      }}
    >
      {title ? (
        <Text accessibilityRole="header" style={{ fontSize: 13, fontWeight: '700', color: '#475569', textTransform: 'uppercase' }}>
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  busy,
  disabled,
  variant = 'solid',
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  variant?: 'solid' | 'outline';
}) {
  const off = !!disabled || !!busy;
  const solid = variant === 'solid';
  return (
    <PressableBase
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy: !!busy }}
      android_ripple={{ color: '#A7F3D0' }}
      pressFeedback={0.8}
      // Layout NEVER goes in a style callback — see `PressableBase`.
      style={{
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
        backgroundColor: solid ? (off ? '#6EE7B7' : '#047857') : 'transparent',
        borderWidth: solid ? 0 : 1,
        borderColor: '#047857',
      }}
    >
      {busy ? (
        <ActivityIndicator color={solid ? '#FFFFFF' : '#047857'} />
      ) : (
        <Text style={{ fontWeight: '600', color: solid ? '#FFFFFF' : '#047857' }}>{label}</Text>
      )}
    </PressableBase>
  );
}
