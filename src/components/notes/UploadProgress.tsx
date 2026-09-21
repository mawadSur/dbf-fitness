import { View } from 'react-native';

import { Text } from '../ui';
import { ProgressBar, PROGRESS_BAR_HEIGHT } from './ProgressBar';

export const UPLOAD_BAR_HEIGHT = PROGRESS_BAR_HEIGHT;

/** Bytes as the coach would say them: "1.4 MB", "820 KB". */
export function formatSize(bytes?: number): string {
  if (typeof bytes !== 'number') return '';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * How far an upload has got.
 *
 * A determinate bar, not a spinner: the coach is being asked to keep the screen open, so they need
 * to see it moving and read the percentage. The number is spelled out beside the bar, so progress
 * is never carried by the fill alone, and the whole block is a polite live region so a screen
 * reader hears it advance.
 */
export function UploadProgress({ percent }: { percent: number }) {
  return (
    <View style={{ gap: 6 }} accessibilityLiveRegion="polite">
      <ProgressBar
        fraction={percent / 100}
        label={`Uploading, ${percent} percent`}
        now={percent}
        max={100}
        testID="upload-progress-fill"
      />
      <Text role="bodySm" tone="secondary" tabularNums>
        {`Uploading ${percent}%. Keep this screen open until it finishes; long videos can take a while.`}
      </Text>
    </View>
  );
}
