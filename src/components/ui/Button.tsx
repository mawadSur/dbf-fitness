import { ActivityIndicator, Platform, View, type StyleProp, type ViewStyle } from 'react-native';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import type { ThemeColors } from '../../theme/tokens';
import { Icon } from './Icon';
import type { IconName } from './icons';
import { BUTTON_HEIGHT, hitSlopFor, type ButtonSize } from './layout';
import { PressableBase } from './PressableBase';
import { Text } from './Typography';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  leadingIcon?: IconName;
  trailingIcon?: IconName;
  fullWidth?: boolean;
  /** Defaults to `label`; set it when the label alone is ambiguous. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

type Skin = { background: string; content: string; border: string | null; ripple: string };

function skinFor(variant: ButtonVariant, colors: ThemeColors): Skin {
  switch (variant) {
    case 'secondary':
      return { background: 'transparent', content: colors.text, border: colors.text, ripple: colors.bgSoft };
    case 'ghost':
      return {
        background: 'transparent',
        content: colors.textSecondary,
        border: null,
        ripple: colors.bgSoft,
      };
    case 'danger':
      // The status *background* token is the readable foreground on the status fill.
      return { background: colors.danger, content: colors.dangerBg, border: null, ripple: colors.dangerBg };
    case 'primary':
    default:
      return { background: colors.cta, content: colors.onCta, border: null, ripple: colors.brand };
  }
}

const ICON_SIZE = { sm: 16, md: 20, lg: 20 } as const;
const H_PADDING = { sm: 16, md: 24, lg: 24 } as const;

/** Design system §5. `disabled` and `loading` both block the press and are announced. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  leadingIcon,
  trailingIcon,
  fullWidth = false,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: ButtonProps) {
  const { colors, tokens } = useOptionalTheme();
  const skin = skinFor(variant, colors);
  const height = BUTTON_HEIGHT[size];
  const inert = disabled || loading;

  return (
    <PressableBase
      onPress={inert ? undefined : onPress}
      disabled={inert}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inert, busy: loading }}
      hitSlop={hitSlopFor(height, Platform.OS)}
      android_ripple={inert ? undefined : { color: skin.ripple }}
      // Layout NEVER goes in a style callback — see `PressableBase`.
      pressFeedback={inert ? 'none' : 'ds'}
      style={[
        {
          minHeight: height,
          paddingHorizontal: H_PADDING[size],
          paddingVertical: 8,
          borderRadius: tokens.radii.md,
          backgroundColor: skin.background,
          borderWidth: skin.border ? 2 : 0,
          borderColor: skin.border ?? undefined,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          // Disabled stays at .45 opacity AND is announced: colour is never the only signal.
          opacity: inert ? 0.45 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator testID="button-spinner" color={skin.content} size="small" />
      ) : leadingIcon ? (
        <Icon name={leadingIcon} size={ICON_SIZE[size]} color={skin.content} />
      ) : null}
      <View style={{ flexShrink: 1 }}>
        <Text role={size === 'sm' ? 'labelSm' : 'label'} color={skin.content} numberOfLines={2}>
          {label}
        </Text>
      </View>
      {trailingIcon && !loading ? (
        <Icon name={trailingIcon} size={ICON_SIZE[size]} color={skin.content} />
      ) : null}
    </PressableBase>
  );
}
