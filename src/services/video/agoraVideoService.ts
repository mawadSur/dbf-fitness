import { PermissionsAndroid, Platform } from 'react-native';

import { loadAgoraModule } from './agoraModule';
import type { VideoParticipant, VideoService, VideoSession } from './types';

/**
 * Real Agora RTC adapter (react-native-agora, dev-client / EAS builds only). Returns null when
 * the native module is unavailable so the caller can fall back to the mock.
 * Production tokens come from the `agora-rtc-token` Edge Function (see credentials.ts).
 */
const JOIN_TIMEOUT_MS = 20000;
// ConnectionStateType.ConnectionStateFailed
const CONNECTION_STATE_FAILED = 5;

/**
 * ErrorCodeType values that make a join impossible: ERR_FAILED 1, ERR_INVALID_ARGUMENT 2,
 * ERR_NOT_READY 3, ERR_NOT_SUPPORTED 4, ERR_REFUSED 5, ERR_NOT_INITIALIZED 7, ERR_INVALID_APP_ID 101,
 * ERR_INVALID_CHANNEL_NAME 102, ERR_TOKEN_EXPIRED 109, ERR_INVALID_TOKEN 110, ERR_CONNECTION_INTERRUPTED 111,
 * ERR_CONNECTION_LOST 112, ERR_NOT_IN_CHANNEL 113, ERR_JOIN_CHANNEL_REJECTED 17, ERR_ALREADY_IN_USE 19,
 * ERR_INVALID_USER_ID 121 (id-related), ERR_CLIENT_IS_BANNED_BY_SERVER 123, ERR_LICENSE_CREDENTIAL_INVALID 131.
 * Anything else (e.g. ADM/camera 1005, 1501) is logged only.
 */
const FATAL_JOIN_ERROR_CODES: ReadonlySet<number> = new Set([
  1, 2, 3, 4, 5, 7, 17, 19, 101, 102, 109, 110, 111, 112, 113, 121, 123, 131,
]);

export type AgoraJoinErrorCode =
  | 'permission_denied'
  | 'invalid_credentials'
  | 'token_expired'
  | 'connection_failed'
  | 'join_failed'
  | 'timeout';

const JOIN_ERROR_COPY: Record<AgoraJoinErrorCode, string> = {
  permission_denied: 'Camera and microphone permission are required to join the class.',
  invalid_credentials: 'Could not connect to the class video. Please leave and rejoin.',
  token_expired: 'Your class video session expired. Please rejoin.',
  connection_failed: 'The class video connection failed. Please check your network and rejoin.',
  join_failed: 'Could not join the class video. Please try again.',
  timeout: 'Timed out connecting to the class video.',
};

/**
 * Public join failure. The message is fixed copy keyed by `code`; raw SDK codes/messages are only
 * ever written to the console, never surfaced through the error.
 */
export class AgoraJoinError extends Error {
  readonly code: AgoraJoinErrorCode;
  constructor(code: AgoraJoinErrorCode) {
    super(JOIN_ERROR_COPY[code]);
    this.name = 'AgoraJoinError';
    this.code = code;
  }
}

function joinCodeFromSdkError(sdkCode: number): AgoraJoinErrorCode {
  if (sdkCode === 109) return 'token_expired';
  if (sdkCode === 101 || sdkCode === 102 || sdkCode === 110 || sdkCode === 121 || sdkCode === 131) {
    return 'invalid_credentials';
  }
  if (sdkCode === 111 || sdkCode === 112) return 'connection_failed';
  return 'join_failed';
}

/** Android 6+ needs runtime CAMERA/RECORD_AUDIO grants or Agora publishes black video / silence. */
async function ensureAndroidPermissions() {
  if (Platform.OS !== 'android') return;
  const { CAMERA, RECORD_AUDIO } = PermissionsAndroid.PERMISSIONS;
  const result = await PermissionsAndroid.requestMultiple([CAMERA, RECORD_AUDIO]);
  const granted = PermissionsAndroid.RESULTS.GRANTED;
  if (result[CAMERA] !== granted || result[RECORD_AUDIO] !== granted) {
    throw new AgoraJoinError('permission_denied');
  }
}

