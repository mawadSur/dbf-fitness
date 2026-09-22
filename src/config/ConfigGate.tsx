import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner, Heading, Text } from '../components/ui';
import { useOptionalTheme } from '../theme/ThemeProvider';
import {
  checkLegalConfig,
  checkSupabaseConfig,
  CONFIG_PROBLEM_TEXT,
  NOT_CONFIGURED_BODY,
  NOT_CONFIGURED_TITLE,
  type ConfigProblem,
  type SupabaseConfigVerdict,
} from './env';

export type ConfigVerdict = { blocked: boolean; problems: readonly ConfigProblem[] };

function isDevBuild(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

/** Reads the build's own environment. Split out so tests can pass a verdict directly. */
export function currentSupabaseVerdict(): SupabaseConfigVerdict {
  return checkSupabaseConfig({
    url: process.env.EXPO_PUBLIC_SUPABASE_URL,
    anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    isDev: isDevBuild(),
  });
}

/**
 * The full shipping verdict: backend config AND the user-visible legal config.
 *
 * The legal half is here rather than in `checkSupabaseConfig` because it is a different
 * failure — the app would work perfectly while linking a reviewer to
 * `https://REPLACE_WITH_PRIVACY_URL` and mailing abuse reports to a template string. Both
 * halves end on the same honest screen, which is the only screen a misconfigured build has
 * any business showing.
 */
export function currentConfigVerdict(): ConfigVerdict {
  const isDev = isDevBuild();
  const supabase = currentSupabaseVerdict();
  const legal = checkLegalConfig({
    privacyUrl: process.env.EXPO_PUBLIC_PRIVACY_URL,
    termsUrl: process.env.EXPO_PUBLIC_TERMS_URL,
    supportUrl: process.env.EXPO_PUBLIC_SUPPORT_URL,
    supportEmail: process.env.EXPO_PUBLIC_SUPPORT_EMAIL,
    isDev,
  });
  return {
    blocked: supabase.blocked || legal.blocked,
    problems: [...supabase.problems, ...legal.problems],
  };
}

/**
 * PRODUCTION GUARD — the blocking half.
 *
 * A release build whose Supabase URL/key is missing, still a `REPLACE_…` placeholder, or points
 * at 127.0.0.1 cannot work on a phone: every screen would spin, every sign-in would fail, and a
 * store reviewer would file the app as broken. Rather than let that happen silently (or crash
 * in a loop), this covers the app with one honest screen.
 *
 * It renders `null` in dev and in any correctly-configured build, so it costs a healthy launch
 * nothing but one synchronous env read.
 */
export function ConfigGate({ verdict }: { verdict?: ConfigVerdict }) {
  const resolved = verdict ?? currentConfigVerdict();
  if (!resolved.blocked) return null;
  return <NotConfiguredScreen problems={resolved.problems} />;
}

/** The screen itself; exported so the dev gallery and tests can mount it directly. */
export function NotConfiguredScreen({ problems }: { problems: readonly ConfigProblem[] }) {
  const { colors } = useOptionalTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      // Absolute fill: nothing underneath stays reachable, on any route.
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        backgroundColor: colors.bg,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }}
      accessibilityViewIsModal
      testID="config-gate"
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          gap: 16,
          paddingHorizontal: 20,
          paddingVertical: 24,
          maxWidth: 520,
          width: '100%',
          alignSelf: 'center',
        }}
      >
        <Heading level={2}>{NOT_CONFIGURED_TITLE}</Heading>
        <Text tone="secondary">{NOT_CONFIGURED_BODY}</Text>

        {/* Named causes, never the key itself — this screen can appear on a reviewer's device. */}
        <Banner
          tone="danger"
          title="What is wrong"
          message={problems.map((problem) => CONFIG_PROBLEM_TEXT[problem]).join(' ')}
          testID="config-gate-problems"
        />
      </ScrollView>
    </View>
  );
}
