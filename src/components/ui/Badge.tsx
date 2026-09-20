import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import type { ThemeColors } from '../../theme/tokens';
import { Icon } from './Icon';
import type { IconName } from './icons';
import { Text } from './Typography';

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

type TonePair = { fg: keyof ThemeColors; bg: keyof ThemeColors };

export const BADGE_TONES: Record<BadgeTone, TonePair> = {
  neutral: { fg: 'text', bg: 'bgSoft' },
  brand: { fg: 'textSecondary', bg: 'bgSoft' },
  success: { fg: 'success', bg: 'successBg' },
  warning: { fg: 'warning', bg: 'warningBg' },
  danger: { fg: 'danger', bg: 'dangerBg' },
  info: { fg: 'info', bg: 'infoBg' },
};

export type BadgeProps = {
  label: string;
  tone?: BadgeTone;
  /** Colour is never the only signal (§9): status badges carry an icon too. */
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Small pill that states a status. Not pressable — see `Chip` for that. */
export function Badge({ label, tone = 'neutral', icon, style, testID }: BadgeProps) {
  const { colors, tokens } = useOptionalTheme();
  const pair = BADGE_TONES[tone];
  const fg = colors[pair.fg] as string;

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          alignSelf: 'flex-start',
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: tokens.radii.pill,
          backgroundColor: colors[pair.bg] as string,
        },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={16} color={fg} /> : null}
      <Text role="caption" color={fg} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
