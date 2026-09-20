export const MAX_SINGLE_TILE_HEIGHT = 320;
export const SINGLE_TILE_MAX_WINDOW_FRACTION = 0.4;
const ASPECT = 16 / 9;

export type TileLayout = { columns: number; tileWidth: number; tileHeight: number };

/**
 * Sizes participant tiles so the attendee list and controls stay on screen. A single tile is a
 * 16:9 box no taller than min(40% of the window, 320pt); 2-4 participants use two columns; more
 * use three columns only when there is room for them.
 */
export function computeTileLayout(input: {
  count: number;
  availableWidth: number;
  windowHeight: number;
  gap?: number;
}): TileLayout {
  const gap = input.gap ?? 8;
  const available = Math.max(0, Math.floor(input.availableWidth));
  const maxHeight = Math.min(MAX_SINGLE_TILE_HEIGHT, input.windowHeight * SINGLE_TILE_MAX_WINDOW_FRACTION);

  if (input.count <= 1) {
    // Width-limited (phones): fill the row. Height-limited (short or wide windows): keep 16:9
    // instead of stretching across the whole row.
    if (available / ASPECT <= maxHeight) {
      return { columns: 1, tileWidth: available, tileHeight: Math.max(1, Math.floor(available / ASPECT)) };
    }
    const tileHeight = Math.max(1, Math.floor(maxHeight));
    return { columns: 1, tileWidth: Math.min(available, Math.floor(tileHeight * ASPECT)), tileHeight };
  }

  const columns = input.count > 4 && available >= 600 ? 3 : 2;
  const tileWidth = Math.max(1, Math.floor((available - gap * (columns - 1)) / columns));
  const tileHeight = Math.max(1, Math.floor(Math.min(tileWidth / ASPECT, maxHeight)));
  return { columns, tileWidth, tileHeight };
}

/** Width available to tiles: the window minus side padding, capped at the content column. */
export function computeContentWidth(windowWidth: number, maxContentWidth: number, sidePadding: number): number {
  return Math.max(0, Math.min(windowWidth - sidePadding * 2, maxContentWidth));
}
