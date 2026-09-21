import { View } from 'react-native';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import { Card, Skeleton } from '../ui';

/**
 * First-load placeholder for one live class: the title/status row, the two time
 * lines and the join action, in the real screen's rhythm so nothing jumps when
 * the class lands.
 */
export function ClassSkeleton() {
  const { tokens } = useOptionalTheme();

  return (
    <View testID="class-skeleton" style={{ gap: tokens.space.md }}>
      <Card style={{ gap: tokens.space.sm }}>
        <Skeleton width="80%" height={28} />
        <Skeleton width="40%" height={20} radius={tokens.radii.pill} />
        <Skeleton width="55%" height={16} />
        <Skeleton width="35%" height={16} />
      </Card>
      <Skeleton height={48} radius={tokens.radii.lg} />
    </View>
  );
}
