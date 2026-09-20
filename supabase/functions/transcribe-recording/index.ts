// transcribe-recording — runs the recording -> notes pipeline for ONE recording.
//
// POST { "recording_id": "<uuid>" } with the COACH's JWT (verify_jwt stays on).
//   200 { recording_id, status: "draft", note_id, transcript_chars, item_count, asr_provider, drafter_provider }
//   400 invalid_body | 401 unauthorized | 403 forbidden | 404 not_found
//   405 method_not_allowed | 409 conflict (already running / already transcribed) | 422 pipeline_failed
//
// Identity split, on purpose:
//   * the CALLER's JWT decides whether this run is allowed (getUser + public.can_manage_recording
//     evaluated under their own auth.uid(), so RLS is the authority, not a string comparison here);
//   * the SERVICE ROLE does the work, because the pipeline writes statuses the client is
//     trigger-forbidden from writing and mints a signed URL for a private bucket.
//
// Duplicate and concurrent invocations are collapsed by a compare-and-set on `status`
// ('uploading'|'failed' -> 'transcribing'); the loser gets 409 and nothing runs twice.
//
// Secrets: DEEPGRAM_API_KEY and ANTHROPIC_API_KEY are optional. When either is absent the
// corresponding adapter falls back to its deterministic offline mock, which is how the whole
// pipeline is exercisable locally. No key, transcript, or signed URL is ever logged or returned.
//
// This file is the ONLY Deno-specific one in the function; all logic lives in ./logic.ts and
// ../_shared/*.ts, which are portable and unit-tested under Jest.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { createAsr } from '../_shared/asr.ts';
import { createDrafter, type NoteChecklist } from '../_shared/drafter.ts';
import {
  mapPipelineError,
  parseRequestBody,
  PipelineError,
  rejectMethod,
  runTranscriptionPipeline,
  type PipelineStore,
  type RecordingRecord,
  type RecordingStatus,
} from './logic.ts';

