import { View } from 'react-native';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import { Card, Skeleton } from '../ui';

/**
 * Placeholder classes for a first load. The blocks match the real card's rhythm
 * (title, time, countdown, action) so nothing jumps when the data lands.
 */
export function ScheduleSkeleton({ count = 2 }: { count?: number }) {
  const { tokens } = useOptionalTheme();

  return (
    <View testID="schedule-skeleton" style={{ gap: tokens.space.md }}>
      {Array.from({ length: count }, (_, index) => (
        <Card key={index} style={{ gap: tokens.space.sm }}>
          <Skeleton width="70%" height={24} />
          <Skeleton width="45%" height={16} />
          <Skeleton width="30%" height={16} />
          <Skeleton height={48} radius={tokens.radii.lg} />
        </Card>
      ))}
    </View>
  );
}
