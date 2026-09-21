import { View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { Text, type TextProps, type TypeRole } from '../ui';

export type HeadingRank = 1 | 2 | 3 | 4;

/**
 * A heading that actually announces its LEVEL, not just that it is a heading.
 *
 * react-native-web turns `accessibilityRole="header"` into an element by
 * reading `aria-level` off the props and, when there is none, falls back to
 * `<h1>` (`AccessibilityUtil/propsToAccessibilityComponent`). Every heading the
 * design system draws — the screen title, a `SectionHeader`, a card title —
 * therefore shipped as an `<h1>`, and Calendar alone rendered three of them:
 * "Calendar", the month name and the selected day. Three level-1 headings on
 * one page is not a hierarchy, it is three documents.
 *
 * The level is put on a wrapper rather than on the text because the shared
 * `Text` deliberately exposes a fixed prop list, and `src/components/ui` is not
 * this stream's to change. The inner `Text` keeps the type-scale role (how big
 * it looks) and is NOT itself a header, so the tree has exactly one heading
 * node per title.
 *
 * `aria-level` is a web attribute with no React Native prop declaration, so it
 * is cast in one place here. On iOS and Android the wrapper's `role="heading"`
 * is what is read, exactly as before; only the web level is new.
 *
 * The right long-term home for this is `ui/Typography.tsx` — see `uiRequests`
 * in this stream's report.
 */
export type LevelledHeadingProps = {
  children: string;
  /** Document level: what a screen reader announces ("heading level 2"). */
  level: HeadingRank;
  /** Type-scale role: how large it looks. Defaults to the matching visual size. */
  role?: TypeRole;
  tone?: TextProps['tone'];
  align?: TextProps['align'];
  numberOfLines?: number;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
};

const VISUAL_ROLE: Record<HeadingRank, TypeRole> = { 1: 'h1', 2: 'h2', 3: 'h3', 4: 'labelSm' };

export function LevelledHeading({
  children,
  level,
  role,
  tone,
  align,
  numberOfLines,
  style,
  textStyle,
  testID,
}: LevelledHeadingProps) {
  // `aria-level` has no React Native typing; web reads it, native ignores it.
  const levelProps = { 'aria-level': level } as object;

  return (
    // `accessible` is what makes the wrapper ONE element with the header role —
    // without it a plain View carries the role but is not focusable as a heading.
    <View accessible accessibilityRole="header" testID={testID} style={style} {...levelProps}>
      <Text role={role ?? VISUAL_ROLE[level]} tone={tone} align={align} numberOfLines={numberOfLines} style={textStyle}>
        {children}
      </Text>
    </View>
  );
}
