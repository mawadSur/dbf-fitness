import { View } from 'react-native';

import { staffLinks, type ProfileRole } from '../../features/workouts/homeState';
import { Eyebrow, Heading, HeroPanel, ListRow, SectionHeader, Text } from '../ui';

export type StaffHomeProps = {
  role: Extract<ProfileRole, 'coach' | 'admin'>;
  greetingText: string;
  onOpen: (href: string) => void;
  testID?: string;
};

/**
 * Home for a coach or admin.
 *
 * Staff have no plan, no streak and no coach, so none of the member cards may
 * render for them — the old screen showed staff the member's "Plan complete!",
 * which was simply untrue. They get their own work instead, including Effort
 * review, which had no route into it from anywhere in the app.
 */
export function StaffHome({ role, greetingText, onOpen, testID = 'staff-home' }: StaffHomeProps) {
  const links = staffLinks(role);

  return (
    <View style={{ gap: 24 }} testID={testID}>
      <HeroPanel padding={24}>
        <View style={{ gap: 4 }}>
          <Eyebrow>DBF coaching</Eyebrow>
          <Heading level={1} numberOfLines={2}>
            {greetingText}
          </Heading>
          <Text tone="secondary">Pick up where your members left off.</Text>
        </View>
      </HeroPanel>

      <View>
        <SectionHeader title="Your work" />
        <View style={{ gap: 8 }}>
          {links.map((link) => (
            <ListRow
              key={link.href}
              title={link.label}
              icon={link.icon}
              onPress={() => onOpen(link.href)}
              testID={`staff-link-${link.href}`}
            />
          ))}
        </View>
      </View>
    </View>
  );
}
