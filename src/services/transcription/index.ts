// Recording -> notes transcription, client side.
//
// There is exactly ONE path: the `transcribe-recording` Edge Function runs ASR and the notes
// drafter server-side, behind the coach's JWT, with the API keys held as function secrets. The
// earlier client-side `TranscriptionService` / `createMockTranscriptionService` scaffold has been
// removed — a device never talks to an ASR provider directly, and never holds those keys.
//
// Upload lives next door in src/services/recordings.

export * from './types';
export { invokeTranscription, readFunctionError } from './invokeTranscription';
