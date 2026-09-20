// Pure orchestration for the transcribe-recording Edge Function.
//
// PORTABLE TypeScript — no Deno globals, no npm:/jsr: specifiers, no Supabase client. Every side
// effect the pipeline needs is behind the `PipelineStore` port, which index.ts implements with a
// service-role client and Jest implements with an in-memory fake (see
// src/services/transcription/pipeline.test.ts). That is what makes the status machine, the
// compare-and-set and the error mapping testable without a database.

import type { AsrAdapter } from '../_shared/asr.ts';
import type { Drafter, NoteChecklist } from '../_shared/drafter.ts';

export type RecordingStatus = 'uploading' | 'transcribing' | 'draft' | 'published' | 'failed';

/** Statuses a run may start from: a fresh upload, or a retry after a failure. */
export const STARTABLE_STATUSES: readonly RecordingStatus[] = ['uploading', 'failed'];

/** How long the ASR provider has to fetch the object. Short: it is a bearer credential. */
export const SIGNED_URL_TTL_SECONDS = 900;

export const MAX_ERROR_MESSAGE_LENGTH = 500;

/**
 * How long one run may hold a recording before another call may take it over.
 *
 * The whole pipeline is awaited inside a single HTTP request, so an Edge-runtime wall-clock kill
 * (or a crashed worker) leaves the row at 'transcribing' with nothing left to finish it. Without a
 * lease that row is unrecoverable: every retry is a 409 and the database trigger refuses to let
 * the coach move the status either. 15 minutes is comfortably longer than any real run the
 * runtime would allow and short enough that a coach can get unstuck the same session.
 */
export const TRANSCRIPTION_LEASE_MS = 15 * 60 * 1000;

export type RecordingRecord = {
  id: string;
  uploaded_by: string;
  live_class_id: string | null;
  storage_path: string | null;
  status: RecordingStatus;
  /** Lease start: when a run claimed this recording. Null when no run holds it. */
  claimed_at: string | null;
};

/**
 * Is a 'transcribing' claim abandoned? An unparseable or missing `claimed_at` counts as stale: the
 * pipeline always stamps it in the same UPDATE as the claim, so a transcribing row without one is
 * by definition not held by a live run (and the migration back-dates pre-lease rows).
 */
export function isClaimStale(
  claimedAt: string | null | undefined,
  nowMs: number = Date.now(),
  leaseMs: number = TRANSCRIPTION_LEASE_MS
): boolean {
  if (claimedAt === null || claimedAt === undefined || claimedAt === '') return true;
  const claimedMs = Date.parse(claimedAt);
  if (Number.isNaN(claimedMs)) return true;
  return nowMs - claimedMs >= leaseMs;
}

export type ErrorCode =
  | 'method_not_allowed'
  | 'invalid_body'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'pipeline_failed'
  | 'server_error';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  method_not_allowed: 405,
  invalid_body: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  pipeline_failed: 422,
  server_error: 500,
};

/** An error whose HTTP shape is already decided. Anything else maps to 500. */
export class PipelineError extends Error {
  readonly code: ErrorCode;
  /** Set when the recording was already moved to `failed` and must not be marked again. */
  readonly alreadyMarkedFailed: boolean;

  constructor(code: ErrorCode, message: string, alreadyMarkedFailed = false) {
    super(message);
    this.name = 'PipelineError';
    this.code = code;
    this.alreadyMarkedFailed = alreadyMarkedFailed;
  }
}

export function httpStatusForCode(code: ErrorCode): number {
  return STATUS_BY_CODE[code];
}

export function mapPipelineError(error: unknown): { status: number; body: { error: string; message?: string } } {
  if (error instanceof PipelineError) {
    return {
      status: httpStatusForCode(error.code),
      body: { error: error.code, message: error.message },
    };
  }
  return { status: 500, body: { error: 'server_error' } };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 405 for anything but POST: this endpoint mutates state and spends money on ASR. */
export function rejectMethod(method: string): PipelineError | null {
  return method === 'POST' ? null : new PipelineError('method_not_allowed', 'use POST');
}

export function parseRequestBody(raw: unknown): { recordingId: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new PipelineError('invalid_body', 'body must be a JSON object');
  }
  const recordingId = (raw as Record<string, unknown>).recording_id;
  if (typeof recordingId !== 'string' || !UUID_RE.test(recordingId)) {
    throw new PipelineError('invalid_body', 'recording_id must be a uuid');
  }
  return { recordingId };
}

/**
 * Collapses an arbitrary thrown value into a short, secret-free sentence fit for
 * `recordings.error_message`, which the coach sees.
 *
 * Redaction is deliberately blunt: any `http(s)://…` is dropped (signed Storage URLs are bearer
 * credentials and routinely appear in fetch/provider errors) and anything that looks like a key or
 * a JWT is masked, before the result is truncated.
 */
