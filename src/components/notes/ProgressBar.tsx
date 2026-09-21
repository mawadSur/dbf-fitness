import { View } from 'react-native';

import { useOptionalTheme } from '../../theme/ThemeProvider';

export const PROGRESS_BAR_HEIGHT = 10;
/** Hairline around the track, so an EMPTY bar still reads as a bar rather than as blank space. */
export const PROGRESS_BAR_BORDER = 1;

export type ProgressBarProps = {
  /** 0..1. Values outside the range are clamped by the caller. */
  fraction: number;
  /** Announced as the bar's name; the caller also shows it as text. */
  label: string;
  /** Screen-reader value; `max` is the caller's own unit (items, percent). */
  now: number;
  max: number;
  testID: string;
};

/**
 * The one horizontal progress bar this stream draws (checklist progress, upload progress).
 *
 * The track is `bgSoft` + a `borderSoft` hairline, NOT `progressTrack`. In the light theme
 * `progressTrack` is a saturated mint (#6EE7B7) chosen to sit under the ring's dark arc; on a thin
 * straight bar it reads as a FULL bar, so "0 of 4 done" and "Uploading 0%" both looked complete.
 * A recessed surface behind the `progressArc` fill keeps empty looking empty in both themes.
 *
 * Callers always spell the number out next to it, so progress is never carried by the fill alone
 * (design system §9).
 *
 * Local to this stream; a shared linear progress primitive is a `uiRequests` candidate.
 */
export function ProgressBar({ fraction, label, now, max, testID }: ProgressBarProps) {
  const { colors, tokens } = useOptionalTheme();

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max, now }}
      style={{
        height: PROGRESS_BAR_HEIGHT,
        borderRadius: tokens.radii.pill,
        backgroundColor: colors.bgSoft,
        borderWidth: PROGRESS_BAR_BORDER,
        borderColor: colors.borderSoft,
        overflow: 'hidden',
      }}
    >
      <View
        testID={testID}
        style={{
          height: '100%',
          width: `${Math.round(fraction * 100)}%`,
          backgroundColor: colors.progressArc,
        }}
      />
    </View>
  );
}
