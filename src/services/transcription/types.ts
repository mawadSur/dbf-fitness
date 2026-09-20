// Client-facing contract for the recording -> notes pipeline.
//
// The checklist shape is defined ONCE, in supabase/functions/_shared/drafter.ts, and re-exported
// here so the app, the Edge Function and the Jest tests cannot drift apart. The same shape is
// enforced in SQL by public.is_valid_note_checklist() in
// supabase/migrations/20260919151000_recordings_pipeline.sql.
//
//   {
//     "title": "Saturday Conditioning",
//     "items": [
//       { "key": "warmup",  "text": "Row 500m easy", "kind": "note" },
//       { "key": "squat-1", "text": "Back squat",    "kind": "exercise", "sets": 4, "reps": "8-10" }
//     ]
//   }
//
// `title` non-empty string; `items` array (possibly empty) of objects with a unique non-empty
// `key`, a non-empty `text`, `kind` of 'exercise' or 'note', and optional `sets` (positive number)
// and `reps` (string).

export type {
  ChecklistValidation,
  NoteChecklist,
  NoteChecklistItem,
  NoteChecklistItemKind,
} from '../../../supabase/functions/_shared/drafter';

export {
  MAX_CHECKLIST_ITEMS,
  MAX_CHECKLIST_TEXT,
  parseChecklistJson,
  validateChecklist,
} from '../../../supabase/functions/_shared/drafter';

/**
 * The transcription lease, re-exported from the function's own logic so the app and the server
 * agree on when a 'transcribing' recording counts as abandoned (and therefore retryable).
 * Runtime-safe: logic.ts imports only types from the Deno-side modules, so nothing Deno-specific
 * is pulled into the bundle.
 */
export { isClaimStale, TRANSCRIPTION_LEASE_MS } from '../../../supabase/functions/transcribe-recording/logic';

/** Mirrors the `recordings.status` check constraint. */
export type RecordingStatus = 'uploading' | 'transcribing' | 'draft' | 'published' | 'failed';

/** Error codes the `transcribe-recording` Edge Function returns in `{ "error": ... }`. */
export type TranscriptionErrorCode =
  | 'method_not_allowed'
  | 'invalid_body'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'pipeline_failed'
  | 'server_error'
  | 'network_error';

/** 200 body of `transcribe-recording`. */
export type TranscriptionResult = {
  recording_id: string;
  status: 'draft';
  note_id: string;
  transcript_chars: number;
  item_count: number;
  asr_provider: string;
  drafter_provider: string;
};

/**
 * A failed pipeline invocation, carrying the server's own error code so callers can branch
 * (`conflict` -> "already running", `forbidden` -> "not your recording") instead of matching
 * on message text.
 */
export class TranscriptionError extends Error {
  readonly code: TranscriptionErrorCode;
  readonly status: number | null;

  constructor(code: TranscriptionErrorCode, message: string, status: number | null = null) {
    super(message);
    this.name = 'TranscriptionError';
    this.code = code;
    this.status = status;
  }
}

/** Copy for each failure, so every surface says the same thing. */
export const TRANSCRIPTION_ERROR_COPY: Record<TranscriptionErrorCode, string> = {
  method_not_allowed: 'Something went wrong starting the transcription.',
  invalid_body: 'Something went wrong starting the transcription.',
  unauthorized: 'Please sign in again to transcribe this recording.',
  forbidden: 'Only the coach who uploaded this recording can transcribe it.',
  not_found: 'That recording no longer exists.',
  conflict: 'This recording is already being transcribed.',
  pipeline_failed: 'We could not turn this recording into notes. You can try again.',
  server_error: 'Something went wrong on our side. Please try again.',
  network_error: 'No connection. Check your network and try again.',
};

export function transcriptionErrorMessage(error: unknown): string {
  if (error instanceof TranscriptionError) {
    return TRANSCRIPTION_ERROR_COPY[error.code] ?? TRANSCRIPTION_ERROR_COPY.server_error;
  }
  return TRANSCRIPTION_ERROR_COPY.server_error;
}
