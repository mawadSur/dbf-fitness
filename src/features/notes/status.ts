import { isClaimStale, type RecordingStatus } from '../../services/transcription/types';

export type StatusTone = 'neutral' | 'info' | 'success' | 'danger';

export type StatusUi = {
  label: string;
  tone: StatusTone;
  /** One line the coach sees under the chip. */
  description: string;
};

export const STATUS_UI: Record<RecordingStatus, StatusUi> = {
  uploading: {
    label: 'Uploading',
    tone: 'info',
    description: 'Your recording is being uploaded.',
  },
  transcribing: {
    label: 'Transcribing',
    tone: 'info',
    description: 'Turning the recording into a checklist. This can take a few minutes.',
  },
  draft: {
    label: 'Draft',
    tone: 'neutral',
    description: 'Review the drafted checklist, then publish it to your members.',
  },
  published: {
    label: 'Published',
    tone: 'success',
    description: 'Your members can see this checklist.',
  },
  failed: {
    label: 'Failed',
    tone: 'danger',
    description: 'We could not turn this recording into notes.',
  },
};

/**
 * The design-system `Badge` icon each tone wears.
 *
 * Status is never carried by colour alone (design system §9): the chip always shows an icon AND
 * the word, so the pipeline reads the same in light, dark and greyscale. The tone names already
 * match `BadgeTone`, so the chip needs no colour table of its own — the theme owns the palette.
 */
export const STATUS_ICONS: Record<StatusTone, 'clock' | 'file-text' | 'check-circle' | 'alert-triangle'> = {
  info: 'clock',
  neutral: 'file-text',
  success: 'check-circle',
  danger: 'alert-triangle',
};

/** Everything the status chip needs: the word, the themed tone and the icon beside it. */
export function statusBadge(status: RecordingStatus): {
  label: string;
  tone: StatusTone;
  icon: (typeof STATUS_ICONS)[StatusTone];
} {
  const ui = STATUS_UI[status];
  return { label: ui.label, tone: ui.tone, icon: STATUS_ICONS[ui.tone] };
}

export function statusUi(status: RecordingStatus): StatusUi {
  return STATUS_UI[status];
}

/** True while the server is still working; the UI polls for exactly these. */
export function isInFlight(status: RecordingStatus | null | undefined): boolean {
  return status === 'uploading' || status === 'transcribing';
}

/**
 * Why a coach may re-run the pipeline for a recording, or null when there is nothing to retry.
 *
 * `failed` is the obvious one. The other two are recordings that LOOK busy but have nobody
 * working on them, and without a retry here the coach has no way out at all — the status machine
 * is trigger-protected, so they cannot even move the row themselves:
 *   * `upload_stalled` — the file is in Storage but the row is still 'uploading', i.e. the
 *     hand-off to the Edge Function never landed (network blip, cold start, 5xx).
 *   * `transcription_stalled` — 'transcribing' with an expired lease: the run that claimed it
 *     was killed (the runtime caps wall-clock time) and will never come back.
 */
export type RetryReason =
  | 'failed'
  | 'upload_incomplete'
  | 'upload_stalled'
  | 'transcription_stalled';

export type RetryCandidate = {
  status: RecordingStatus;
  hasFile: boolean;
  claimedAt: string | null;
  /** Row creation time. Bounds how long a file-less 'uploading' row is believed. */
  createdAt?: string | null;
  /**
   * When THIS device first saw the file in Storage (epoch ms). The database has no "storage_path
   * was set at" timestamp, so this is what lets the UI leave the short window between the
   * upload finishing and the function claiming the row alone. Absent = unknown = no grace.
   */
  fileSeenAt?: number | null;
};

/**
 * A recording with no file that is still 'uploading' after this long is abandoned (the app was
 * killed or the connection died mid-upload; the row will never move). Generous, because a 500 MB
 * upload on a slow link legitimately takes a long time.
 */
export const UPLOAD_ABANDONED_MS = 60 * 60 * 1000;

/** How long the file may sit in Storage with the row still 'uploading' before it counts as a lost
 * hand-off. The upload screen calls the function immediately after the file lands, so a healthy
 * run claims the row within seconds; this only absorbs cold starts and a slow first poll. */
export const HANDOFF_GRACE_MS = 60 * 1000;

export function retryReason(recording: RetryCandidate, now: number = Date.now()): RetryReason | null {
  if (recording.status === 'failed') return 'failed';
  if (recording.status === 'uploading') {
    if (recording.hasFile) {
      const seen = recording.fileSeenAt;
      return typeof seen === 'number' && now - seen < HANDOFF_GRACE_MS ? null : 'upload_stalled';
    }
    const created = recording.createdAt ? Date.parse(recording.createdAt) : Number.NaN;
    return Number.isFinite(created) && now - created >= UPLOAD_ABANDONED_MS ? 'upload_incomplete' : null;
  }
  if (recording.status === 'transcribing') {
    return isClaimStale(recording.claimedAt, now) ? 'transcription_stalled' : null;
  }
  return null;
}

export function canRetry(recording: RetryCandidate, now: number = Date.now()): boolean {
  return retryReason(recording, now) !== null;
}

/** What the coach reads next to each retry control. */
export const RETRY_COPY: Record<RetryReason, { label: string; explanation: string }> = {
  failed: {
    label: 'Retry',
    explanation: 'We could not turn this recording into notes.',
  },
  upload_incomplete: {
    label: 'Retry upload',
    explanation: 'The upload never completed, so there is nothing to transcribe yet. Upload the recording again.',
  },
  upload_stalled: {
    label: 'Retry transcription',
    explanation: 'The recording uploaded, but the notes never started. You can start them now.',
  },
  transcription_stalled: {
    label: 'Retry transcription',
    explanation: 'This has been running far too long, so it has stopped. You can start it again.',
  },
};

export const POLL_INTERVAL_MS = 3000;

/** What "retry" does for a reason: re-run the function, or go back to the upload screen. */
export function retryAction(reason: RetryReason): 'transcribe' | 'upload' {
  return reason === 'upload_incomplete' ? 'upload' : 'transcribe';
}

/** Where "Retry upload" goes. Keeps the class so the coach does not have to pick it again. */
export function uploadHref(liveClassId: string | null): string {
  return liveClassId ? `/notes/upload?classId=${encodeURIComponent(liveClassId)}` : '/notes/upload';
}

/** Nothing is working on a stalled recording, so stop asking every 3 s — but keep checking, in
 * case another device (or the coach's own retry) gets it moving again. */
export const STALLED_POLL_INTERVAL_MS = 15000;

/**
 * TanStack `refetchInterval` policy: poll while the recording is in flight, otherwise stop.
 * Before the first fetch (no record yet) we do not poll; the initial fetch covers it.
 */
export function pollIntervalFor(
  recording: RetryCandidate | null | undefined,
  now: number = Date.now()
): number | false {
  if (!recording || !isInFlight(recording.status)) return false;
  // Nothing will ever change an abandoned upload from the server side: stop polling for good.
  if (retryReason(recording, now) === 'upload_incomplete') return false;
  return retryReason(recording, now) === null ? POLL_INTERVAL_MS : STALLED_POLL_INTERVAL_MS;
}
