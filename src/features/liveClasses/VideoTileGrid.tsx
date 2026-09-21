import { useWindowDimensions, View } from 'react-native';

import { VIDEO_SURFACE } from '../../components/live/videoSurface';
import { Icon, Text } from '../../components/ui';
import { VideoSurface, type VideoParticipant } from '../../services/video';
import { computeTileLayout } from './tileLayout';

const GAP = 8;

/**
 * Participant tiles from the video adapter, sized by computeTileLayout: a lone tile is a bounded
 * 16:9 box (never taller than ~40% of the window / 320pt) so the attendee list and controls stay
 * on screen; 2-4 participants get two columns. `availableWidth` is the width of the parent column.
 *
 * Colours come from `VIDEO_SURFACE`, not the theme: camera output is photographic, so the frame
 * around it stays dark in light and dark mode alike.
 */
export function VideoTileGrid({
  participants,
  availableWidth,
}: {
  participants: readonly VideoParticipant[];
  availableWidth?: number;
}) {
  const { width, height } = useWindowDimensions();

  if (participants.length === 0) {
    return (
      <Text role="bodySm" color={VIDEO_SURFACE.onScrimMuted} testID="video-waiting">
        Waiting for video…
      </Text>
    );
  }

  const layout = computeTileLayout({
    count: participants.length,
    availableWidth: availableWidth ?? width,
    windowHeight: height,
    gap: GAP,
  });

  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: GAP,
      }}
    >
      {participants.map((participant) => (
        <View
          key={participant.id}
          style={{
            width: layout.tileWidth,
            height: layout.tileHeight,
            overflow: 'hidden',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: VIDEO_SURFACE.tileBorder,
            backgroundColor: VIDEO_SURFACE.tile,
          }}
        >
          <VideoSurface participant={participant} mirror={participant.isLocal} />
          <View
            style={{
              position: 'absolute',
              bottom: 8,
              left: 8,
              right: 8,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 8,
              backgroundColor: VIDEO_SURFACE.captionPlate,
            }}
          >
            <Text
              role="labelSm"
              color={VIDEO_SURFACE.onScrim}
              numberOfLines={1}
              style={{ flexShrink: 1 }}
            >
              {participant.displayName}
              {participant.isLocal ? ' (you)' : ''}
            </Text>
            {participant.isMuted ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Icon name="mic-off" size={16} color={VIDEO_SURFACE.onScrimMuted} />
                <Text role="labelSm" color={VIDEO_SURFACE.onScrimMuted}>
                  Muted
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}
