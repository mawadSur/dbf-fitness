import { Platform } from 'react-native';

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

/**
 * Returns the video adapter for live classes: Agora when EXPO_PUBLIC_AGORA_APP_ID is set on
 * iOS/Android and the native module is present; otherwise the local-preview mock (with a single
 * warning when Agora was requested but the module is missing, e.g. Expo Go).
 */
export function createVideoService(): VideoService {
  const appId = process.env.EXPO_PUBLIC_AGORA_APP_ID;
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
