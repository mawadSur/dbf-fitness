import { View } from 'react-native';

import { LiveButton } from './LiveButton';

type Props = {
  muted: boolean;
  cameraOff: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onLeave: () => void;
};

/**
 * Fixed bottom bar for the call. It renders inside the tab shell, whose tab bar already clears the
 * home indicator, so no extra bottom safe-area inset is added (it would double-count ~34pt on iPhone).
 */
export function CallControlsBar({ muted, cameraOff, onToggleMute, onToggleCamera, onLeave }: Props) {
  return (
    <View
      className="flex-row items-center gap-2 border-t border-slate-200 bg-white px-4 pb-2 pt-2"
    >
      <LiveButton
        label={muted ? 'Unmute' : 'Mute'}
        variant="secondary"
        onPress={onToggleMute}
        className="flex-1"
      />
      <LiveButton
        label={cameraOff ? 'Camera on' : 'Camera off'}
        variant="secondary"
        onPress={onToggleCamera}
        className="flex-1"
      />
      <LiveButton label="Leave" variant="danger" onPress={onLeave} className="flex-1" />
    </View>
  );
}
