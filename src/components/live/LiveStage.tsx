import { View } from 'react-native';

import { VideoTileGrid } from '../../features/liveClasses/VideoTileGrid';
import type { VideoParticipant } from '../../services/video';
import { Icon, Text } from '../ui';
import { VIDEO_SURFACE } from './videoSurface';

type Props = {
  participants: readonly VideoParticipant[];
  /** Width of the column the stage sits in, so the tiles can size themselves. */
  availableWidth: number;
  /** Mock mode: no Agora credentials are configured, so nothing is broadcast. */
  preview?: boolean;
};

/**
 * The video stage.
 *
 * It keeps the fixed dark scrim in BOTH themes (`VIDEO_SURFACE`), because camera
 * output is photographic: a white frame around a dark feed glares in a dim gym
 * and washes the picture out in daylight. Everything drawn on the scrim uses the
 * scrim's own foreground tokens, which clear 9:1 against it.
 */
export function LiveStage({ participants, availableWidth, preview = false }: Props) {
  return (
    <View
      testID="live-stage"
      style={{
        gap: 8,
        padding: 8,
        borderRadius: 16,
        backgroundColor: VIDEO_SURFACE.scrim,
      }}
    >
      {preview ? (
        // The ONE place preview mode is announced. It used to be said twice —
        // here and in a full `Banner` above the stage — and on a 360x640 phone
        // the duplicate banner was 105pt of the 289pt the stage had to live in,
        // so the video was cut off below the fold. The banner's reassurance
        // moved in here as a caption instead of being dropped.
        <View
          testID="preview-mode"
          accessible
          accessibilityRole="alert"
          accessibilityLabel="Preview mode. Live video isn’t switched on yet. Nothing is broadcast."
          style={{
            alignSelf: 'flex-start',
            gap: 2,
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 12,
            backgroundColor: VIDEO_SURFACE.captionPlate,
          }}
        >
          <View
            testID="live-stage-preview-tag"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            <Icon name="info" size={16} color={VIDEO_SURFACE.onScrimMuted} />
            <Text role="labelSm" color={VIDEO_SURFACE.onScrimMuted}>
              Preview mode
            </Text>
          </View>
          <Text role="bodySm" color={VIDEO_SURFACE.onScrimMuted}>
            Live video isn’t switched on yet. Nothing is broadcast.
          </Text>
        </View>
      ) : null}

      <VideoTileGrid participants={participants} availableWidth={availableWidth - 16} />
    </View>
  );
}