const RECORDINGS_BUCKET = 'recordings';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function makeStore(service: SupabaseClient, caller: SupabaseClient, asrProvider: string): PipelineStore {
  return {
    async loadRecording(recordingId: string): Promise<RecordingRecord | null> {
      const { data, error } = await service
        .from('recordings')
        .select('id, uploaded_by, live_class_id, storage_path, status, claimed_at')
        .eq('id', recordingId)
        .maybeSingle();
      if (error) throw new Error(`could not load the recording: ${error.message}`);
      return (data as RecordingRecord | null) ?? null;
    },

    async callerCanManageRecording(recordingId: string): Promise<boolean> {
      const { data, error } = await caller.rpc('can_manage_recording', { p_recording: recordingId });
      if (error) throw new Error(`could not check permissions: ${error.message}`);
      return data === true;
    },

    async callerIsCoachOrAdmin(): Promise<boolean> {
      // As the CALLER: public.is_coach_or_admin() defaults to auth.uid() and reads profiles.role,
      // which only a privileged writer can set (20260919152000).
      const { data, error } = await caller.rpc('is_coach_or_admin');
      if (error) throw new Error(`could not check the caller's role: ${error.message}`);
      return data === true;
    },

    async claimForTranscription(
      recordingId: string,
      from: readonly RecordingStatus[],
      staleClaimBefore: string
    ): Promise<boolean> {
      // One statement, so two callers racing for the same row (or for the same expired lease)
      // cannot both win: PostgREST turns this into a single UPDATE ... WHERE, and the loser
      // matches no row. `claimed_at` is stamped here and nowhere else.
      const { data, error } = await service
        .from('recordings')
        .update({ status: 'transcribing', error_message: null, claimed_at: new Date().toISOString() })
        .eq('id', recordingId)
        .or(
          [
            `status.in.(${from.join(',')})`,
            `and(status.eq.transcribing,claimed_at.lt.${staleClaimBefore})`,
            `and(status.eq.transcribing,claimed_at.is.null)`,
          ].join(',')
        )
        .select('id');
      if (error) throw new Error(`could not claim the recording: ${error.message}`);
      return (data ?? []).length === 1;
    },

    async createSignedUrl(storagePath: string, expiresInSeconds: number): Promise<string> {
      const { data, error } = await service.storage
        .from(RECORDINGS_BUCKET)
        .createSignedUrl(storagePath, expiresInSeconds);
      if (error || !data?.signedUrl) {
        throw new PipelineError('pipeline_failed', 'the uploaded file could not be opened');
      }
      return data.signedUrl;
    },

    async saveTranscript(recordingId: string, rawText: string, segments: unknown): Promise<void> {
      const { error } = await service
        .from('transcripts')
        .upsert(
          { recording_id: recordingId, raw_text: rawText, segments, provider: asrProvider },
          { onConflict: 'recording_id' }
        );
      if (error) throw new Error(`could not save the transcript: ${error.message}`);
    },

    async saveDraftNote(recordingId: string, coachId: string, checklist: NoteChecklist): Promise<string> {
      // A retry must refresh the existing draft rather than pile up notes; a note the coach has
      // already published is never overwritten.
      const { data: existing, error: findError } = await service
        .from('workout_notes')
        .select('id')
        .eq('recording_id', recordingId)
        .is('published_at', null)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (findError) throw new Error(`could not look up the notes: ${findError.message}`);

      const draftContent = JSON.stringify(checklist);

      if (existing?.id) {
        const { error } = await service
          .from('workout_notes')
          .update({ draft_content: draftContent })
          .eq('id', existing.id);
        if (error) throw new Error(`could not save the draft notes: ${error.message}`);
        return existing.id as string;
      }

      const { data, error } = await service
        .from('workout_notes')
        .insert({ recording_id: recordingId, created_by: coachId, draft_content: draftContent })
        .select('id')
        .single();
      if (error) throw new Error(`could not save the draft notes: ${error.message}`);
      return data.id as string;
    },

    // Both terminal writes release the lease (claimed_at = null): the run is over, and a row left
    // holding a claim it no longer needs would only confuse the staleness check.
    async setStatus(recordingId: string, status: RecordingStatus): Promise<void> {
      const { error } = await service
        .from('recordings')
        .update({ status, claimed_at: null })
        .eq('id', recordingId);
      if (error) throw new Error(`could not update the recording status: ${error.message}`);
    },

    async markFailed(recordingId: string, message: string): Promise<void> {
      const { error } = await service
        .from('recordings')
        .update({ status: 'failed', error_message: message, claimed_at: null })
        .eq('id', recordingId);
      if (error) throw new Error(`could not record the failure: ${error.message}`);
    },

    async loadClassTitle(liveClassId: string | null): Promise<string | null> {
      if (!liveClassId) return null;
      const { data, error } = await service
        .from('live_classes')
        .select('title')
        .eq('id', liveClassId)
        .maybeSingle();
      if (error) throw new Error(`could not load the class: ${error.message}`);
      return (data?.title as string | undefined) ?? null;
    },
  };
}

Deno.serve(async (request: Request) => {
  const methodRejection = rejectMethod(request.method);
  if (methodRejection) {
    const mapped = mapPipelineError(methodRejection);
    return json(mapped.body, mapped.status);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('[transcribe-recording] missing platform env');
    return json({ error: 'server_error' }, 500);
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization) return json({ error: 'unauthorized' }, 401);

  const caller = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });

  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData?.user) return json({ error: 'unauthorized' }, 401);
  const callerId = userData.user.id;

  let recordingId: string;
  try {
    const raw = await request.json().catch(() => null);
    recordingId = parseRequestBody(raw).recordingId;
  } catch (error) {
    const mapped = mapPipelineError(error);
    return json(mapped.body, mapped.status);
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const fetchImpl = (url: string, init: RequestInit) => fetch(url, init);
  const asr = createAsr(Deno.env.get('DEEPGRAM_API_KEY'), fetchImpl);
  const drafter = createDrafter(Deno.env.get('ANTHROPIC_API_KEY'), fetchImpl);

  try {
    const result = await runTranscriptionPipeline({
      recordingId,
      callerId,
      store: makeStore(service, caller, asr.provider),
      asr,
      drafter,
    });
    return json(result, 200);
  } catch (error) {
    // Message only: it has already been through sanitizeErrorMessage (no URLs, no keys).
    console.error(
      `[transcribe-recording] recording ${recordingId} failed:`,
      error instanceof Error ? error.message : 'unknown error'
    );
    const mapped = mapPipelineError(error);
    return json(mapped.body, mapped.status);
  }
});
