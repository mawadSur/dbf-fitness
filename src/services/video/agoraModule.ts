/**
 * Web / default resolution: the native Agora module does not exist here. Metro picks
 * `agoraModule.native.ts` on iOS/Android, so `react-native-agora` is never bundled for web.
 */
export type AgoraModule = typeof import('react-native-agora');

export function loadAgoraModule(): AgoraModule | null {
  return null;
}

export function resetAgoraModuleCache() {}