export function createAgoraVideoService(defaultAppId: string): VideoService | null {
  const agora = loadAgoraModule();
  if (!agora) return null;

  type Engine = ReturnType<AgoraModuleCreate>;
  type AgoraModuleCreate = typeof agora.createAgoraRtcEngine;

  let engine: Engine | null = null;
  let handler: Parameters<Engine['registerEventHandler']>[0] | null = null;
  let session: VideoSession | null = null;
  let listeners: ((participants: VideoParticipant[]) => void)[] = [];

  const notify = () => {
    const snapshot = session ? session.participants.map((p) => ({ ...p })) : [];
    listeners.forEach((listener) => listener(snapshot));
  };

  const patchRemote = (uid: number, patch: Partial<VideoParticipant>) => {
    const target = session?.participants.find((p) => !p.isLocal && p.uid === uid);
    if (!target) return false;
    Object.assign(target, patch);
    return true;
  };

  const teardown = () => {
    const current = engine;
    engine = null;
    handler = null;
    session = null;
    if (current) {
      try {
        current.leaveChannel();
        current.release();
      } catch (error) {
        console.warn('[video:agora] teardown failed:', error);
      }
    }
  };

  return {
    async join(channelName, displayName, credentials) {
      if (engine) {
        teardown();
        notify();
      }
      await ensureAndroidPermissions();
      const appId = credentials?.appId || defaultAppId;
      const localUid = credentials?.uid ?? 0;
      const created = agora.createAgoraRtcEngine();
      engine = created;

      session = {
        channelName,
        participants: [
          {
            id: 'local',
            displayName,
            isLocal: true,
            isMuted: false,
            isCameraOff: false,
            uid: 0,
          },
        ],
      };

      let settleJoin: { resolve: () => void; reject: (e: Error) => void } | null = null;
      const joined = new Promise<void>((resolve, reject) => {
        settleJoin = { resolve, reject };
      });
      const fail = (code: AgoraJoinErrorCode) => {
        if (settleJoin) {
          const pending = settleJoin;
          settleJoin = null;
          pending.reject(new AgoraJoinError(code));
        } else if (engine === created) {
          // Post-join failure: drop the dead call so tiles are not stale, then tell the caller.
          teardown();
          notify();
          credentials?.onConnectionFailed?.(JOIN_ERROR_COPY[code]);
        }
      };

      handler = {
        onJoinChannelSuccess: () => {
          const pending = settleJoin;
          settleJoin = null;
          pending?.resolve();
        },
        onError: (code, msg) => {
          // Only token/app-id/join errors before the channel is joined are fatal; device errors
          // (camera/mic busy) are recoverable and must not stop an audio-only join.
          if (!settleJoin) return;
          if (FATAL_JOIN_ERROR_CODES.has(Number(code))) {
            console.warn(`[video:agora] fatal error ${code}${msg ? `: ${msg}` : ''}`);
            fail(joinCodeFromSdkError(Number(code)));
          }
          else console.warn(`[video:agora] non-fatal error ${code}${msg ? `: ${msg}` : ''}`);
        },
        onConnectionStateChanged: (_connection, state, reason) => {
          if (state === CONNECTION_STATE_FAILED) {
            console.warn(`[video:agora] connection failed (reason ${reason})`);
            fail('connection_failed');
          }
        },
        onTokenPrivilegeWillExpire: () => {
          const refresh = credentials?.refreshToken;
          if (!refresh) return;
          refresh()
            .then((token) => {
              if (token && engine === created) created.renewToken(token);
            })
            .catch((error) => console.warn('[video:agora] token refresh failed:', error));
        },
        onRequestToken: () => {
          const refresh = credentials?.refreshToken;
          if (!refresh) return fail('token_expired');
          refresh()
            .then((token) => {
              if (token && engine === created) created.renewToken(token);
              else fail('token_expired');
            })
            .catch(() => fail('token_expired'));
        },
        onUserJoined: (_connection, remoteUid) => {
          if (!session || session.participants.some((p) => p.uid === remoteUid && !p.isLocal)) return;
          session.participants.push({
            id: `uid:${remoteUid}`,
            displayName: `Member ${remoteUid}`,
            isLocal: false,
            isMuted: false,
            isCameraOff: false,
            uid: remoteUid,
          });
          notify();
        },
        onUserOffline: (_connection, remoteUid) => {
          if (!session) return;
          session.participants = session.participants.filter((p) => p.isLocal || p.uid !== remoteUid);
          notify();
        },
        onUserMuteAudio: (_connection, remoteUid, muted) => {
          if (patchRemote(remoteUid, { isMuted: muted })) notify();
        },
        onUserMuteVideo: (_connection, remoteUid, muted) => {
          if (patchRemote(remoteUid, { isCameraOff: muted })) notify();
        },
      };

      try {
        created.initialize({
          appId,
          channelProfile: agora.ChannelProfileType.ChannelProfileCommunication,
        });
        created.registerEventHandler(handler);
        created.enableAudio();
        created.enableVideo();
        created.startPreview();
        const code = created.joinChannel(credentials?.token ?? '', channelName, localUid, {
          clientRoleType: agora.ClientRoleType.ClientRoleBroadcaster,
          publishMicrophoneTrack: true,
          publishCameraTrack: true,
          autoSubscribeAudio: true,
          autoSubscribeVideo: true,
        });
        if (typeof code === 'number' && code < 0) {
          console.warn(`[video:agora] joinChannel returned ${code}`);
          throw new AgoraJoinError('join_failed');
        }
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new AgoraJoinError('timeout')), JOIN_TIMEOUT_MS);
        });
        try {
          await Promise.race([joined, timeout]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      } catch (error) {
        teardown();
        notify();
        throw error;
      }
      notify();
      return session;
    },

    async leave() {
      teardown();
      notify();
    },

    async toggleMute() {
      const local = session?.participants.find((p) => p.isLocal);
      if (!engine || !local) return false;
      const next = !local.isMuted;
      engine.muteLocalAudioStream(next);
      local.isMuted = next;
      notify();
      return next;
    },

    async toggleCamera() {
      const local = session?.participants.find((p) => p.isLocal);
      if (!engine || !local) return false;
      const next = !local.isCameraOff;
      engine.muteLocalVideoStream(next);
      local.isCameraOff = next;
      notify();
      return next;
    },

    onParticipantsChanged(listener) {
      listeners.push(listener);
      return () => {
        listeners = listeners.filter((l) => l !== listener);
      };
    },
  };
}
