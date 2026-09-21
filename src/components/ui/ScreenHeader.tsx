import type { ReactNode } from 'react';
import {
  Platform,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import { rippleFor } from '../../theme/tokens';
import { Icon } from './Icon';
import { hitSlopFor, minTouchTarget, screenGutter } from './layout';
import { PressableBase } from './PressableBase';
import { useScreenShell } from './ScreenShellContext';
import { Eyebrow, Heading } from './Typography';

export type ScreenHeaderProps = {
  title: string;
  eyebrow?: string;
  /** Renders the back chevron. Label defaults to "Go back". */
  onBack?: () => void;
  backAccessibilityLabel?: string;
  /** Trailing controls (icon buttons, a small Button). */
  actions?: ReactNode;
  /** Sits over content: same colours at 90% so the page shows through. */
  translucent?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The screen's one `h1` (design system §5).
 *
 * The status-bar inset is applied here ONLY when no `ScreenShell` has already
 * paid for it — that is what keeps the notch padding from being counted twice.
 */
export function ScreenHeader({
  title,
  eyebrow,
  onBack,
  backAccessibilityLabel = 'Go back',
  actions,
  translucent = false,
  style,
  testID,
}: ScreenHeaderProps) {
  const { colors, tokens } = useOptionalTheme();
  const insets = useSafeAreaInsets();
  const shell = useScreenShell();
  const { width } = useWindowDimensions();

  const target = minTouchTarget(Platform.OS);
  // The same gutter the shell's scroll content uses, so the h1 and the body
  // share one left edge on every viewport (16, or 24 from 600dp).
  const gutter = screenGutter(width);

  return (
    <View
      testID={testID}
      style={[
        {
          paddingTop: shell.topInsetApplied ? 0 : insets.top,
          paddingHorizontal: gutter,
          paddingBottom: tokens.space.md,
          gap: tokens.space.xs,
          backgroundColor: translucent ? 'transparent' : colors.bg,
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space.sm }}>
        {onBack ? (
          <PressableBase
            testID="screen-header-back"
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={backAccessibilityLabel}
            hitSlop={hitSlopFor(target, Platform.OS) + 4}
            android_ripple={{ color: rippleFor(colors.text), borderless: true }}
            // Layout NEVER goes in a style callback — see `PressableBase`.
            style={{ width: target, height: target, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="chevron-left" size={24} color={colors.text} />
          </PressableBase>
        ) : null}
        <View style={{ flex: 1, gap: 2 }}>
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          <Heading level={1} numberOfLines={2}>
            {title}
          </Heading>
        </View>
        {actions ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space.sm }}>
            {actions}
          </View>
        ) : null}
      </View>
    </View>
  );
}
