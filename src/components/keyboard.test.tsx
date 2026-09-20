import { readFileSync } from 'fs';
import { join } from 'path';
import { render } from '@testing-library/react-native';

import { KEYBOARD_AVOIDING_BEHAVIOR } from './keyboard';
import { TabIcon } from './navigation/tabIcons';

const root = join(__dirname, '../..');

describe('keyboard avoidance', () => {
  it('pins padding for Android edge-to-edge', () => {
    expect(KEYBOARD_AVOIDING_BEHAVIOR).toBe('padding');
  });
  it.each(['app/(auth)/sign-in.tsx', 'app/(auth)/sign-up.tsx', 'app/coach/profile.tsx'])(
    '%s uses the shared behavior on every platform',
    (f) => {
      const src = readFileSync(join(root, f), 'utf8');
      expect(src).toContain('behavior={KEYBOARD_AVOIDING_BEHAVIOR}');
      expect(src).not.toMatch(/behavior=\{Platform/);
    },
  );
});

describe('tab layout', () => {
  it('gives every tab an icon and an AA label color', () => {
    const src = readFileSync(join(root, 'app/(tabs)/_layout.tsx'), 'utf8');
    expect((src.match(/tabBarIcon:/g) ?? []).length).toBe(5);
    expect(src).toContain('tabBarActiveTintColor: colors.primaryStrong');
  });
  it.each(['home', 'workout', 'food', 'community', 'profile'] as const)('renders %s icon', (n) => {
    expect(() => render(<TabIcon name={n} color="#047857" size={24} />)).not.toThrow();
  });
});
