import { useCallback, useEffect, useRef, useState } from 'react';

import { createVideoService, type VideoParticipant, type VideoService } from '../../services/video';
import {
  fetchRtcCredentials,
  RtcCredentialsError,
  type RtcErrorCode,
  type RtcSubscriptionInfo,
} from '../../services/video/credentials';
import { recordJoin, recordLeave } from './api';
import { connectionFailedMessage, joinErrorMessage, logDiagnostic } from './joinErrors';

export type JoinOptions = { graceAcknowledged?: boolean };

export type SessionPhase = 'idle' | 'joining' | 'joined';

/** Which video path the token function granted. Mirrors `RtcCredentials['mode']`. */
export type RtcMode = 'live' | 'mock';

type Member = { id: string; fullName: string };

/** Refusals from agora-rtc-token that change what the screen offers (vs. a retryable failure). */
const DENIAL_CODES: readonly RtcErrorCode[] = [
  'subscription_required',
  'not_entitled',
  'class_not_joinable',
  'class_not_found',
  'unauthorized',
];

/**
 * Owns one video adapter for the screen's lifetime: join/leave, the adapter's participant tiles,
 * and the live_class_participants bookkeeping (joined_at / left_at). Leaves the adapter and stamps
 * left_at on unmount too, and ignores a second join while one is in flight or already active.
 */
export function useLiveClassSession(classId: string, channelName: string | null, member: Member | null) {
  const [service] = useState<VideoService>(() => createVideoService());
  const [phase, setPhase] = useState<SessionPhase>('idle');
  const [tiles, setTiles] = useState<VideoParticipant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [denial, setDenial] = useState<RtcErrorCode | null>(null);
  const [joinSubscription, setJoinSubscription] = useState<RtcSubscriptionInfo | null>(null);
  // What the token function handed back: 'live' = real Agora video, 'mock' = the local preview
  // adapter (no Agora credentials configured). The screen tells the member which one they are in.
  const [mode, setMode] = useState<RtcMode | null>(null);
  // Set when the SERVER reports grace on a join the member has not yet acknowledged: the screen
  // must show the payment notice before the call is actually joined (even if its own
  // subscription query is null or failed).
  const [graceNotice, setGraceNotice] = useState<RtcSubscriptionInfo | null>(null);

  // Refs mirror state the async handlers and the unmount cleanup must read without going stale.
  const phaseRef = useRef<SessionPhase>('idle');
  const unmountedRef = useRef(false);
  const memberIdRef = useRef<string | null>(null);
  // Serialises attendance writes so a fast leave can't be overtaken by the join upsert.
  const attendanceRef = useRef<Promise<void>>(Promise.resolve());

  const memberId = member?.id ?? null;
  useEffect(() => {
    memberIdRef.current = memberId;
  }, [memberId]);

  const setPhaseBoth = useCallback((next: SessionPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const stampLeft = useCallback(
    (leavingMemberId: string | null) => {
      if (!leavingMemberId) return;
      attendanceRef.current = attendanceRef.current
        .then(() => recordLeave(classId, leavingMemberId))
        .catch((leaveError) => logDiagnostic('could not record leaving the class', leaveError));
    },
    [classId]
  );

  useEffect(() => {
    unmountedRef.current = false;
    const unsubscribe = service.onParticipantsChanged((participants) => setTiles([...participants]));

    return () => {
      unmountedRef.current = true;
      unsubscribe();
      if (phaseRef.current !== 'idle') {
        phaseRef.current = 'idle';
        void service.leave().catch(() => undefined);
        stampLeft(memberIdRef.current);
      }
    };
  }, [service, stampLeft]);

  const join = useCallback(async (options?: JoinOptions) => {
    if (phaseRef.current !== 'idle' || !channelName || !member) return;
    setPhaseBoth('joining');
    setError(null);
    setDenial(null);
    setGraceNotice(null);

    try {
      // The Edge Function is the real access check (subscription / entitlement); a refusal here
      // beats whatever the client believed about the member's subscription.
      const credentials = await fetchRtcCredentials(classId);
      if (unmountedRef.current) return;
      setJoinSubscription(credentials.subscription);
      setMode(credentials.mode);
      if (credentials.subscription.state === 'grace' && !options?.graceAcknowledged) {
        // Late payer: hold the join until the member has seen the payment reminder.
        setGraceNotice(credentials.subscription);
        setPhaseBoth('idle');
        return;
      }
      const rtc =
        credentials.mode === 'live'
          ? {
              appId: credentials.app_id,
              token: credentials.token,
              uid: credentials.uid,
              // Re-fetch credentials so a class longer than the token TTL keeps its video.
              refreshToken: async () => (await fetchRtcCredentials(classId)).token,
              onConnectionFailed: (reason: string) => {
                if (unmountedRef.current || phaseRef.current === 'idle') return;
                setPhaseBoth('idle');
                setError(connectionFailedMessage(reason));
                void service.leave().catch(() => undefined);
                stampLeft(memberIdRef.current);
              },
            }
          : undefined;
      await service.join(credentials.channel || channelName, member.fullName, rtc);
    } catch (joinError) {
      if (!unmountedRef.current) {
        setPhaseBoth('idle');
        if (joinError instanceof RtcCredentialsError && DENIAL_CODES.includes(joinError.code)) {
          setDenial(joinError.code);
        } else {
          setError(joinErrorMessage(joinError));
        }
      }
      return;
    }

    // Left the screen while the adapter was connecting: the unmount cleanup already saw
    // phase 'joining' and tore the call down, so there is nothing further to record.
    if (unmountedRef.current) {
      void service.leave().catch(() => undefined);
      return;
    }

    setPhaseBoth('joined');
    // Attendance bookkeeping must not kick someone out of a call they are already in.
    attendanceRef.current = attendanceRef.current
      .then(() => recordJoin(classId, member.id))
      .catch((recordError) => logDiagnostic('could not record joining the class', recordError));
  }, [service, channelName, member, classId, setPhaseBoth, stampLeft]);

  const leave = useCallback(async () => {
    if (phaseRef.current !== 'joined') return;
    setPhaseBoth('idle');
    await service.leave().catch(() => undefined);
    stampLeft(memberIdRef.current);
  }, [service, setPhaseBoth, stampLeft]);

  const toggleMute = useCallback(async () => {
    if (phaseRef.current === 'joined') await service.toggleMute().catch(() => undefined);
  }, [service]);

  const toggleCamera = useCallback(async () => {
    if (phaseRef.current === 'joined') await service.toggleCamera().catch(() => undefined);
  }, [service]);

  /** Forget a server refusal (e.g. after the member renewed) so Join can be attempted again. */
  const resetDenial = useCallback(() => setDenial(null), []);

  /** Back out of the server-reported grace notice to the plain Join button (the notice shows again on the next join). */
  const dismissGraceNotice = useCallback(() => setGraceNotice(null), []);

  return {
    phase,
    tiles,
    error,
    denial,
    mode,
    joinSubscription,
    graceNotice,
    join,
    leave,
    toggleMute,
    toggleCamera,
    resetDenial,
    dismissGraceNotice,
  };
}
