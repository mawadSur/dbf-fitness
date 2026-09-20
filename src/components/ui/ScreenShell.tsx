import { useMemo, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  RefreshControl,
  ScrollView,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import { KEYBOARD_AVOIDING_BEHAVIOR } from '../keyboard';
import { CONTENT_MAX_WIDTH, screenGutter, scrollBottomPadding } from './layout';
import { ScreenShellContext, type ScreenShellState } from './ScreenShellContext';

export type ScreenShellProps = {
  children: ReactNode;
  /**
   * True for screens rendered inside `app/(tabs)`. The tab bar already pays the
   * gesture-bar inset there, so the shell must not pay it a second time (§6).
   */
  insideTabs?: boolean;
  /** Scrollable by default; pass false for a screen that owns a FlatList. */
  scroll?: boolean;
  /** Pull-to-refresh, only meaningful together with `scroll`. */
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Wraps the content in a KeyboardAvoidingView for screens with a form. */
  keyboardAvoiding?: boolean;
  /** Screen gutter (16, or 24 from 600dp). Pass false for edge-to-edge content. */
  padded?: boolean;
  /** `bg` (default) or the tinted `bg-soft` section background. */
  background?: 'bg' | 'bgSoft';
  /** Rendered below the scroll area, in normal flow — use `FixedFooter`. */
  footer?: ReactNode;
  /** Rendered above the scroll area, in normal flow — use `ScreenHeader`. */
  header?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The one place a screen handles safe areas (design system §6).
 *
 * Top inset: always applied here, and published through `ScreenShellContext` so
 * a nested `ScreenHeader` skips it. Bottom inset: applied only when the screen
 * is NOT inside the tab shell, and only by whichever of the scroll content or
 * the `FixedFooter` actually touches the bottom edge.
 *
 * The content column is capped at 640 and centred, so a tablet or the web build
 * gets a readable measure instead of a full-bleed line of text (§3, §6).
 */
export function ScreenShell({
  children,
  insideTabs = false,
  scroll = true,
  refreshing,
  onRefresh,
  keyboardAvoiding = false,
  padded = true,
  background = 'bg',
  footer,
  header,
  contentStyle,
  style,
  testID,
}: ScreenShellProps) {
  const { colors } = useOptionalTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const shellState = useMemo<ScreenShellState>(
    () => ({ topInsetApplied: true, insideTabShell: insideTabs }),
    [insideTabs],
  );

  const gutter = padded ? screenGutter(width) : 0;
  const paddingBottom = scrollBottomPadding(insideTabs, insets.bottom, !!footer);

  const column: ViewStyle = {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: gutter,
  };

  const body = scroll ? (
    <ScrollView
      testID={testID ? `${testID}-scroll` : 'screen-shell-scroll'}
      style={{ flex: 1 }}
      contentContainerStyle={[{ flexGrow: 1, paddingBottom }, column, contentStyle]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={onRefresh}
            tintColor={colors.brand}
            colors={[colors.brand]}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1, paddingBottom }, column, contentStyle]}>{children}</View>
  );

  // The header gets the SAME centred 640 column as the scroll content, minus
  // the gutter — `ScreenHeader` pays its own, and it pays the same
  // `screenGutter(width)`. Without this the h1 sat at the far-left screen edge
  // on a 1280pt viewport while the body started at x≈344, so the title lined up
  // with nothing below it (§3, §6).
  const headerColumn: ViewStyle = {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  };

  const inner = (
    <>
      {header ? (
        <View testID={testID ? `${testID}-header` : 'screen-shell-header'} style={headerColumn}>
          {header}
        </View>
      ) : null}
      {body}
      {footer}
    </>
  );

  return (
    <ScreenShellContext.Provider value={shellState}>
      <View
        testID={testID}
        style={[
          {
            flex: 1,
            paddingTop: insets.top,
            backgroundColor: background === 'bgSoft' ? colors.bgSoft : colors.bg,
          },
          style,
        ]}
      >
        {keyboardAvoiding ? (
          <KeyboardAvoidingView
            testID={testID ? `${testID}-keyboard` : 'screen-shell-keyboard'}
            style={{ flex: 1 }}
            behavior={KEYBOARD_AVOIDING_BEHAVIOR}
          >
            {inner}
          </KeyboardAvoidingView>
        ) : (
          inner
        )}
      </View>
    </ScreenShellContext.Provider>
  );
}
