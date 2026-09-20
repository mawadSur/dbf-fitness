// Uploading a class recording into the private `recordings` Storage bucket and kicking off the
// server-side notes pipeline.
//
// Order of operations (each step is undone on failure so no half-state is left behind):
//   1. insert a `recordings` row with status 'uploading'  — the row id names the folder
//   2. PUT the file to storage://recordings/<coach uid>/<recording id>/<safe name>
//   3. set `storage_path`
//   4. invoke the `transcribe-recording` Edge Function
//
// The path prefix is not cosmetic: storage.objects' RLS only lets a caller touch objects under
// their own `<auth.uid()>/`, so a mis-built path is refused by the database, not just by this file
// (see supabase/migrations/20260919151000_recordings_pipeline.sql).
//
// Platform split: web posts a Blob through supabase-js; native streams the file straight from disk
// with expo-file-system so a 500 MB video is never loaded into JS memory and real progress is
// reported. expo-file-system is a NATIVE module and is therefore lazily `require`d inside a
// Platform guard — a static import would break web, Jest and Expo Go.

import { Platform } from "react-native";

import { supabase } from "../supabase/client";
import { invokeTranscription } from "../transcription";
import type { TranscriptionResult } from "../transcription";

export const RECORDINGS_BUCKET = "recordings";

/** Must stay in step with the bucket's file_size_limit in the 20260919151000 migration. */
export const MAX_RECORDING_BYTES = 500 * 1024 * 1024;

/** Must stay in step with the bucket's allowed_mime_types in the 20260919151000 migration. */
export const ALLOWED_RECORDING_MIME_TYPES: readonly string[] = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  "video/3gpp",
  "video/mpeg",
  "audio/mp4",
  "audio/mpeg",
  "audio/m4a",
  "audio/x-m4a",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
];

const MAX_FILE_NAME_LENGTH = 100;
const FALLBACK_FILE_NAME = "recording.mp4";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RecordingUploadErrorCode =
  | "unauthenticated"
  | "file_too_large"
  | "unsupported_type"
  | "invalid_target"
  | "create_failed"
  | "upload_failed"
  | "finalize_failed"
  | "transcribe_failed";

/**
 * A typed upload failure. `recordingId` is populated once the row exists, so a caller can still
 * show the recording and offer "try again" when only the transcription step failed.
 */
export class RecordingUploadError extends Error {
  readonly code: RecordingUploadErrorCode;
  readonly recordingId: string | null;

  constructor(
    code: RecordingUploadErrorCode,
    message: string,
    recordingId: string | null = null,
  ) {
    super(message);
    this.name = "RecordingUploadError";
    this.code = code;
    this.recordingId = recordingId;
  }
}

export const RECORDING_UPLOAD_ERROR_COPY: Record<
  RecordingUploadErrorCode,
  string
> = {
  unauthenticated: "Please sign in again to upload a recording.",
  file_too_large:
    "That file is larger than 500 MB. Trim it or export at a lower quality.",
  unsupported_type:
    "That file type is not supported. Upload a video or audio recording.",
  invalid_target: "That class could not be found.",
  create_failed: "We could not start the upload. Please try again.",
  upload_failed:
    "The upload did not finish. Check your connection and try again.",
  finalize_failed:
    "The upload finished but could not be saved. Please try again.",
  transcribe_failed:
    "The recording uploaded, but we could not start the notes. You can retry.",
};

export function recordingUploadErrorMessage(error: unknown): string {
  if (error instanceof RecordingUploadError) {
    return (
      RECORDING_UPLOAD_ERROR_COPY[error.code] ??
      RECORDING_UPLOAD_ERROR_COPY.upload_failed
    );
  }
  return RECORDING_UPLOAD_ERROR_COPY.upload_failed;
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in ./upload.test.ts)
// ---------------------------------------------------------------------------

/**
 * Turns a picker-supplied file name into something safe to use as a Storage object segment.
 * Everything before the last separator is discarded, so `../../secrets.mp4` and
 * `C:\videos\x.mp4` both collapse to their base name; the remainder is reduced to
 * `[A-Za-z0-9._-]`. A name that sanitizes to nothing becomes `recording.mp4`.
 *
 * Storage RLS already refuses `..` anywhere in an object name, so this is the second line of
 * defence rather than the only one.
 */
