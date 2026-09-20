import { supabase } from '../../services/supabase/client';
import { invokeTranscription, type RecordingStatus } from '../../services/transcription';
import { TranscriptionError } from '../../services/transcription/types';
import { parseStoredChecklist } from './checklist';
import type { CoachClass, NotesViewer, RecordingDetail, RecordingSummary } from './types';

const INVALID_UUID = '22P02';

// `has_file` rather than `storage_path`: the object key is the coach's business and members can
// select published recordings, so only the boolean the retry logic needs crosses the wire.
const RECORDING_COLUMNS =
  'id, status, error_message, created_at, live_class_id, has_file, claimed_at, live_classes(title, starts_at)';

type ClassEmbed = { title?: unknown; starts_at?: unknown };

type RecordingRow = {
  id: string;
  status: RecordingStatus;
  error_message: string | null;
  created_at: string;
  live_class_id: string | null;
  has_file: boolean | null;
  claimed_at: string | null;
  // PostgREST returns a to-one embed as an object; tolerate an array too.
  live_classes: ClassEmbed | ClassEmbed[] | null;
};

// First time this device saw each still-'uploading' recording's file in Storage. The database has
// no "storage_path was set at" timestamp; this is what lets status.ts give the function's claim a
// short window before it calls the hand-off lost. Bounded: only rows that are 'uploading' with a
// file are ever added, and they are dropped again the moment they move on.
const fileSeen = new Map<string, number>();

export function resetFileSeen(): void {
  fileSeen.clear();
}

function trackFileSeen(id: string, status: RecordingStatus, hasFile: boolean, now: number): number | null {
  if (status !== 'uploading' || !hasFile) {
    fileSeen.delete(id);
    return null;
  }
  const known = fileSeen.get(id);
  if (known !== undefined) return known;
  fileSeen.set(id, now);
  return now;
}

export function toRecordingSummary(row: RecordingRow, now: number = Date.now()): RecordingSummary {
  const embed = Array.isArray(row.live_classes) ? row.live_classes[0] : row.live_classes;
  return {
    id: row.id,
    status: row.status,
    errorMessage: row.error_message ?? null,
    createdAt: row.created_at,
    liveClassId: row.live_class_id ?? null,
    classTitle: typeof embed?.title === 'string' ? embed.title : null,
    classStartsAt: typeof embed?.starts_at === 'string' ? embed.starts_at : null,
    hasFile: row.has_file === true,
    claimedAt: row.claimed_at ?? null,
    fileSeenAt: trackFileSeen(row.id, row.status, row.has_file === true, now),
  };
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function fetchNotesViewer(): Promise<NotesViewer | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const role = data.role as NotesViewer['role'];
  return { id: data.id as string, role, isCoach: role !== 'member' };
}

/** Coach: every recording they uploaded, newest first (all five statuses). */
export async function fetchCoachRecordings(viewerId: string): Promise<RecordingSummary[]> {
  const { data, error } = await supabase
    .from('recordings')
    .select(RECORDING_COLUMNS)
    .eq('uploaded_by', viewerId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return ((data ?? []) as unknown as RecordingRow[]).map((row) => toRecordingSummary(row));
}

/** Member: published recordings (RLS narrows this to their own coach's). */
export async function fetchPublishedRecordings(): Promise<RecordingSummary[]> {
  const { data, error } = await supabase
    .from('recordings')
    .select(RECORDING_COLUMNS)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return ((data ?? []) as unknown as RecordingRow[]).map((row) => toRecordingSummary(row));
}

/** Null when the recording does not exist or is not visible (or the id is malformed). */
export async function fetchRecordingDetail(recordingId: string): Promise<RecordingDetail | null> {
  const { data, error } = await supabase
    .from('recordings')
    .select(RECORDING_COLUMNS)
    .eq('id', recordingId)
    .maybeSingle();
  if (error) {
    if (error.code === INVALID_UUID) return null;
    throw error;
  }
  if (!data) return null;
  const summary = toRecordingSummary(data as unknown as RecordingRow);

  // Only the note columns; the raw transcript lives in `transcripts` and is never selected here.
  const { data: note, error: noteError } = await supabase
    .from('workout_notes')
    .select('id, draft_content, edited_content, published_at')
    .eq('recording_id', recordingId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (noteError) throw noteError;

  const checklist = note
    ? (parseStoredChecklist(note.edited_content as string | null) ??
      parseStoredChecklist(note.draft_content as string | null))
    : null;

  return {
    ...summary,
    noteId: (note?.id as string | undefined) ?? null,
    checklist,
    publishedAt: (note?.published_at as string | null | undefined) ?? null,
  };
}

export async function fetchCoachClasses(coachId: string): Promise<CoachClass[]> {
  const { data, error } = await supabase
    .from('live_classes')
    .select('id, title, starts_at, status')
    .eq('coach_id', coachId)
    .order('starts_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as CoachClass[];
}

/**
 * One of the coach's own classes by id, or null when it does not exist or is not theirs. The
 * `?classId=` deep link uses this so it works for a class outside the 50 the list fetches.
 */
export async function fetchCoachClassById(coachId: string, classId: string): Promise<CoachClass | null> {
  const { data, error } = await supabase
    .from('live_classes')
    .select('id, title, starts_at, status')
    .eq('id', classId)
    .eq('coach_id', coachId)
    .maybeSingle();
  if (error) {
    if (error.code === INVALID_UUID) return null;
    throw error;
  }
  return (data as CoachClass | null) ?? null;
}

/** Saves the coach's edits as `edited_content` (the draft stays untouched). */
export async function saveEditedContent(noteId: string, json: string): Promise<void> {
  const { error } = await supabase.from('workout_notes').update({ edited_content: json }).eq('id', noteId);
  if (error) throw error;
}

/** Saves and publishes in one write; a DB trigger moves recordings.status to 'published'. */
export async function publishNote(noteId: string, json: string): Promise<void> {
  const { error } = await supabase
    .from('workout_notes')
    .update({ edited_content: json, published_at: new Date().toISOString() })
    .eq('id', noteId);
  if (error) throw error;
}

/**
 * Re-runs the pipeline for a stuck recording. Throws TranscriptionError.
 *
 * A 409 `conflict` is not a failure: it means a run already holds the recording. That is exactly
 * what happens when an earlier call timed out on the client but the server carried on, so the
 * retry resolves as "already processing" and the caller's refetch moves the coach forward.
 */
export async function retryTranscription(recordingId: string): Promise<'started' | 'already_processing'> {
  try {
    await invokeTranscription(recordingId);
    return 'started';
  } catch (e) {
    if (e instanceof TranscriptionError && e.code === 'conflict') return 'already_processing';
    throw e;
  }
}

/** Item keys the signed-in member has ticked off for this note. */
export async function fetchCheckedKeys(noteId: string): Promise<string[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from('workout_note_progress')
    .select('item_key')
    .eq('note_id', noteId)
    .eq('member_id', userId);
  if (error) throw error;
  return (data ?? []).map((row) => row.item_key as string);
}

export async function setItemChecked(noteId: string, itemKey: string, checked: boolean): Promise<void> {
  const userId = await currentUserId();
  if (!userId) throw new Error('Please sign in again.');
  if (checked) {
    const { error } = await supabase
      .from('workout_note_progress')
      .upsert(
        { member_id: userId, note_id: noteId, item_key: itemKey, checked_at: new Date().toISOString() },
        { onConflict: 'member_id,note_id,item_key' }
      );
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from('workout_note_progress')
    .delete()
    .eq('member_id', userId)
    .eq('note_id', noteId)
    .eq('item_key', itemKey);
  if (error) throw error;
}
