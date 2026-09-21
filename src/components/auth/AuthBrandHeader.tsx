import { View } from 'react-native';

import { Eyebrow, Heading, HeroPanel, Logo, Text } from '../ui';

/**
 * The brand moment at the top of both auth screens: logo, the website's
 * letter-spaced eyebrow, a Manrope display heading and the one-line value prop.
 *
 * Deliberately COMPACT (padding 16, 40pt logo, h2 heading): on a 360x640 screen
 * the form below has to be reachable without scrolling while the keyboard is
 * closed, so this band may not grow past roughly a quarter of the viewport.
 */
export type AuthBrandHeaderProps = {
  /** The screen's own heading, e.g. "Sign in". */
  title: string;
  testID?: string;
};

export const AUTH_VALUE_PROP = 'Transform your body and mind';

export function AuthBrandHeader({ title, testID }: AuthBrandHeaderProps) {
  return (
    <HeroPanel padding={16} testID={testID ?? 'auth-brand-header'}>
      <View style={{ gap: 8 }}>
        <Logo height={40} />
        <Eyebrow>DBF Fitness</Eyebrow>
        <Heading level={2}>{title}</Heading>
        <Text role="bodySm" tone="secondary">
          {AUTH_VALUE_PROP}
        </Text>
      </View>
    </HeroPanel>
  );
}
