export type VideoParticipant = {
  id: string;
  displayName: string;
  isLocal: boolean;
  isMuted: boolean;
  isCameraOff: boolean;
  /** Set by adapters that render no real video (the mock); shown in the tile in place of a feed. */
  placeholderLabel?: string;
  /** RTC uid (real adapter only). 0 / undefined for the local user's preview canvas. */
  uid?: number;
};

export type VideoSession = {
  channelName: string;
  participants: VideoParticipant[];
};

/** Server-issued join credentials (see `agora-rtc-token`). Omitted/null token = mock/local mode. */
export type RtcJoinCredentials = {
  appId?: string | null;
  token?: string | null;
  uid?: number;
  /** Returns a fresh token (re-fetching credentials); used to renew before the RTC token expires. */
  refreshToken?: () => Promise<string | null>;
  /** Called when the connection fails after join() resolved (invalid/expired token, connection failed). */
  onConnectionFailed?: (reason: string) => void;
};

export interface VideoService {
  join(channelName: string, displayName: string, credentials?: RtcJoinCredentials): Promise<VideoSession>;
  leave(): Promise<void>;
  toggleMute(): Promise<boolean>;
  toggleCamera(): Promise<boolean>;
  onParticipantsChanged(listener: (participants: VideoParticipant[]) => void): () => void;
}