export function sanitizeFileName(rawName: string): string {
  const base = String(rawName ?? "")
    .split(/[/\\]/)
    .pop() as string;

  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[.\-]+/, "")
    .replace(/[.\-]+$/, "");

  if (cleaned === "") return FALLBACK_FILE_NAME;
  if (cleaned.length <= MAX_FILE_NAME_LENGTH) return cleaned;

  // Preserve a short extension when truncating so the file still opens by name.
  const dot = cleaned.lastIndexOf(".");
  const extension =
    dot > 0 && cleaned.length - dot <= 6 ? cleaned.slice(dot) : "";
  return cleaned.slice(0, MAX_FILE_NAME_LENGTH - extension.length) + extension;
}

/** Strips parameters (`video/mp4; codecs=...`) and lowercases, before the allow-list check. */
export function normalizeMimeType(mimeType: string | null | undefined): string {
  return String(mimeType ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
}

export function isAllowedRecordingMimeType(
  mimeType: string | null | undefined,
): boolean {
  return ALLOWED_RECORDING_MIME_TYPES.includes(normalizeMimeType(mimeType));
}

export type RecordingFile = {
  uri: string;
  name: string;
  mimeType: string;
  /** Bytes. Optional: a picker does not always report it, and Storage enforces the cap anyway. */
  size?: number;
};

/**
 * Client-side mirror of the bucket's own limits, so the user learns about a 700 MB file before
 * spending ten minutes uploading it. Throws; the bucket is still the authority.
 */
export function validateRecordingFile(file: RecordingFile): void {
  if (!isAllowedRecordingMimeType(file.mimeType)) {
    throw new RecordingUploadError(
      "unsupported_type",
      `unsupported recording type: ${normalizeMimeType(file.mimeType) || "unknown"}`,
    );
  }
  if (typeof file.size === "number" && file.size > MAX_RECORDING_BYTES) {
    throw new RecordingUploadError(
      "file_too_large",
      `recording is larger than ${MAX_RECORDING_BYTES} bytes`,
    );
  }
  if (typeof file.size === "number" && file.size <= 0) {
    throw new RecordingUploadError(
      "upload_failed",
      "the selected file is empty",
    );
  }
  if (typeof file.uri !== "string" || file.uri.trim() === "") {
    throw new RecordingUploadError(
      "upload_failed",
      "the selected file has no location",
    );
  }
}

/**
 * `<coach uid>/<recording id>/<safe name>`. Both ids must be uuids: they are what the Storage RLS
 * prefix check and the folder-per-recording layout rely on.
 */
export function buildStoragePath(
  coachId: string,
  recordingId: string,
  fileName: string,
): string {
  if (!UUID_RE.test(coachId))
    throw new RecordingUploadError("unauthenticated", "invalid uploader id");
  if (!UUID_RE.test(recordingId))
    throw new RecordingUploadError("create_failed", "invalid recording id");
  return `${coachId}/${recordingId}/${sanitizeFileName(fileName)}`;
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

export type UploadRecordingArgs = {
  liveClassId: string;
  file: RecordingFile;
  /** 0..1. Native reports real byte progress; web reports 0 then 1 (no progress events). */
  onProgress?: (fraction: number) => void;
};

export type UploadRecordingResult = {
  recordingId: string;
  /** null when the pipeline has not reported back (it never is on the success path). */
  transcription: TranscriptionResult | null;
};

function storageObjectUrl(path: string): string {
  const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!baseUrl)
    throw new RecordingUploadError(
      "upload_failed",
      "supabase url is not configured",
    );
  return `${baseUrl.replace(/\/+$/, "")}/storage/v1/object/${RECORDINGS_BUCKET}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

/** Lazily loads the native module; null when unavailable (Expo Go / missing native build). */
function loadFileSystem(): {
  createUploadTask: (...args: unknown[]) => {
    uploadAsync: () => Promise<{ status?: number } | undefined>;
  };
  FileSystemUploadType: { BINARY_CONTENT: unknown };
} | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("expo-file-system/legacy");
    return typeof mod?.createUploadTask === "function" ? mod : null;
  } catch {
    return null;
  }
}

/**
 * Streams the file from disk to the Storage REST endpoint. Lazily required and wrapped, so a
 * build without the native module (web, Jest, Expo Go) degrades to the blob path instead of
 * crashing at import time.
 */
async function uploadNative(
  path: string,
  file: RecordingFile,
  accessToken: string,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const FileSystem = loadFileSystem();
  if (!FileSystem) return uploadBlob(path, file, onProgress);

  // Resolved BEFORE the guard below: a missing/misconfigured Supabase URL is a configuration
  // failure, not an unlinked native module, and must surface as upload_failed rather than be
  // swallowed into the blob fallback (which would read the whole file into memory).
  const url = storageObjectUrl(path);

  let task: ReturnType<typeof FileSystem.createUploadTask>;
  try {
    task = FileSystem.createUploadTask(
      url,
      file.uri,
      {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": normalizeMimeType(file.mimeType),
          "x-upsert": "false",
          "cache-control": "3600",
        },
      },
      (progress: {
        totalBytesSent: number;
        totalBytesExpectedToSend: number;
      }) => {
        if (!onProgress) return;
        const total = progress.totalBytesExpectedToSend;
        if (typeof total === "number" && total > 0) {
          onProgress(Math.min(1, progress.totalBytesSent / total));
        }
      },
    );
  } catch {
    // A present-but-unlinked native module can throw when the task is constructed; degrade to
    // the blob path. Only construction is guarded: a failure DURING the transfer must fail fast
    // (re-reading a huge file into memory on a dropped connection risks an OOM).
    return uploadBlob(path, file, onProgress);
  }
  let response: { status?: number } | undefined;
  try {
    response = await task.uploadAsync();
  } catch (error) {
    throw new RecordingUploadError(
      "upload_failed",
      error instanceof Error ? error.message : "upload interrupted",
    );
  }
  const status = response?.status ?? 0;
  if (status < 200 || status >= 300) {
    throw new RecordingUploadError(
      "upload_failed",
      `storage responded ${status}`,
    );
  }
}

async function uploadBlob(
  path: string,
  file: RecordingFile,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  onProgress?.(0);
  const response = await fetch(file.uri);
  if (!response.ok)
    throw new RecordingUploadError(
      "upload_failed",
      "could not read the selected file",
    );
  const blob = await response.blob();

  const { error } = await supabase.storage
    .from(RECORDINGS_BUCKET)
    .upload(path, blob, {
      contentType: normalizeMimeType(file.mimeType),
      upsert: false,
    });
  if (error) throw new RecordingUploadError("upload_failed", error.message);
  onProgress?.(1);
}

/**
 * Uploads a class recording and starts the notes pipeline.
 *
 * Returns as soon as the Edge Function has finished the run (it is synchronous today; a recording
 * of any length is transcribed inside one invocation). Every failure is a RecordingUploadError,
 * and one raised after step 1 carries `recordingId` so the caller can retry rather than re-upload.
 */
export async function uploadRecording(
  args: UploadRecordingArgs,
): Promise<UploadRecordingResult> {
  const { liveClassId, file, onProgress } = args;

  validateRecordingFile(file);
  if (!UUID_RE.test(liveClassId)) {
    throw new RecordingUploadError("invalid_target", "invalid class id");
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session?.user?.id || !session.access_token) {
    throw new RecordingUploadError("unauthenticated", "no active session");
  }
  const coachId = session.user.id;

  // 1. The row first: its id names the Storage folder, and RLS refuses the insert outright unless
  //    this really is the caller's own class.
  const { data: created, error: createError } = await supabase
    .from("recordings")
    .insert({
      live_class_id: liveClassId,
      uploaded_by: coachId,
      status: "uploading",
    })
    .select("id")
    .single();
  if (createError || !created?.id) {
    throw new RecordingUploadError(
      "create_failed",
      createError?.message ?? "could not create the recording",
    );
  }
  const recordingId = created.id as string;

  const path = buildStoragePath(coachId, recordingId, file.name);

  // 2. Upload. On failure drop the placeholder row so the coach's list is not littered with
  //    recordings that have no file (best effort — a failed cleanup must not mask the real error).
  try {
    if (Platform.OS === "web") {
      await uploadBlob(path, file, onProgress);
    } else {
      await uploadNative(path, file, session.access_token, onProgress);
    }
  } catch (error) {
    try {
      await supabase.from("recordings").delete().eq("id", recordingId);
    } catch {
      /* ignore */
    }
    if (error instanceof RecordingUploadError) throw error;
    throw new RecordingUploadError(
      "upload_failed",
      error instanceof Error ? error.message : "the upload did not finish",
    );
  }

  // 3. Point the row at the object. Allowed only while status is still 'uploading'.
  const { error: pathError } = await supabase
    .from("recordings")
    .update({ storage_path: path })
    .eq("id", recordingId);
  if (pathError) {
    throw new RecordingUploadError(
      "finalize_failed",
      pathError.message,
      recordingId,
    );
  }

  // 4. Hand off to the server-side pipeline.
  try {
    const transcription = await invokeTranscription(recordingId);
    return { recordingId, transcription };
  } catch (error) {
    throw new RecordingUploadError(
      "transcribe_failed",
      error instanceof Error
        ? error.message
        : "could not start the transcription",
      recordingId,
    );
  }
}
