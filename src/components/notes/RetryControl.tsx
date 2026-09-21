import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { retryTranscription } from '../../features/notes/api';
import { RETRY_COPY, retryAction, uploadHref, type RetryReason } from '../../features/notes/status';
import { transcriptionErrorMessage } from '../../services/transcription/types';
import { Banner } from '../ui';
import { NotesButton } from './NotesButton';

type Props = {
  recordingId: string;
  liveClassId: string | null;
  reason: RetryReason;
  onRefetch: () => void;
};

/**
 * The one control that re-runs the pipeline. Shared by the failed panel and the in-flight panel,
 * because a recording stuck at 'uploading' (file up, hand-off lost) or at 'transcribing' with an
 * expired lease needs exactly the same call — and without it the coach has no way out: the status
 * machine is trigger-protected, so they cannot move the row themselves.
 */
export function RetryControl({ recordingId, liveClassId, reason, onRefetch }: Props) {
  const router = useRouter();
  const label = RETRY_COPY[reason].label;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  const retry = async () => {
    // No file was ever uploaded, so there is nothing to transcribe: go back to the upload screen.
    if (retryAction(reason) === 'upload') {
      router.push(uploadHref(liveClassId));
      return;
    }
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await retryTranscription(recordingId);
    } catch (e) {
      setError(transcriptionErrorMessage(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
      onRefetch();
    }
  };

  return (
    <View style={{ gap: 8 }}>
      {error ? <Banner tone="danger" title="That did not work" message={error} /> : null}
      <NotesButton label={label} busy={busy} onPress={() => void retry()} />
    </View>
  );
}
