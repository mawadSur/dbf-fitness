import type { ReactNode } from 'react';
import { useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import { CONTENT_MAX_WIDTH, fixedFooterPadding, screenGutter } from './layout';
import { useScreenShell } from './ScreenShellContext';

export type FixedFooterProps = {
  children: ReactNode;
  /**
   * Overrides what `ScreenShell` published. Only needed for a footer used
   * outside a shell (or in a test that renders the footer on its own).
   */
  insideTabShell?: boolean;
  /** Hairline separator above the footer; on by default. */
  bordered?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * A footer that sticks to the bottom of the screen by LAYOUT, not by position
 * (design system §5).
 *
 * It is a normal-flow sibling of the scroll area, so it can never float over
 * the tab bar and can never cover the last row of a list. Inside the tab shell
 * the tab bar already pays the gesture-bar inset, so the footer adds none;
 * outside the shell the footer is what touches the bottom edge and pays it.
 */
export function FixedFooter({
  children,
  insideTabShell,
  bordered = true,
  style,
  testID,
}: FixedFooterProps) {
  const { colors } = useOptionalTheme();
  const insets = useSafeAreaInsets();
  const shell = useScreenShell();
  const { width } = useWindowDimensions();

  const inside = insideTabShell ?? shell.insideTabShell;

  return (
    <View
      testID={testID ?? 'fixed-footer'}
      style={[
        {
          // No `position: 'absolute'` — see the doc comment.
          paddingTop: 12,
          paddingBottom: fixedFooterPadding(inside, insets.bottom),
          paddingHorizontal: screenGutter(width),
          backgroundColor: colors.bg,
          borderTopWidth: bordered ? 1 : 0,
          borderTopColor: colors.borderSoft,
        },
        style,
      ]}
    >
      <View style={{ width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', gap: 8 }}>
        {children}
      </View>
    </View>
  );
}