export function sanitizeErrorMessage(error: unknown, maxLength = MAX_ERROR_MESSAGE_LENGTH): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown error';
  const redacted = raw
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/\b(?:sk|dg|sb|api)[-_][A-Za-z0-9_-]{8,}/gi, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim();
  const message = redacted === '' ? 'unknown error' : redacted;
  return message.length <= maxLength ? message : `${message.slice(0, maxLength - 1)}…`;
}

/**
 * Is this object key one the uploader could legitimately have written?
 *
 * `recordings.storage_path` is client-supplied and this function signs it with the SERVICE ROLE,
 * which bypasses Storage RLS entirely. Without this check a coach could point their own recording
 * row at ANOTHER coach's private object key — an object Storage would refuse to hand them
 * directly — have the ASR provider transcribe it, and read the victim's session back as a
 * transcript on their own row. (Reproduced end-to-end against the local stack before the fix.)
 *
 * The rule mirrors public.owns_recording_object() and the recordings_storage_path_owned CHECK
 * added in 20260919152000; it is repeated here so a future migration rollback, or a direct
 * service-role write, cannot silently re-open the hole at the one place it is exploitable.
 */
export function isStoragePathOwnedBy(storagePath: string, uploadedBy: string): boolean {
  if (typeof storagePath !== 'string' || storagePath === '' || storagePath.length > 512) return false;
  if (storagePath.includes('..')) return false;
  if (!UUID_RE.test(uploadedBy)) return false;
  return storagePath.startsWith(`${uploadedBy}/`);
}

/** What the caller knows about the current lease, for the `transcribing` decision below. */
export type ClaimInfo = { claimedAt: string | null; now?: number };

/**
 * Why a recording cannot start a run right now, or null when it can.
 *
 * `transcribing` is normally a 409 rather than a second run — that is the point of the
 * compare-and-set below. The exception is an abandoned lease: with `claim` supplied and its
 * `claimedAt` older than TRANSCRIPTION_LEASE_MS, the previous run is gone and this call takes the
 * recording over instead of leaving it stuck forever. Called without `claim` (no lease
 * information), `transcribing` is always a conflict.
 */
export function rejectStatus(status: RecordingStatus, claim?: ClaimInfo): PipelineError | null {
  if (STARTABLE_STATUSES.includes(status)) return null;
  if (status === 'transcribing') {
    if (claim && isClaimStale(claim.claimedAt, claim.now ?? Date.now())) return null;
    return new PipelineError('conflict', 'this recording is already being transcribed');
  }
  return new PipelineError('conflict', `this recording has already been transcribed (status ${status})`);
}

/** Everything the pipeline is allowed to do to the outside world. */
export interface PipelineStore {
  /** Service-role read: exists-or-not, independent of the caller's RLS. */
  loadRecording(recordingId: string): Promise<RecordingRecord | null>;
  /** The caller's own entitlement, evaluated with the CALLER's identity (not the service role). */
  callerCanManageRecording(recordingId: string): Promise<boolean>;
  /**
   * The caller's SERVER-SIDE role, evaluated as the caller (rpc public.is_coach_or_admin).
   * Transcription spends real money with two providers per run; it is a coach action, and the
   * role must come from the database, never from the JWT's user_metadata (which users can edit).
   */
  callerIsCoachOrAdmin(): Promise<boolean>;
  /**
   * Compare-and-set `status` to 'transcribing' (stamping `claimed_at`) from `from`, OR from an
   * abandoned lease: a row already at 'transcribing' whose `claimed_at` is before
   * `staleClaimBefore` (or null). Returns false when no row matched, which is how concurrent and
   * duplicate invocations are collapsed into one run — including two calls racing to take over
   * the same expired lease.
   */
  claimForTranscription(
    recordingId: string,
    from: readonly RecordingStatus[],
    staleClaimBefore: string
  ): Promise<boolean>;
  createSignedUrl(storagePath: string, expiresInSeconds: number): Promise<string>;
  saveTranscript(recordingId: string, rawText: string, segments: unknown): Promise<void>;
  /** Upserts the recording's unpublished draft note. */
  saveDraftNote(recordingId: string, coachId: string, checklist: NoteChecklist): Promise<string>;
  setStatus(recordingId: string, status: RecordingStatus): Promise<void>;
  markFailed(recordingId: string, message: string): Promise<void>;
  /** Title of the recording's live class, for the checklist heading. */
  loadClassTitle(liveClassId: string | null): Promise<string | null>;
}

