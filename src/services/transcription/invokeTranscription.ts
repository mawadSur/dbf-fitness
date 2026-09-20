import { supabase } from '../supabase/client';

import { TranscriptionError, type TranscriptionErrorCode, type TranscriptionResult } from './types';

const KNOWN_CODES: readonly TranscriptionErrorCode[] = [
  'method_not_allowed',
  'invalid_body',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'pipeline_failed',
  'server_error',
  'network_error',
];

function codeForStatus(status: number): TranscriptionErrorCode {
  switch (status) {
    case 400:
      return 'invalid_body';
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 409:
      return 'conflict';
    case 422:
      return 'pipeline_failed';
    default:
      return 'server_error';
  }
}

/**
 * Reads the function's `{ error, message }` body. supabase-js surfaces a non-2xx as a
 * FunctionsHttpError whose `context` is the raw Response, so the server's own code is only
 * reachable by re-reading the body — which is worth doing, because "already transcribing" and
 * "not your recording" need different UI.
 *
 * Exported for tests; `response` is deliberately typed loosely so a fake works.
 */
export async function readFunctionError(response: {
  status?: number;
  json?: () => Promise<unknown>;
}): Promise<TranscriptionError> {
  const status = typeof response?.status === 'number' ? response.status : null;
  let code: TranscriptionErrorCode = status === null ? 'server_error' : codeForStatus(status);
  let message = 'transcription failed';

  try {
    const body = (await response?.json?.()) as { error?: unknown; message?: unknown } | undefined;
    if (body && typeof body.error === 'string' && (KNOWN_CODES as string[]).includes(body.error)) {
      code = body.error as TranscriptionErrorCode;
    }
    if (body && typeof body.message === 'string' && body.message !== '') {
      message = body.message;
    }
  } catch {
    // Body already consumed, empty, or not JSON — the HTTP status is still a usable answer.
  }

  return new TranscriptionError(code, message, status);
}

/**
 * Asks the `transcribe-recording` Edge Function to run the pipeline for one recording. The
 * function does the work; this is only the call. Throws a TranscriptionError on every failure so
 * callers never have to inspect an untyped `error`.
 *
 * Safe to call again after a failure: the recording goes back to 'failed' and a retry restarts it.
 * Calling it while a run is in flight returns `conflict` and starts nothing.
 */
export async function invokeTranscription(recordingId: string): Promise<TranscriptionResult> {
  const { data, error } = await supabase.functions.invoke<TranscriptionResult>('transcribe-recording', {
    body: { recording_id: recordingId },
  });

  if (error) {
    const context = (error as { context?: { status?: number; json?: () => Promise<unknown> } }).context;
    if (context && typeof context.status === 'number') {
      throw await readFunctionError(context);
    }
    throw new TranscriptionError('network_error', error.message ?? 'transcription request failed');
  }

  if (!data || data.status !== 'draft') {
    throw new TranscriptionError('server_error', 'transcription returned an unexpected response');
  }

  return data;
}
