import { useRouter } from 'expo-router';
import { Platform, View } from 'react-native';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import { PressableBase, Text, hitSlopFor, minTouchTarget } from '../ui';

export type AuthSwitchLinkProps = {
  /** The part that is not the link, e.g. "New here?". */
  prompt: string;
  /** The link text, e.g. "Create account". */
  action: string;
  /** Plain string href — typed routes are off in this app. */
  href: string;
  testID?: string;
};

/**
 * The sign-in <-> sign-up switch. A `PressableBase` rather than `Link` so the
 * whole row is one 44/48pt target with press feedback and an announced role on
 * every platform; the route is still a plain string href pushed through the
 * router.
 */
export function AuthSwitchLink({ prompt, action, href, testID }: AuthSwitchLinkProps) {
  const router = useRouter();
  const { colors } = useOptionalTheme();
  const target = minTouchTarget(Platform.OS);

  return (
    <PressableBase
      testID={testID}
      onPress={() => router.push(href)}
      accessibilityRole="link"
      accessibilityLabel={`${prompt} ${action}`}
      hitSlop={hitSlopFor(target, Platform.OS)}
      android_ripple={{ color: colors.bgSoft }}
      // Layout NEVER goes in a style callback — see `PressableBase`.
      style={{
        minHeight: target,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'center',
        paddingHorizontal: 12,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
      }}
    >
      <Text role="bodySm" tone="secondary">
        {prompt}
      </Text>
      <View>
        <Text role="labelSm" tone="brand">
          {action}
        </Text>
      </View>
    </PressableBase>
  );
}
