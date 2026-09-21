import { View } from 'react-native';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import { Skeleton } from '../ui/Skeleton';

const WEEKS = 6;
const DAYS_PER_WEEK = 7;

/**
 * The month grid's own footprint while it loads.
 *
 * Six rows, not five: the tallest a month can be. Reserving the maximum means
 * the stats above and the summary below never jump when the real grid arrives
 * (design system §8).
 */
export function MonthGridSkeleton() {
  const { tokens } = useOptionalTheme();

  return (
    <View testID="month-grid-skeleton" style={{ gap: tokens.space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space.md }}>
        <Skeleton width={44} height={44} radius={tokens.radii.md} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Skeleton width={140} height={22} />
        </View>
        <Skeleton width={44} height={44} radius={tokens.radii.md} />
      </View>

      {Array.from({ length: WEEKS }, (_, week) => (
        <View key={week} style={{ flexDirection: 'row' }}>
          {Array.from({ length: DAYS_PER_WEEK }, (_, day) => (
            <View key={day} style={{ width: `${100 / DAYS_PER_WEEK}%`, alignItems: 'center' }}>
              <Skeleton width={32} height={32} radius={tokens.radii.pill} />
            </View>
          ))}
        </View>
      ))}

      <Skeleton width="55%" height={16} />
    </View>
  );
}
