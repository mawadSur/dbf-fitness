import { chromeScheme } from '../theme/chrome';
import { useOptionalTheme } from '../theme/ThemeProvider';
import { themes } from '../theme/tokens';
import { ProgressRing } from './ui/ProgressRing';

type ScoreRingProps = {
  value: number;
  max: number;
  label: string;
};

/**
 * @deprecated Import `ProgressRing` from `src/components/ui` instead.
 *
 * Kept so `app/(tabs)/index.tsx` keeps the exact same props (and the same
 * accessible summary, `"<label> <value> of <max>"`) while it waits to be
 * restyled. It renders the design-system ring, so the home screen gets the
 * reduced-motion-aware version for free.
 *
 * It is pinned to the LIGHT palette on purpose. The home screen still paints a
 * hard-coded `#FFFFFF` page from the legacy palette, so a themed ring on it in
 * dark mode drew `#ECFDF5` text on white — 1.05:1, i.e. an invisible streak
 * number on the app's landing screen. It is the same pin the status bar and
 * the tab bar need for the same reason, so it reads the same flag
 * (`src/theme/chrome.ts`) and comes off with them when the screens migrate.
 */
export function ScoreRing({ value, max, label }: ScoreRingProps) {
  const { scheme } = useOptionalTheme();
  return (
    <ProgressRing value={value} max={max} label={label} palette={themes[chromeScheme(scheme)]} />
  );
}