export type PipelineDeps = {
  recordingId: string;
  callerId: string;
  store: PipelineStore;
  asr: AsrAdapter;
  drafter: Drafter;
  /** Injectable clock, so the lease is testable without waiting 15 minutes. */
  now?: () => number;
};

export type PipelineResult = {
  recording_id: string;
  status: 'draft';
  note_id: string;
  transcript_chars: number;
  item_count: number;
  asr_provider: string;
  drafter_provider: string;
};

/**
 * Runs one transcription. Authorization, the compare-and-set claim, and failure bookkeeping all
 * live here so they are covered by unit tests rather than only by the Edge runtime.
 *
 * Failure policy: once the recording has been CLAIMED, every later error stamps
 * status='failed' + error_message and rethrows, so a coach can retry. Errors raised BEFORE the
 * claim (not found, not yours, wrong status) leave the row untouched.
 */
export async function runTranscriptionPipeline(deps: PipelineDeps): Promise<PipelineResult> {
  const { recordingId, callerId, store, asr, drafter } = deps;

  const recording = await store.loadRecording(recordingId);
  if (recording === null) {
    throw new PipelineError('not_found', 'recording not found');
  }

  // Two independent checks, both required. The uploader comparison is the ticketed rule; the
  // store call re-evaluates public.can_manage_recording() as the CALLER, so the database's own
  // predicate has to agree — a token for the wrong user cannot get past both.
  if (recording.uploaded_by !== callerId) {
    throw new PipelineError('forbidden', 'only the coach who uploaded this recording can transcribe it');
  }
  if (!(await store.callerCanManageRecording(recordingId))) {
    throw new PipelineError('forbidden', 'only the coach who uploaded this recording can transcribe it');
  }
  // Third check: the caller's server-side role. Neither check above looks at `profiles.role`, so
  // before this a plain member (even one with an expired subscription) who owned a recording row
  // could run the whole paid ASR + drafting pipeline.
  if (!(await store.callerIsCoachOrAdmin())) {
    throw new PipelineError('forbidden', 'only a coach can run the transcription pipeline');
  }

  const nowMs = (deps.now ?? Date.now)();

  const statusRejection = rejectStatus(recording.status, { claimedAt: recording.claimed_at, now: nowMs });
  if (statusRejection) throw statusRejection;

  // The same cut-off the read above used, so the compare-and-set accepts exactly the rows
  // rejectStatus just approved — and refuses one whose lease was renewed in between.
  const staleClaimBefore = new Date(nowMs - TRANSCRIPTION_LEASE_MS).toISOString();
  const claimed = await store.claimForTranscription(recordingId, STARTABLE_STATUSES, staleClaimBefore);
  if (!claimed) {
    // Lost the race against a concurrent invocation between the read and the update.
    throw new PipelineError('conflict', 'this recording is already being transcribed');
  }

  try {
    if (!recording.storage_path) {
      throw new PipelineError('pipeline_failed', 'recording has no uploaded file yet');
    }
    // Re-validate the object key against the row's uploader immediately before the SERVICE-ROLE
    // signature is minted — see isStoragePathOwnedBy.
    if (!isStoragePathOwnedBy(recording.storage_path, recording.uploaded_by)) {
      throw new PipelineError('pipeline_failed', 'the recording file is not in the uploader’s own storage prefix');
    }

    const signedUrl = await store.createSignedUrl(recording.storage_path, SIGNED_URL_TTL_SECONDS);
    const transcription = await asr.transcribe({ audioUrl: signedUrl, seed: recordingId });
    if (transcription.rawText.trim() === '') {
      throw new PipelineError('pipeline_failed', 'the recording produced an empty transcript');
    }
    await store.saveTranscript(recordingId, transcription.rawText, transcription.segments);

    const classTitle = await store.loadClassTitle(recording.live_class_id);
    const checklist = await drafter.draft({
      title: classTitle ?? 'Session notes',
      transcript: transcription.rawText,
    });

    const noteId = await store.saveDraftNote(recordingId, callerId, checklist);
    await store.setStatus(recordingId, 'draft');

    return {
      recording_id: recordingId,
      status: 'draft',
      note_id: noteId,
      transcript_chars: transcription.rawText.length,
      item_count: checklist.items.length,
      asr_provider: asr.provider,
      drafter_provider: drafter.provider,
    };
  } catch (error) {
    const message = sanitizeErrorMessage(error);
    try {
      await store.markFailed(recordingId, message);
    } catch {
      // Losing the bookkeeping write must not mask the real failure; the row stays 'transcribing'
      // and a retry is refused with 409 until it is unstuck. Logged by the caller.
    }
    if (error instanceof PipelineError) {
      throw new PipelineError(error.code, error.message, true);
    }
    throw new PipelineError('pipeline_failed', message, true);
  }
}
