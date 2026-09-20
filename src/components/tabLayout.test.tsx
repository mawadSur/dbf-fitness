import { render } from '@testing-library/react-native';

import TabsLayout from '../../app/(tabs)/_layout';
import { colors } from '../theme/tokens';

type Captured = { screenOptions?: Record<string, unknown> };
const mockCaptured: Captured = {};
const mockScreens: string[] = [];

jest.mock('expo-router', () => {
  function Tabs({ screenOptions, children }: { screenOptions: Record<string, unknown>; children: unknown }) {
    mockCaptured.screenOptions = screenOptions;
    return children;
  }
  Tabs.Screen = function Screen({ name, options }: { name: string; options: { tabBarIcon?: unknown } }) {
    if (options.tabBarIcon) mockScreens.push(name);
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
  it('gives all five tabs an icon and AA-contrast label colors on white', async () => {
    await render(<TabsLayout />);
    expect(mockScreens).toEqual(['index', 'workout', 'food', 'community', 'profile']);
    const active = mockCaptured.screenOptions?.tabBarActiveTintColor as string;
    const inactive = mockCaptured.screenOptions?.tabBarInactiveTintColor as string;
    expect(active).toBe(colors.primaryStrong);
    expect(contrastOnWhite(active)).toBeGreaterThanOrEqual(4.5);
    expect(contrastOnWhite(inactive)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps milestone (text) colors AA on white', () => {
    const { milestoneTiers } = jest.requireActual('../theme/tokens');
    for (const tier of Object.values(milestoneTiers) as { color: string }[]) {
      expect(contrastOnWhite(tier.color)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
