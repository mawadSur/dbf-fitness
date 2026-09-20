import { Pressable, Text } from 'react-native';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const CONTAINER: Record<Variant, string> = {
  primary: 'bg-emerald-700',
  secondary: 'border border-slate-300 bg-white',
  danger: 'bg-red-600',
  ghost: 'bg-transparent',
};
const LABEL: Record<Variant, string> = {
  primary: 'text-white',
  secondary: 'text-slate-900',
  danger: 'text-white',
  ghost: 'text-emerald-700',
};
const RIPPLE: Record<Variant, string> = {
  primary: 'rgba(255,255,255,0.25)',
  secondary: 'rgba(15,23,42,0.12)',
  danger: 'rgba(255,255,255,0.25)',
  ghost: 'rgba(5,150,105,0.15)',
};

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  busy?: boolean;
  accessibilityLabel?: string;
  /** Read after the label; use it to say WHY a button is disabled. */
  accessibilityHint?: string;
  className?: string;
};

/** 44pt-minimum button with pressed feedback on iOS (opacity) and Android (ripple). */
export function LiveButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
  accessibilityLabel,
  accessibilityHint,
  className = '',
}: Props) {
  const inactive = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy }}
      android_ripple={{ color: RIPPLE[variant] }}
      className={`min-h-[44px] items-center justify-center overflow-hidden rounded-lg px-4 py-2 active:opacity-80 ${
        disabled ? 'bg-slate-200' : CONTAINER[variant]
      } ${busy ? 'opacity-70' : ''} ${className}`}
    >
      <Text
        className={`text-center text-base font-semibold ${disabled ? 'text-slate-600' : LABEL[variant]}`}
        numberOfLines={2}
      >
        {label}
      </Text>
    </Pressable>
  );
}
