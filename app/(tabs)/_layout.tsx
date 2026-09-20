import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import { TabIcon, type TabIconName } from '../../src/components/navigation/tabIcons';
import { colors } from '../../src/theme/tokens';

function icon(name: TabIconName) {
  const render = ({ color, size }: { color: ColorValue; size: number }) => (
    <TabIcon name={name} color={String(color)} size={size} />
  );
  render.displayName = `TabIcon(${name})`;
  return render;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // primaryStrong (#047857, 5.48:1): tab labels are small text; colors.primary is only 3.77:1.
        tabBarActiveTintColor: colors.primaryStrong,
        tabBarInactiveTintColor: colors.textSecondary,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home') }} />
      <Tabs.Screen name="workout" options={{ title: 'Workout', tabBarIcon: icon('workout') }} />
      <Tabs.Screen name="food" options={{ title: 'Food', tabBarIcon: icon('food') }} />
      <Tabs.Screen name="community" options={{ title: 'Community', tabBarIcon: icon('community') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('profile') }} />
    </Tabs>
  );
}
