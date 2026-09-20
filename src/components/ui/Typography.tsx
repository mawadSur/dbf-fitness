import type { ReactNode } from 'react';
import { Text as RNText, type StyleProp, type TextStyle } from 'react-native';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import { typeScale, type ThemeColors } from '../../theme/tokens';

/** Every role in the type scale (design system §2). */
export type TypeRole = keyof typeof typeScale;

export type TextTone =
  | 'default'
  | 'secondary'
  | 'muted'
  | 'brand'
  | 'on-cta'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

const TONE_COLOR: Record<TextTone, keyof ThemeColors> = {
  default: 'text',
  secondary: 'textSecondary',
  muted: 'textMuted',
  brand: 'brand',
  'on-cta': 'onCta',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  info: 'info',
};

export type TextProps = {
  children: ReactNode;
  /** Type-scale role; defaults to `body` (16/24 Inter). */
  role?: TypeRole;
  tone?: TextTone;
  align?: TextStyle['textAlign'];
  numberOfLines?: number;
  /**
   * Caps how far the OS may scale this text. Font scaling stays ON everywhere;
   * this exists only for boxes whose geometry is reserved up to a known scale
   * (the tab bar reserves up to 200%, so a 400% OS setting would clip it).
   */
  maxFontSizeMultiplier?: number;
  /** Timers, streaks and scores line up column-wise (design system §2). */
  tabularNums?: boolean;
  /** Only for spacing/flex; colour and size belong to `role`/`tone`. */
  style?: StyleProp<TextStyle>;
  accessibilityRole?: 'header' | 'text' | 'none';
  accessibilityLabel?: string;
  testID?: string;
  /** Escape hatch for a colour the tone list cannot express (e.g. a tier hue). */
  color?: string;
};

/**
 * The only text primitive. Sizes come from the type scale and are never given a
 * fixed height, so system font scaling to 200% grows the box instead of
 * clipping the glyphs (§9).
 */
export function Text({
  children,
  role = 'body',
  tone = 'default',
  align,
  numberOfLines,
  maxFontSizeMultiplier,
  tabularNums,
  style,
  accessibilityRole,
  accessibilityLabel,
  testID,
  color,
}: TextProps) {
  const { colors } = useOptionalTheme();
  return (
    <RNText
      numberOfLines={numberOfLines}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      ellipsizeMode={numberOfLines ? 'tail' : undefined}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={[
        typeScale[role],
        { color: color ?? colors[TONE_COLOR[tone]], textAlign: align },
        tabularNums ? { fontVariant: ['tabular-nums' as const] } : null,
        style,
      ]}
    >
      {children}
    </RNText>
  );
}

export type HeadingLevel = 'display' | 1 | 2 | 3;

const HEADING_ROLE: Record<string, TypeRole> = {
  display: 'display',
  '1': 'h1',
  '2': 'h2',
  '3': 'h3',
};

export type HeadingProps = Omit<TextProps, 'role' | 'accessibilityRole'> & {
  level?: HeadingLevel;
};

/** A heading always announces itself as one, whatever its visual level. */
export function Heading({ level = 1, ...rest }: HeadingProps) {
  return <Text role={HEADING_ROLE[String(level)]} accessibilityRole="header" {...rest} />;
}

export type EyebrowProps = Omit<TextProps, 'role'>;

/** The site signature: small, uppercase, letter-spaced, brand colour. */
export function Eyebrow({ tone = 'brand', ...rest }: EyebrowProps) {
  return <Text role="eyebrow" tone={tone} {...rest} />;
}
