import { Text, useWindowDimensions, View } from 'react-native';

import { VideoSurface, type VideoParticipant } from '../../services/video';
import { computeTileLayout } from './tileLayout';

const GAP = 8;

/**
 * Participant tiles from the video adapter, sized by computeTileLayout: a lone tile is a bounded
 * 16:9 box (never taller than ~40% of the window / 320pt) so the attendee list and controls stay
 * on screen; 2-4 participants get two columns. `availableWidth` is the width of the parent column.
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
    return <Text className="text-sm text-slate-500">Waiting for video…</Text>;
  }

  const layout = computeTileLayout({
    count: participants.length,
    availableWidth: availableWidth ?? width,
    windowHeight: height,
    gap: GAP,
  });

  return (
    <View className="flex-row flex-wrap justify-center" style={{ gap: GAP }}>
      {participants.map((participant) => (
        <View
          key={participant.id}
          className="overflow-hidden rounded-lg bg-slate-800"
          style={{ width: layout.tileWidth, height: layout.tileHeight }}
        >
          <VideoSurface participant={participant} mirror={participant.isLocal} />
          <View className="absolute bottom-2 left-2 right-2 flex-row items-center gap-2">
            <Text className="shrink text-xs font-semibold text-white" numberOfLines={1}>
              {participant.displayName}
              {participant.isLocal ? ' (you)' : ''}
            </Text>
            {participant.isMuted ? <Text className="text-xs text-amber-300">Muted</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}
