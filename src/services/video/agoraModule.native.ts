import { Platform } from 'react-native';

export type AgoraModule = typeof import('react-native-agora');

let cached: AgoraModule | null | undefined;

/**
 * Lazy, guarded load of the native Agora module. Returns null on web, and in Expo Go / Jest
 * or any build that does not contain the native module. Never statically import
 * `react-native-agora` anywhere else.
 */
export function loadAgoraModule(): AgoraModule | null {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('react-native-agora') as AgoraModule;
  } catch {
    cached = null;
  }
  return cached;
}

/** Test hook: forget the cached load result. */
export function resetAgoraModuleCache() {
  cached = undefined;
}
