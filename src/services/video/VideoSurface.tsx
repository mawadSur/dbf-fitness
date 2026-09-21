import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { videoSurface } from '../../theme/tokens';
import { loadAgoraModule } from './agoraModule';
import type { VideoParticipant } from './types';

type Props = {
  participant: VideoParticipant;
  mirror?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Renders one participant's video. Real Agora: a native RtcSurfaceView. Mock / web / Expo Go /
 * camera off: a labelled placeholder (no getUserMedia).
 */
export function VideoSurface({ participant, mirror, style }: Props) {
  const agora = participant.placeholderLabel || participant.isCameraOff ? null : loadAgoraModule();

  if (agora && participant.uid !== undefined) {
    const { RtcSurfaceView } = agora;
    return (
      <View style={[styles.fill, style]}>
        <RtcSurfaceView
          style={[styles.fill, mirror ? styles.mirror : null]}
          canvas={{ uid: participant.isLocal ? 0 : participant.uid }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.fill, styles.placeholder, style]}>
      <Text style={styles.label}>
        {participant.isCameraOff ? 'Camera off' : (participant.placeholderLabel ?? 'Video')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: 'hidden' },
  mirror: { transform: [{ scaleX: -1 }] },
  // The placeholder stands in for a camera frame, so it uses the fixed video
  // scrim like every other live-video box — not the legacy slate it shipped
  // with, which was the last raw hex in a rendered component.
  placeholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: videoSurface.tile },
  label: { color: videoSurface.onScrimMuted, fontSize: 12, textAlign: 'center' },
});
