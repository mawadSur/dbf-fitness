import { View } from 'react-native';

import type { Account } from '../coaching/useAccount';
import { Avatar } from '../coaching/Avatar';
import { Badge, Card, Text, type BadgeProps } from '../ui';

/** How a role is shown: a word AND an icon, never a colour on its own (design system §9). */
export function roleBadge(role: Account['role']): { label: string; icon: BadgeProps['icon'] } {
  if (role === 'coach') return { label: 'Coach', icon: 'shield' };
  if (role === 'admin') return { label: 'Admin', icon: 'crown' };
  return { label: 'Member', icon: 'profile' };
}

/**
 * Who is signed in: initial disc, name, email and the role badge.
 *
 * The name is the screen's second-level heading, so a screen reader hears "Profile" then the
 * member's own name rather than a bare avatar letter — the disc itself is decorative and hidden.
 */
export function IdentityHeader({ account }: { account: Account }) {
  const badge = roleBadge(account.role);

  return (
    <Card testID="identity-header">
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Avatar name={account.fullName} size="lg" />
        <View style={{ flex: 1, gap: 6 }}>
          <Text role="h3" accessibilityRole="header" numberOfLines={2}>
            {account.fullName}
          </Text>
          {account.email ? (
            <Text role="bodySm" tone="muted" numberOfLines={1}>
              {account.email}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row' }}>
            <Badge label={badge.label} tone="brand" icon={badge.icon} />
          </View>
        </View>
      </View>
    </Card>
  );
}
