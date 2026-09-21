import { ActivityIndicator, Platform, View, type StyleProp, type ViewStyle } from 'react-native';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import type { ThemeColors } from '../../theme/tokens';
import { Icon } from './Icon';
import type { IconName } from './icons';
import { BUTTON_HEIGHT, hitSlopFor, type ButtonSize } from './layout';
import { PressableBase } from './PressableBase';
import { Text } from './Typography';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-outline';

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
    case 'danger-outline':
      // `secondary`, but in the danger tone: for an irreversible action that is
      // only the ENTRY to a confirmation, so it must read as destructive at a
      // glance without shouting as loud as the armed `danger` button it opens.
      return {
        background: 'transparent',
        content: colors.danger,
        border: colors.danger,
        ripple: colors.dangerBg,
      };
    case 'primary':
    default:
      return { background: colors.cta, content: colors.onCta, border: null, ripple: colors.brand };
  }
}

/**
 * What a DISABLED button looks like — explicit tokens, never a blanket opacity.
 *
 * A single `opacity: 0.45` on the pressable fades the fill AND the label
 * towards the page by the same alpha, so in dark mode the bright `cta`
 * (#34D399) and the near-black `onCta` (#022C22) both collapsed toward
 * #011A14 and met in the middle: the disabled "Sign in" / "Create account" /
 * "Upload recording" label measured (14,80,59) on (24,108,79) = 1.48:1 on the
 * Android emulator — invisible, and it is the FIRST thing a new user sees. In
 * light mode the white label stayed readable, which is why this was dark-only.
 *
 * So a disabled button keeps its SHAPE (a filled variant stays filled, an
 * outlined one stays outlined, a ghost stays flat) and swaps its colours for
 * the DISABLED PAIR — `disabledBg`/`disabledFg`, tokens that exist for nothing
 * else. They are not a dimmed CTA: `src/theme/contrast.test.ts` asserts the
 * fill is >= 3:1 away from `cta` and the label >= 3:1 away from `onCta` in both
 * themes, which is the thing a blanket alpha can never satisfy (an alpha moves
 * both colours toward the page together, so the result is always a faded copy
 * of the live button). The pair is also >= 3:1 against itself and >= 1.2:1
 * against every surface, so the control neither shouts nor vanishes.
 *
 * An outlined variant stays outlined and un-filled; its edge is drawn in the
 * same `disabledFg`, so the whole control — edge and label — is in the inert
 * tone rather than in a washed-out version of the live one.
 *
 * Colour is still never the only signal: `accessibilityState.disabled` is set
 * and the press is dropped.
 */
function disabledSkinFor(variant: ButtonVariant, colors: ThemeColors): Skin {
  const enabled = skinFor(variant, colors);
  return {
    background: enabled.background === 'transparent' ? 'transparent' : colors.disabledBg,
    content: colors.disabledFg,
    border: enabled.border ? colors.disabledFg : null,
    ripple: colors.disabledBg,
  };
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
  const height = BUTTON_HEIGHT[size];
  const inert = disabled || loading;
  // A LOADING button keeps its own colours: the spinner is drawn in the
  // variant's content colour and has to stay visible on the variant's fill.
  // Only a genuinely disabled button takes the muted skin.
  const skin = disabled && !loading ? disabledSkinFor(variant, colors) : skinFor(variant, colors);

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
