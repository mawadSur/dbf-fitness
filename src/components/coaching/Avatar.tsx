import { View } from 'react-native';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import { initialsOf, Text } from '../ui';

export const AVATAR_SIZE = { sm: 40, md: 48, lg: 64 } as const;

export type AvatarProps = {
  name: string;
  size?: keyof typeof AVATAR_SIZE;
};

/**
 * A person's initials on a brand-tinted disc.
 *
 * Two letters from `initialsOf`, the same rule the group roster uses, with a leading honorific
 * dropped: the seeded coaches are "Coach Dana Reyes" and "Coach Marcus Bell", so a first-letter
 * avatar drew "C" for both and the picker's avatars distinguished nobody.
 *
 * Purely decorative — the name it stands for is always spelled out beside it — so it is hidden
 * from screen readers rather than read out as two letters (design system §9).
 */
export function Avatar({ name, size = 'md' }: AvatarProps) {
  const { colors } = useOptionalTheme();
  const px = AVATAR_SIZE[size];

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: px,
        height: px,
        borderRadius: px / 2,
        backgroundColor: colors.bgSoft,
        borderWidth: 1,
        borderColor: colors.borderSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text role={size === 'lg' ? 'h2' : 'h3'} tone="secondary">
        {initialsOf(name)}
      </Text>
    </View>
  );
}
