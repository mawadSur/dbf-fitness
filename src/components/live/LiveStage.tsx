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
        <View
          testID="live-stage-preview-tag"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            alignSelf: 'flex-start',
            gap: 6,
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 999,
            backgroundColor: VIDEO_SURFACE.captionPlate,
          }}
        >
          <Icon name="info" size={16} color={VIDEO_SURFACE.onScrimMuted} />
          <Text role="labelSm" color={VIDEO_SURFACE.onScrimMuted}>
            Preview mode
          </Text>
        </View>
      ) : null}

      <VideoTileGrid participants={participants} availableWidth={availableWidth - 16} />
    </View>
  );
}
