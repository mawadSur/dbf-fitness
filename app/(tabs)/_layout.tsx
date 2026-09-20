import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import type { ColorValue } from 'react-native';

import { AppTabBar } from '../../src/components/navigation/TabBar';
import { TabIcon, type TabIconName } from '../../src/components/navigation/tabIcons';

function icon(name: TabIconName) {
  const render = ({ color, size }: { color: ColorValue; size: number }) => (
    <TabIcon name={name} color={String(color)} size={size} />
  );
  render.displayName = `TabIcon(${name})`;
  return render;
}

/** One renderer instance, so switching tabs does not remount the bar. */
function renderTabBar(props: BottomTabBarProps) {
  return <AppTabBar {...props} />;
}

/**
 * The five bottom-nav destinations (design system §6).
 *
 * All of the bar's styling lives in `DbfTabBar`: the translucent fill, the
 * hairline top border, the 24px icons, the 12px labels, the brand pill over the
 * active tab and the single gesture-bar inset. Nothing here sets a tint colour,
 * because the custom bar resolves its own colours from the active theme.
 */
export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={renderTabBar}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home') }} />
      <Tabs.Screen name="workout" options={{ title: 'Workout', tabBarIcon: icon('workout') }} />
      <Tabs.Screen name="food" options={{ title: 'Food', tabBarIcon: icon('food') }} />
      <Tabs.Screen name="community" options={{ title: 'Community', tabBarIcon: icon('community') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('profile') }} />
    </Tabs>
  );
}
