import { PixelRatio, useWindowDimensions, View } from 'react-native';

import { controlBarRows } from '../../features/liveClasses/controlBarLayout';
import { useOptionalTheme } from '../../theme/ThemeProvider';
import { FixedFooter, screenGutter } from '../ui';
import { CallControlButton } from './CallControlButton';

type Props = {
  muted: boolean;
  cameraOff: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onLeave: () => void;
};

/**
 * The call's control bar.
 *
 * It is a `FixedFooter`, so it sits in normal flow below the scroll area and can
 * never float over the tab bar — and inside the tab shell the tab bar already
 * pays the gesture-bar inset, so the footer adds none.
 *
 * Every toggle states itself twice: the icon changes AND the label changes, so
 * mute/camera are never signalled by colour alone.
 *
 * Layout: the controls are COMPACT (icon above label), so all three fit one row
 * from 360pt — the labelled-`Button` bar they replace took two rows at 390pt and
 * three at 360pt, which pushed the video stage below the fold on a 360x640
 * phone. Only very large text (about 175%+ on a 360pt screen) splits the row,
 * and then Leave drops below the two toggles rather than every control stacking.
 */
export function CallControlsBar({ muted, cameraOff, onToggleMute, onToggleCamera, onLeave }: Props) {
  const { tokens } = useOptionalTheme();
  const { width } = useWindowDimensions();
  const rows = controlBarRows(PixelRatio.getFontScale(), width - screenGutter(width) * 2);

  const grow = { flex: 1 };
  // 1 row: everything abreast. 2 rows: toggles abreast, Leave below.
  // 3 rows: one control per row (only at very large text on a narrow screen).
  const togglesInRow = rows < 3;
  const leaveInRow = rows === 1;

  const mute = (
    <CallControlButton
      key="mute"
      testID="call-controls-mute"
      label={muted ? 'Unmute' : 'Mute'}
      icon={muted ? 'mic-off' : 'mic'}
      onPress={onToggleMute}
      accessibilityLabel={muted ? 'Unmute my microphone' : 'Mute my microphone'}
      style={grow}
    />
  );
  const camera = (
    <CallControlButton
      key="camera"
      testID="call-controls-camera"
      label={cameraOff ? 'Camera on' : 'Camera off'}
      icon={cameraOff ? 'camera-off' : 'video'}
      onPress={onToggleCamera}
      accessibilityLabel={cameraOff ? 'Turn my camera on' : 'Turn my camera off'}
      style={grow}
    />
  );
  const leave = (
    <CallControlButton
      key="leave"
      testID="call-controls-leave"
      label="Leave"
      icon="log-out"
      tone="danger"
      onPress={onLeave}
      accessibilityLabel="Leave the class"
      style={grow}
    />
  );

  return (
    <FixedFooter testID="call-controls">
      <View style={{ gap: tokens.space.sm }}>
        <View
          testID="call-controls-row"
          style={{
            flexDirection: togglesInRow ? 'row' : 'column',
            alignItems: 'stretch',
            gap: tokens.space.sm,
          }}
        >
          {mute}
          {camera}
          {leaveInRow ? leave : null}
        </View>
        {leaveInRow ? null : leave}
      </View>
    </FixedFooter>
  );
}
