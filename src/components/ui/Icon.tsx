import Svg, { Path } from 'react-native-svg';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import { svgAccessibilityProps } from './a11y';
import {
  ICON_PATHS,
  ICON_STROKE_WIDTH,
  ICON_VIEWBOX,
  type IconName,
  type IconSize,
} from './icons';

export type IconProps = {
  name: IconName;
  /** 16 / 20 / 24 / 28 (design system §4). Defaults to 24. */
  size?: IconSize;
  /** Any token colour string; defaults to the current theme's `text`. */
  color?: string;
  /**
   * Given a label the icon becomes an accessibility element; without one it is
   * decorative and hidden from screen readers (§9).
   */
  accessibilityLabel?: string;
  testID?: string;
};

/**
 * The one icon primitive: 24×24 viewBox, 2px stroke, round caps/joins, no fill.
 * Names come from `icons.ts`, so a typo is a type error rather than a blank box.
 */
export function Icon({ name, size = 24, color, accessibilityLabel, testID }: IconProps) {
  const { colors } = useOptionalTheme();
  const stroke = color ?? colors.text;

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`}
      fill="none"
      testID={testID ?? `icon-${name}`}
      {...svgAccessibilityProps(accessibilityLabel)}
    >
      {ICON_PATHS[name].map((d) => (
        <Path
          key={d}
          d={d}
          stroke={stroke}
          strokeWidth={ICON_STROKE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}
    </Svg>
  );
}

export type { IconName, IconSize };
