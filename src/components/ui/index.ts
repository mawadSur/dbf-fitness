/**
 * The DBF design system component layer (design system §4–§7).
 *
 * Screens import from `src/components/ui` and nothing else: every component in
 * here is themed, accessible, mobile-first and covered by tests, so a screen
 * never reaches for a raw `View`/`Text` with hand-rolled colours again.
 */

export { svgAccessibilityProps, type SvgAccessibilityProps } from './a11y';
export { Badge, BADGE_TONES, type BadgeProps, type BadgeTone } from './Badge';
export { Banner, BANNER_TONES, type BannerProps, type BannerTone } from './Banner';
export { Button, type ButtonProps, type ButtonVariant } from './Button';
export { Card, type CardProps } from './Card';
export { ChecklistRow, CHECK_TARGET_SIZE, type ChecklistRowProps } from './ChecklistRow';
export {
  Chip,
  chipAccessibilityProps,
  type ChipProps,
  type ChipSelectionRole,
} from './Chip';
export { EmptyState, type EmptyStateProps } from './EmptyState';
export { FixedFooter, type FixedFooterProps } from './FixedFooter';
export {
  HeroPanel,
  heroBackdropSize,
  HERO_DOT_OPACITY,
  HERO_DOT_RADIUS,
  HERO_DOT_SPACING,
  type HeroPanelProps,
  type HeroPanelSize,
} from './HeroPanel';
export { Icon, type IconProps } from './Icon';
export { HONORIFICS, initialsOf } from './initials';
export {
  ICON_NAMES,
  ICON_PATHS,
  ICON_SIZES,
  ICON_STROKE_WIDTH,
  ICON_VIEWBOX,
  isIconName,
  nearestIconSize,
  type IconName,
  type IconSize,
} from './icons';
export { Input, INPUT_MIN_HEIGHT, type InputProps } from './Input';
export {
  BUTTON_HEIGHT,
  CONTENT_MAX_WIDTH,
  FALLBACK_GLYPH_ADVANCE_EM,
  GLYPH_ADVANCE_EM,
  LABEL_FIT_SLACK,
  MAX_FONT_SCALE,
  TAB_BAR_GAP,
  TAB_BAR_ICON_SIZE,
  TAB_BAR_INDICATOR_HEIGHT,
  TAB_BAR_INDICATOR_WIDTH,
  TAB_BAR_ITEM_HORIZONTAL_PADDING,
  TAB_BAR_LABEL_FONT_SIZE,
  TAB_BAR_LABEL_LINE_HEIGHT,
  TAB_BAR_LABEL_MAX_FONT_SCALE,
  TAB_BAR_MAX_LABEL_LINES,
  TAB_BAR_MIN_HEIGHT,
  TAB_BAR_VERTICAL_PADDING,
  TITLE_MAX_LINES,
  TITLE_UNCLAMP_FONT_SCALE,
  bottomInsetPadding,
  clampFontScale,
  clampLabelFontScale,
  clampProgress,
  duration,
  fixedFooterPadding,
  glyphAdvanceEm,
  hitSlopFor,
  labelAdvanceWidth,
  minTouchTarget,
  pressedStyle,
  progressFraction,
  screenGutter,
  scrollBottomPadding,
  tabBarContentHeight,
  tabBarHeight,
  tabBarItemWidth,
  tabBarLabelFits,
  tabBarLabelFitScale,
  tabBarLabelLineCount,
  tabBarLabelLineHeight,
  tabBarLabelLineWidth,
  tabBarLabelLines,
  tabBarLabelWidth,
  textAdvanceEm,
  titleLines,
  widestLabel,
  wrapLabel,
  type ButtonSize,
  type PressFeedback,
} from './layout';
export { ListRow, LIST_ROW_MIN_HEIGHT, type ListRowProps } from './ListRow';
export {
  ListSkeleton,
  LoadingSkeleton,
  SKELETON_REVEAL_MS,
  useDelayedReveal,
  type LoadingSkeletonProps,
} from './LoadingSkeleton';
export {
  Logo,
  LOGO_ASPECT_RATIO,
  LOGO_BADGE_PADDING,
  LOGO_BADGE_RADIUS,
  type LogoProps,
} from './Logo';
export {
  MilestoneBadge,
  MILESTONE_MEDALLION_SIZE,
  MILESTONE_TONES,
  type MilestoneBadgeProps,
  type MilestoneTone,
} from './MilestoneBadge';
export {
  PressableBase,
  feedbackStyle,
  type PressableBaseProps,
  type PressFeedbackMode,
} from './PressableBase';
export { ProgressRing, type ProgressRingProps } from './ProgressRing';
export { ScreenHeader, type ScreenHeaderProps } from './ScreenHeader';
export { ScreenShell, type ScreenShellProps } from './ScreenShell';
export {
  DEFAULT_SCREEN_SHELL_STATE,
  ScreenShellContext,
  useScreenShell,
  type ScreenShellState,
} from './ScreenShellContext';
export { SectionHeader, type SectionHeaderProps } from './SectionHeader';
export {
  Skeleton,
  SKELETON_MAX_OPACITY,
  SKELETON_MIN_OPACITY,
  type SkeletonProps,
} from './Skeleton';
export {
  Eyebrow,
  Heading,
  Text,
  type EyebrowProps,
  type HeadingLevel,
  type HeadingProps,
  type TextProps,
  type TextTone,
  type TypeRole,
} from './Typography';
export { SKELETON_DELAY_MS, useDelayedVisible } from './useDelayedVisible';
