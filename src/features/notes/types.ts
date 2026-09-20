import type { NoteChecklist, RecordingStatus } from '../../services/transcription/types';

export type RecordingSummary = {
  id: string;
  status: RecordingStatus;
  errorMessage: string | null;
  createdAt: string;
  liveClassId: string | null;
  classTitle: string | null;
  classStartsAt: string | null;
  /**
   * The media file is in Storage (`recordings.has_file`, generated from storage_path, which is
   * never selected client-side). With status still 'uploading' it means the upload finished but
   * the pipeline hand-off did not — the one case a retry fixes.
   */
  hasFile: boolean;
  /** Lease start of the run holding this recording, or null. See isClaimStale(). */
  claimedAt: string | null;
  /** Client-side: when this device first saw the file while the row was still 'uploading'. */
  fileSeenAt?: number | null;
};

export type RecordingDetail = RecordingSummary & {
  noteId: string | null;
  /** edited_content when the coach has saved edits, otherwise draft_content. Never a transcript. */
  checklist: NoteChecklist | null;
  publishedAt: string | null;
};

export type CoachClass = {
  id: string;
  title: string;
  starts_at: string;
  status: string;
};

export type NotesViewer = {
  id: string;
  role: 'member' | 'coach' | 'admin';
  isCoach: boolean;
};
