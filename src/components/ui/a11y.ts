/**
 * Accessibility props for an `<Svg>`, per platform.
 *
 * `react-native-svg` forwards any prop it does not recognise straight onto the
 * host node. On web that host node is a real DOM `<svg>`, so the React Native
 * accessibility props (`accessible`, `accessibilityElementsHidden`,
 * `importantForAccessibility`) reach React DOM and it logs, on EVERY render:
 *
 *   Warning: Received `false` for a non-boolean attribute `accessible`.
 *   Warning: React does not recognize the `accessibilityElementsHidden` prop…
 *   Warning: React does not recognize the `importantForAccessibility` prop…
 *
 * In development those warnings render a LogBox overlay across the bottom of
 * the web app. So web gets the ARIA equivalents and native gets the RN props;
 * both hide a decorative graphic from assistive tech and both name a
 * meaningful one.
 *
 * Pure, with `os` injected, so the web branch is unit-testable from a jest run
 * that reports `Platform.OS === 'ios'`.
 */

import { Platform } from 'react-native';

export type SvgAccessibilityProps = Record<string, unknown>;

export function svgAccessibilityProps(
  accessibilityLabel?: string,
  os: string = Platform.OS,
): SvgAccessibilityProps {
  const decorative = !accessibilityLabel;

  if (os === 'web') {
    return decorative
      ? { 'aria-hidden': true }
      : { role: 'img', 'aria-label': accessibilityLabel };
  }

  return {
    // Only ever `true`: `accessible={false}` is the prop that React DOM rejects,
    // and on native an absent `accessible` already means "not an element".
    accessible: decorative ? undefined : true,
    accessibilityRole: decorative ? undefined : ('image' as const),
    accessibilityLabel,
    accessibilityElementsHidden: decorative,
    importantForAccessibility: decorative ? ('no-hide-descendants' as const) : ('yes' as const),
  };
}
