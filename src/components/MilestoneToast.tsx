import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, PixelRatio, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MILESTONE_TOAST_SKINS, milestoneAnnouncement } from '../features/milestones/toastCopy';
import { useOptionalTheme, useReducedMotion } from '../theme/ThemeProvider';
import type { MilestoneTier } from '../theme/tokens';
import { shouldStack } from './progress/fontScale';
import { Icon } from './ui/Icon';
import { hitSlopFor, duration as motionDuration, minTouchTarget } from './ui/layout';
import { MilestoneBadge } from './ui/MilestoneBadge';
import { PressableBase } from './ui/PressableBase';
import { Eyebrow, Text } from './ui/Typography';

/** Inside the 4-5s window the design system allows for a self-dismissing toast. */
export const AUTO_DISMISS_MS = 4000;

const SLIDE_FROM = -16;

type MilestoneToastProps = {
  tier: MilestoneTier;
  visible: boolean;
  onDismiss: () => void;
};

/**
 * The one celebratory moment in the app.
 *
 * Each tier has its own medallion, icon, tone and sentence (`toastCopy.ts`), so
 * the three milestones are distinguishable without reading the colour. The whole
 * card is one `alert` live region — the announcement is a single sentence rather
 * than four fragments a screen reader would read in layout order — and the
 * medallion stays reachable because the container is not `accessible`.
 *
 * It slides down and fades in; with reduced motion on it simply appears, because
 * `duration()` collapses to 0 and the value jumps to its end state.
 */
export function MilestoneToast({ tier, visible, onDismiss }: MilestoneToastProps) {
  const insets = useSafeAreaInsets();
  const { colors, tokens, scheme } = useOptionalTheme();
  const reducedMotion = useReducedMotion();
  const target = minTouchTarget(Platform.OS);
  const [enter] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!visible) return;

    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [visible, onDismiss]);

  // Rewind once it is hidden, so the next milestone gets its own entrance.
  useEffect(() => {
    if (!visible) enter.setValue(0);
  }, [visible, enter]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let animation: Animated.CompositeAnimation | undefined;

    const play = (reduce: boolean) => {
      if (cancelled) return;
      const ms = motionDuration(tokens.motion.base, reduce);
      if (ms === 0) {
        enter.setValue(1);
        return;
      }
      animation = Animated.timing(enter, {
        toValue: 1,
        duration: ms,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      });
      animation.start();
    };

    // `useReducedMotion()` reports false while it reads the setting, so ask the
    // platform directly before the first frame — otherwise the entrance would
    // animate once anyway on the very device that asked for no motion.
    if (reducedMotion) play(true);
    else {
      AccessibilityInfo.isReduceMotionEnabled().then(
        (enabled) => play(!!enabled),
        () => play(false),
      );
    }

    return () => {
      cancelled = true;
      animation?.stop();
    };
  }, [visible, reducedMotion, enter, tokens.motion.base]);

  if (!visible) return null;

  const skin = MILESTONE_TOAST_SKINS[tier];
  // Medallion + copy + dismiss is three things across; past 130% text they go
  // down the page instead of squeezing the sentence into 60pt (§9).
  const stacked = shouldStack(PixelRatio.getFontScale());

  return (
    <Animated.View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={milestoneAnnouncement(tier)}
      style={{
        position: 'absolute',
        top: insets.top + tokens.space.sm,
        left: tokens.space.md,
        right: tokens.space.md,
        zIndex: 10,
        flexDirection: stacked ? 'column' : 'row',
        alignItems: stacked ? 'stretch' : 'center',
        gap: tokens.space.md,
        padding: tokens.space.md,
        borderRadius: tokens.radii.lg,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        backgroundColor: colors.surfaceRaised,
        ...(scheme === 'light' ? tokens.shadows.md : null),
        opacity: enter,
        transform: [
          {
            translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [SLIDE_FROM, 0] }),
          },
        ],
      }}
    >
      <MilestoneBadge
        testID={`milestone-badge-${tier}`}
        title={skin.title}
        caption={skin.caption}
        icon={skin.icon}
        tone={skin.tone}
      />

      <View style={stacked ? { gap: 2 } : { flex: 1, gap: 2 }}>
        <Eyebrow>Milestone unlocked</Eyebrow>
        <Text role="bodySm" tone="secondary">
          {skin.message}
        </Text>
      </View>

      <PressableBase
        testID="milestone-dismiss"
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        hitSlop={hitSlopFor(target, Platform.OS) + 4}
        android_ripple={{ color: colors.bgSoft, borderless: true }}
        // Layout NEVER goes in a style callback (design system §7, Android).
        style={{
          width: target,
          height: target,
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: stacked ? 'flex-end' : 'auto',
        }}
      >
        <Icon name="x" size={20} color={colors.textSecondary} />
      </PressableBase>
    </Animated.View>
  );
}
