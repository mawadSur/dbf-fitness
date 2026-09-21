import { PixelRatio, useWindowDimensions, View } from 'react-native';

import { shouldStackControls } from '../../features/liveClasses/controlBarLayout';
import { useOptionalTheme } from '../../theme/ThemeProvider';
import { Button, FixedFooter, screenGutter } from '../ui';

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
 * Layout: the two toggles share one row and Leave takes the row below it. Three
 * labelled buttons abreast do not fit a 360–390pt phone — "Camera off" wrapped
 * mid-word to "Came / ra off" — and giving Leave its own full-width row also
 * puts the one destructive control where it cannot be hit by accident. At 130%
 * text or more even two toggles stop sharing a row, so they stack as well.
 */
export function CallControlsBar({ muted, cameraOff, onToggleMute, onToggleCamera, onLeave }: Props) {
  const { tokens } = useOptionalTheme();
  const { width } = useWindowDimensions();
  const stacked = shouldStackControls(PixelRatio.getFontScale(), width - screenGutter(width) * 2);

  const grow = stacked ? undefined : { flex: 1 };

  return (
    <FixedFooter testID="call-controls">
      <View style={{ gap: tokens.space.sm }}>
        <View
          testID="call-controls-row"
          style={{
            flexDirection: stacked ? 'column' : 'row',
            alignItems: 'stretch',
            gap: tokens.space.sm,
          }}
        >
          <Button
            label={muted ? 'Unmute' : 'Mute'}
            leadingIcon={muted ? 'mic-off' : 'mic'}
            variant="secondary"
            onPress={onToggleMute}
            accessibilityLabel={muted ? 'Unmute my microphone' : 'Mute my microphone'}
            fullWidth={stacked}
            style={grow}
          />
          <Button
            label={cameraOff ? 'Camera on' : 'Camera off'}
            leadingIcon={cameraOff ? 'camera-off' : 'video'}
            variant="secondary"
            onPress={onToggleCamera}
            accessibilityLabel={cameraOff ? 'Turn my camera on' : 'Turn my camera off'}
            fullWidth={stacked}
            style={grow}
          />
        </View>
        <Button
          testID="call-controls-leave"
          label="Leave"
          leadingIcon="log-out"
          variant="danger"
          onPress={onLeave}
          accessibilityLabel="Leave the class"
          fullWidth
        />
      </View>
    </FixedFooter>
  );
}
