import type { ReactNode } from 'react';
import { View } from 'react-native';

import { FixedFooter } from '../ui';

/**
 * The notes screens' action bar.
 *
 * `FixedFooter` sticks to the bottom by LAYOUT rather than absolute position, so it can never
 * float over the tab bar, and it pays the gesture-bar inset only when the screen is outside the
 * tab shell (design system §6).
 */
export function BottomActionBar({ children }: { children: ReactNode }) {
  return (
    <FixedFooter>
      <View style={{ gap: 8 }}>{children}</View>
    </FixedFooter>
  );
}
