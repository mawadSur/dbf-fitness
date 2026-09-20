import { ActivityIndicator, Platform, Text, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from '../../theme/tokens';
import { PressableBase } from '../ui/PressableBase';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

type NotesButtonProps = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  busy?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

const VARIANTS: Record<Variant, { background: string; text: string; border: string; ripple: string }> = {
  // #047857 (not colors.primary #059669): white text on #059669 is only 3.8:1; on #047857 it is 5.5:1.
  primary: { background: '#047857', text: '#FFFFFF', border: '#047857', ripple: '#065F46' },
  secondary: { background: '#FFFFFF', text: '#0F172A', border: colors.border, ripple: '#E2E8F0' },
  danger: { background: '#FFFFFF', text: '#B91C1C', border: '#FCA5A5', ripple: '#FEE2E2' },
  ghost: { background: 'transparent', text: '#047857', border: 'transparent', ripple: '#D1FAE5' },
};

/** 48pt-tall button with pressed feedback, an Android ripple and a busy state that blocks re-taps. */
export function NotesButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
  accessibilityLabel,
  style,
}: NotesButtonProps) {
  const palette = VARIANTS[variant];
  const inactive = disabled || busy;

  return (
    <PressableBase
      onPress={inactive ? undefined : onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy }}
      android_ripple={{ color: palette.ripple }}
      pressFeedback={inactive ? 'none' : 0.8}
      // Layout NEVER goes in a style callback — see `PressableBase`.
      style={[
        {
          minHeight: 48,
          minWidth: 48,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: palette.border,
          backgroundColor: palette.background,
          paddingHorizontal: 16,
          paddingVertical: 12,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
          overflow: Platform.OS === 'android' ? 'hidden' : 'visible',
          opacity: inactive ? 0.55 : 1,
        },
        style,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={palette.text} /> : null}
      <Text style={{ color: palette.text, fontSize: 16, fontWeight: '600' }}>{label}</Text>
    </PressableBase>
  );
}
