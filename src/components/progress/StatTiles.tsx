import { PixelRatio, View } from 'react-native';

import { useOptionalTheme } from '../../theme/ThemeProvider';
import { Card } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';
import { Text } from '../ui/Typography';

import { shouldStack } from './fontScale';

export type StatTile = { label: string; value: string };

/** Re-exported so the tiles' own tests keep naming what they assert. */
export { STACK_FONT_SCALE, shouldStack as shouldStackTiles } from './fontScale';

/**
 * The stat row on the calendar and effort screens.
 *
 * Two tiles per row normally, one per row once the member has scaled text to
 * 130% or more — a 130% "Current streak" over a 45%-wide tile wraps to three
 * lines and shoves the number out of its box, so the row gives up the grid
 * rather than the words.
 */
export function StatTiles({ tiles, testID }: { tiles: readonly StatTile[]; testID?: string }) {
  const { tokens } = useOptionalTheme();
  const stacked = shouldStack(PixelRatio.getFontScale());

  return (
    <View
      testID={testID ?? 'stat-tiles'}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.md }}
    >
      {tiles.map((tile) => (
        <Card
          key={tile.label}
          tone="soft"
          style={{
            flexGrow: 1,
            flexBasis: stacked ? '100%' : '45%',
            gap: tokens.space.xs,
          }}
        >
          <Text role="caption" tone="muted">
            {tile.label}
          </Text>
          <Text role="h3" tabularNums>
            {tile.value}
          </Text>
        </Card>
      ))}
    </View>
  );
}

/**
 * The stat row's shape while it loads, so the grid does not jump when the
 * numbers land (design system §8).
 */
export function StatTilesSkeleton({ count = 4 }: { count?: number }) {
  const { tokens } = useOptionalTheme();
  const stacked = shouldStack(PixelRatio.getFontScale());

  return (
    <View
      testID="stat-tiles-skeleton"
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.md }}
    >
      {Array.from({ length: count }, (_, index) => (
        <Card
          key={index}
          tone="soft"
          style={{ flexGrow: 1, flexBasis: stacked ? '100%' : '45%', gap: tokens.space.sm }}
        >
          <Skeleton width="60%" height={12} />
          <Skeleton width="40%" height={20} />
        </Card>
      ))}
    </View>
  );
}
