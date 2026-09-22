import { Platform } from 'react-native';

import { videoAvailability, VIDEO_UNAVAILABLE_TITLE } from '../../config/env';
import { createAgoraVideoService } from './agoraVideoService';
import { createMockVideoService } from './mockVideoService';
import type { VideoService } from './types';

export * from './types';
export { VideoSurface } from './VideoSurface';
// Credentials live in ./credentials (imports the supabase client; import it directly).

/** Pure selection rule: Agora only with an app id on a native (ios/android) platform. */
export function shouldUseAgora(input: { appId: string | undefined; os: string }): boolean {
  return Boolean(input.appId) && (input.os === 'ios' || input.os === 'android');
}

let warnedUnavailable = false;
let warnedUnconfigured = false;

/** `__DEV__` is a React Native global; Jest and Node tooling may not define it. */
function isDevBuild(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

/** Test seam: lets a suite assert the release path without leaking state into the next one. */
export function resetVideoServiceWarnings(): void {
  warnedUnavailable = false;
  warnedUnconfigured = false;
}

/**
 * Returns the video adapter for live classes: Agora when EXPO_PUBLIC_AGORA_APP_ID is set on
 * iOS/Android and the native module is present; otherwise the local-preview mock (with a single
 * warning when Agora was requested but the module is missing, e.g. Expo Go).
 */
export function createVideoService(): VideoService {
  const appId = process.env.EXPO_PUBLIC_AGORA_APP_ID;

  // PRODUCTION GUARD: a release build on a phone with no Agora app id must not put the member
  // in a fake call. The adapter still runs (leave/mute stay wired, nothing crashes) but the
  // tile says so in words instead of "Camera preview (mock)". Dev and web are unaffected.
  if (videoAvailability({ appId, isDev: isDevBuild(), os: Platform.OS }) === 'unavailable') {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.warn('[video] release build without EXPO_PUBLIC_AGORA_APP_ID; live video disabled.');
    }
    return createMockVideoService(VIDEO_UNAVAILABLE_TITLE);
  }

  if (shouldUseAgora({ appId, os: Platform.OS })) {
    const real = createAgoraVideoService(appId as string);
    if (real) return real;
    if (!warnedUnavailable) {
      warnedUnavailable = true;
      console.warn('[video] react-native-agora native module unavailable (Expo Go?); using mock video.');
    }
  }
  return createMockVideoService();
}
