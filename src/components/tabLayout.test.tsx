import { render } from '@testing-library/react-native';

import TabsLayout from '../../app/(tabs)/_layout';

type Captured = { screenOptions?: Record<string, unknown>; tabBar?: unknown };
const mockCaptured: Captured = {};
const mockScreens: string[] = [];
const mockTitles: Record<string, string> = {};

jest.mock('expo-router', () => {
  function Tabs({
    screenOptions,
    tabBar,
    children,
  }: {
    screenOptions: Record<string, unknown>;
    tabBar: unknown;
    children: unknown;
  }) {
    mockCaptured.screenOptions = screenOptions;
    mockCaptured.tabBar = tabBar;
    return children;
  }
  Tabs.Screen = function Screen({
    name,
    options,
  }: {
    name: string;
    options: { title?: string; tabBarIcon?: unknown };
  }) {
    if (options.tabBarIcon) mockScreens.push(name);
    if (options.title) mockTitles[name] = options.title;
    return null;
  };
  return { Tabs };
});

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrastOnWhite = (hex: string) => 1.05 / (luminance(hex) + 0.05);

describe('tab layout', () => {
  it('keeps the five tabs, their titles and their icons', async () => {
    await render(<TabsLayout />);
    expect(mockScreens).toEqual(['index', 'workout', 'food', 'community', 'profile']);
    expect(mockTitles).toEqual({
      index: 'Home',
      workout: 'Workout',
      food: 'Food',
      community: 'Community',
      profile: 'Profile',
    });
  });

  it('renders the DBF tab bar instead of the stock one', async () => {
    await render(<TabsLayout />);
    expect(typeof mockCaptured.tabBar).toBe('function');
    expect(mockCaptured.screenOptions?.headerShown).toBe(false);
    // Colours are the custom bar's job now, so the navigator must not set tints
    // that would silently disagree with it.
    expect(mockCaptured.screenOptions?.tabBarActiveTintColor).toBeUndefined();
    expect(mockCaptured.screenOptions?.tabBarInactiveTintColor).toBeUndefined();
  });

  it('keeps milestone (text) colors AA on white', () => {
    const { milestoneTiers } = jest.requireActual('../theme/tokens');
    for (const tier of Object.values(milestoneTiers) as { color: string }[]) {
      expect(contrastOnWhite(tier.color)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
