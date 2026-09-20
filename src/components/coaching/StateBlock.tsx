import { ActivityIndicator, Pressable, Text, View } from 'react-native';

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
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Retry"
          android_ripple={{ color: '#FECACA' }}
          style={({ pressed }) => ({
            minHeight: 44,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 10,
            borderWidth: 1,
            borderColor: '#B91C1C',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ fontWeight: '600', color: '#B91C1C' }}>Retry</Text>
        </Pressable>
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
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy: !!busy }}
      android_ripple={{ color: '#A7F3D0' }}
      style={({ pressed }) => ({
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
        backgroundColor: solid ? (off ? '#6EE7B7' : '#047857') : 'transparent',
        borderWidth: solid ? 0 : 1,
        borderColor: '#047857',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {busy ? (
        <ActivityIndicator color={solid ? '#FFFFFF' : '#047857'} />
      ) : (
        <Text style={{ fontWeight: '600', color: solid ? '#FFFFFF' : '#047857' }}>{label}</Text>
      )}
    </Pressable>
  );
}
