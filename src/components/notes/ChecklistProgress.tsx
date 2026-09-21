import { View } from 'react-native';

import { progressFraction, Text } from '../ui';
import { ProgressBar } from './ProgressBar';

export { PROGRESS_BAR_BORDER, PROGRESS_BAR_HEIGHT } from './ProgressBar';

export type ChecklistProgressProps = {
  done: number;
  total: number;
  /** Already-built copy ("3 of 8 done"), announced as the bar's label. */
  label: string;
};

/**
 * How far through a published checklist the member is.
 *
 * A horizontal bar rather than the design system's `ProgressRing`: a checklist is a list, and the
 * bar sits over it at the same width, so the eye reads position rather than an abstract dial. The
 * number is always spelled out next to it, so the bar is never the sole signal (design system §9).
 */
export function ChecklistProgress({ done, total, label }: ChecklistProgressProps) {
  return (
    <View style={{ gap: 6 }}>
      <Text role="labelSm" tone="secondary" tabularNums>
        {label}
      </Text>
      <ProgressBar
        fraction={progressFraction(done, total)}
        label={label}
        now={done}
        max={total}
        testID="checklist-progress-fill"
      />
    </View>
  );
}
