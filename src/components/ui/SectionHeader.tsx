import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Eyebrow, Heading, Text } from './Typography';

export type SectionHeaderProps = {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  /** One trailing control at most — secondary actions stay subordinate (§5). */
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Section title inside a screen. `h2` level, so the screen keeps one `h1`. */
export function SectionHeader({ title, eyebrow, subtitle, action, style, testID }: SectionHeaderProps) {
  return (
    <View
      testID={testID}
      style={[{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 }, style]}
    >
      <View style={{ flex: 1, gap: 4 }}>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <Heading level={2}>{title}</Heading>
        {subtitle ? (
          <Text role="bodySm" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action ? <View style={{ flexShrink: 0 }}>{action}</View> : null}
    </View>
  );
}
