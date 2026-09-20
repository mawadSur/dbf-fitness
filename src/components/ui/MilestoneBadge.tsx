import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import type { ThemeColors } from '../../theme/tokens';
import { Icon } from './Icon';
import type { IconName } from './icons';
import { Text } from './Typography';

export type MilestoneTone = 'brand' | 'success' | 'warning' | 'info';

type ToneSkin = { fg: keyof ThemeColors; bg: keyof ThemeColors };

/**
 * Each tier keeps a distinct hue AND a distinct icon AND a text label, so the
 * tier is never carried by colour alone (design system §1, §9).
 */
export const MILESTONE_TONES: Record<MilestoneTone, ToneSkin> = {
  brand: { fg: 'textSecondary', bg: 'bgSoft' },
  success: { fg: 'success', bg: 'successBg' },
  warning: { fg: 'warning', bg: 'warningBg' },
  info: { fg: 'info', bg: 'infoBg' },
};

export const MILESTONE_MEDALLION_SIZE = 56;

export type MilestoneBadgeProps = {
  title: string;
  /** e.g. "7 days in a row" — the how, under the title. */
  caption?: string;
  icon?: IconName;
  tone?: MilestoneTone;
  /** Unearned milestones are dimmed, show a lock and say so to a screen reader. */
  earned?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Gamified achievement medallion (design system §5). */
export function MilestoneBadge({
  title,
  caption,
  icon = 'trophy',
  tone = 'brand',
  earned = true,
  style,
  testID,
}: MilestoneBadgeProps) {
  const { colors, tokens } = useOptionalTheme();
  const skin = MILESTONE_TONES[tone];
  const fg = earned ? (colors[skin.fg] as string) : colors.textMuted;
  const bg = earned ? (colors[skin.bg] as string) : colors.bgSoft;

  const state = earned ? 'earned' : 'locked';

  return (
    <View
      testID={testID ?? 'milestone-badge'}
      accessible
      accessibilityRole="image"
      accessibilityLabel={caption ? `${title}, ${caption}, ${state}` : `${title}, ${state}`}
      accessibilityState={{ disabled: !earned }}
      style={[
        { alignItems: 'center', gap: tokens.space.sm, opacity: earned ? 1 : 0.6, width: 96 },
        style,
      ]}
    >
      <View
        style={{
          width: MILESTONE_MEDALLION_SIZE,
          height: MILESTONE_MEDALLION_SIZE,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: tokens.radii.pill,
          borderWidth: 2,
          borderColor: fg,
          backgroundColor: bg,
        }}
      >
        <Icon name={earned ? icon : 'lock'} size={24} color={fg} />
      </View>
      <View style={{ alignItems: 'center', gap: 2 }}>
        <Text role="bodySmMedium" color={fg} align="center" numberOfLines={2}>
          {title}
        </Text>
        {caption ? (
          <Text role="caption" tone="muted" align="center" numberOfLines={2}>
            {caption}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
