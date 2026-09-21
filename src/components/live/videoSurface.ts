/**
 * @deprecated Import `videoSurface` from `src/theme/tokens` instead.
 *
 * The scrim was promoted into the theme tokens during stage-2 integration (it
 * is the one colour set that deliberately ignores `useTheme()`, so it belongs
 * next to the themes it opts out of, not in a feature folder). This re-export
 * keeps the `VIDEO_SURFACE` name working for the live-class call sites; the
 * values are the single definition in `src/theme/tokens.ts`.
 */
export { videoSurface as VIDEO_SURFACE, type VideoSurfaceToken } from '../../theme/tokens';
