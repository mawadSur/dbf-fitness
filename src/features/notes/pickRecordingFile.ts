import type { RecordingFile } from '../../services/recordings';

const EXTENSION_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/x-m4v',
  mov: 'video/quicktime',
  webm: 'video/webm',
  '3gp': 'video/3gpp',
  mpeg: 'video/mpeg',
  mpg: 'video/mpeg',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
};

/** Some Android providers report no MIME type; fall back to the file extension. */
export function resolveMimeType(reported: string | null | undefined, fileName: string): string {
  const trimmed = (reported ?? '').trim();
  if (trimmed !== '' && trimmed !== 'application/octet-stream') return trimmed;
  const dot = fileName.lastIndexOf('.');
  const extension = dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase();
  return EXTENSION_MIME[extension] ?? trimmed;
}

export type PickResult = { kind: 'picked'; file: RecordingFile } | { kind: 'cancelled' };

/**
 * Opens the system file picker for video/audio. expo-document-picker is required lazily so web,
 * Jest and any build without the native module never load it at import time.
 */
export async function pickRecordingFile(): Promise<PickResult> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const DocumentPicker = require('expo-document-picker');
  const result = await DocumentPicker.getDocumentAsync({
    type: ['video/*', 'audio/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets || result.assets.length === 0) {
    return { kind: 'cancelled' };
  }
  const asset = result.assets[0] as { uri: string; name?: string; size?: number; mimeType?: string };
  const name = asset.name ?? 'recording.mp4';
  return {
    kind: 'picked',
    file: {
      uri: asset.uri,
      name,
      mimeType: resolveMimeType(asset.mimeType, name),
      size: typeof asset.size === 'number' ? asset.size : undefined,
    },
  };
}
