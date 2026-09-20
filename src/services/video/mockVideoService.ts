import type { VideoParticipant, VideoService, VideoSession } from './types';

/**
 * Local-preview-only stand-in for the real Agora adapter. No RTC connection
 * is made and no camera/mic API (getUserMedia) is touched; it simulates a single
 * local participant with a labelled placeholder tile so join/leave/mute UI is
 * fully testable — including headless — without AGORA_APP_ID.
 */
export function createMockVideoService(): VideoService {
  let session: VideoSession | null = null;
  let listeners: ((participants: VideoParticipant[]) => void)[] = [];

  const notify = () => {
    listeners.forEach((listener) => listener(session?.participants ?? []));
  };

  return {
    async join(channelName, displayName) {
      session = {
        channelName,
        participants: [
          {
            id: 'local',
            displayName,
            isLocal: true,
            isMuted: false,
            isCameraOff: false,
            placeholderLabel: 'Camera preview (mock)',
          },
        ],
      };
      notify();
      return session;
    },

    async leave() {
      session = null;
      notify();
    },

    async toggleMute() {
      if (!session) return false;
      const local = session.participants.find((p) => p.isLocal);
      if (!local) return false;
      local.isMuted = !local.isMuted;
      notify();
      return local.isMuted;
    },

    async toggleCamera() {
      if (!session) return false;
      const local = session.participants.find((p) => p.isLocal);
      if (!local) return false;
      local.isCameraOff = !local.isCameraOff;
      notify();
      return local.isCameraOff;
    },

    onParticipantsChanged(listener) {
      listeners.push(listener);
      return () => {
        listeners = listeners.filter((l) => l !== listener);
      };
    },
  };
}
