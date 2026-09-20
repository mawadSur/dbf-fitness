import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Text, View } from 'react-native';

import { BottomActionBar } from '../../src/components/notes/BottomActionBar';
import { NotesButton } from '../../src/components/notes/NotesButton';
import { NotesScreenShell } from '../../src/components/notes/NotesScreenShell';
import { formatRecordingDate } from '../../src/components/notes/RecordingListItem';
import { StateMessage } from '../../src/components/notes/StateMessage';
import { retryTranscription } from '../../src/features/notes/api';
import { useCoachClasses, useDeepLinkedClass, useNotesViewer } from '../../src/features/notes/hooks';
import { pickRecordingFile } from '../../src/features/notes/pickRecordingFile';
import type { CoachClass } from '../../src/features/notes/types';
import {
  RecordingUploadError,
  recordingUploadErrorMessage,
  uploadRecording,
  validateRecordingFile,
  type RecordingFile,
} from '../../src/services/recordings';
import { transcriptionErrorMessage } from '../../src/services/transcription/types';
import { colors } from '../../src/theme/tokens';
import { PressableBase } from '../../src/components/ui/PressableBase';

function formatSize(bytes?: number): string {
  if (typeof bytes !== 'number') return '';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function UploadRecordingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ classId?: string | string[] }>();
  const classIdParam = Array.isArray(params.classId) ? params.classId[0] : params.classId;

  const viewerQuery = useNotesViewer();
  const viewer = viewerQuery.data ?? null;
  const classesQuery = useCoachClasses(viewer?.isCoach ? viewer.id : undefined);

  const [pickedId, setPickedId] = useState<string | null>(null);
  const [file, setFile] = useState<RecordingFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [failedRecordingId, setFailedRecordingId] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const listedClasses = useMemo(() => classesQuery.data ?? [], [classesQuery.data]);
  const listedHit = !!classIdParam && listedClasses.some((c) => c.id === classIdParam);

  // The list only holds the newest 50 classes. A deep link to an older one is fetched by id (the
  // query also enforces coach_id = me, so someone else's class comes back null).
  const linkedQuery = useDeepLinkedClass(
    viewer?.isCoach ? viewer.id : undefined,
    classesQuery.isSuccess && !listedHit ? classIdParam : undefined
  );
  const linkedClass = listedHit ? null : (linkedQuery.data ?? null);
  const classes = useMemo(
    () => (linkedClass ? [linkedClass, ...listedClasses] : listedClasses),
    [linkedClass, listedClasses]
  );

  // Honour ?classId= (only if it is one of the coach's own classes) until they pick another.
  const deepLinkedId = listedHit ? classIdParam : (linkedClass?.id ?? null);
  const selectedId = pickedId ?? deepLinkedId;

  const deepLinkNotMine =
    !!classIdParam && classesQuery.isSuccess && !listedHit && linkedQuery.isSuccess && !linkedClass;

  const choose = async () => {
    if (busy.current) return;
    setFileError(null);
    try {
      const picked = await pickRecordingFile();
      if (picked.kind === 'cancelled') return; // dismissing the picker is not an error
      validateRecordingFile(picked.file);
      if (mounted.current) setFile(picked.file);
    } catch (e) {
      if (mounted.current) {
        setFile(null);
        setFileError(
          e instanceof RecordingUploadError
            ? recordingUploadErrorMessage(e)
            : 'Could not open the file picker. Please try again.'
        );
      }
    }
  };

  /**
   * The upload SUCCEEDED and only the hand-off to the pipeline failed, so the recording and its
   * file already exist. Running uploadRecording again here would create a second row and a second
   * object; the fix is to re-invoke the function for the row we already have.
   */
  const retryHandoff = async () => {
    if (busy.current || !failedRecordingId) return;
    busy.current = true;
    setRetrying(true);
    setUploadError(null);
    try {
      await retryTranscription(failedRecordingId);
      router.replace(`/notes/${failedRecordingId}`);
    } catch (e) {
      if (mounted.current) setUploadError(transcriptionErrorMessage(e));
    } finally {
      busy.current = false;
      if (mounted.current) setRetrying(false);
    }
  };

  const upload = async () => {
    // A stranded recording is retried, never re-uploaded (see retryHandoff).
    if (busy.current || !file || !selectedId || failedRecordingId) return;
    busy.current = true;
    setUploading(true);
    setUploadError(null);
    setFailedRecordingId(null);
    setProgress(0);
    try {
      const result = await uploadRecording({
        liveClassId: selectedId,
        file,
        onProgress: (fraction) => {
          if (mounted.current) setProgress(fraction);
        },
      });
      router.replace(`/notes/${result.recordingId}`);
    } catch (e) {
      if (!mounted.current) return;
      setUploadError(recordingUploadErrorMessage(e));
      // The row exists (only the pipeline hand-off failed): the coach can open it and retry there.
      if (e instanceof RecordingUploadError && e.recordingId) setFailedRecordingId(e.recordingId);
    } finally {
      busy.current = false;
      if (mounted.current) {
        setUploading(false);
        setProgress(null);
      }
    }
  };

  if (viewerQuery.isLoading) {
    return (
      <NotesScreenShell title="Upload recording" fallbackHref="/notes">
        <StateMessage kind="loading" />
      </NotesScreenShell>
    );
  }
  if (viewerQuery.isError || !viewer) {
    return (
      <NotesScreenShell title="Upload recording" fallbackHref="/notes">
        <StateMessage
          kind="error"
          title="Could not load your account"
          message="Check your connection and try again."
          onRetry={() => void viewerQuery.refetch()}
        />
      </NotesScreenShell>
    );
  }
  if (!viewer.isCoach) {
    return (
      <NotesScreenShell title="Upload recording" fallbackHref="/notes">
        <StateMessage
          kind="denied"
          title="Coaches only"
          message="Only coaches can upload class recordings."
        />
      </NotesScreenShell>
    );
  }

  const ready = !!file && !!selectedId && !uploading;
  const percent = progress === null ? 0 : Math.round(progress * 100);

  return (
    <NotesScreenShell title="Upload recording" fallbackHref="/notes">
      {classesQuery.isLoading ? (
        <StateMessage kind="loading" />
      ) : classesQuery.isError ? (
        <StateMessage
          kind="error"
          title="Could not load your classes"
          message="Check your connection and try again."
          onRetry={() => void classesQuery.refetch()}
        />
      ) : (
        <>
          <FlatList
            data={classes}
            keyExtractor={(c: CoachClass) => c.id}
            keyboardShouldPersistTaps="handled"
            extraData={[selectedId, file, uploading]}
            contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 8 }}
            ListHeaderComponent={
              <View style={{ gap: 8, marginBottom: 4 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#0F172A' }}>1. Choose the class</Text>
                {deepLinkNotMine ? (
                  <Text style={{ fontSize: 13, color: '#B91C1C' }}>
                    That class is not one of yours. Pick one below.
                  </Text>
                ) : null}
              </View>
            }
            ListEmptyComponent={
              <StateMessage
                kind="empty"
                title="No classes yet"
                message="Schedule a live class first, then upload its recording."
              />
            }
            renderItem={({ item }) => {
              const selected = item.id === selectedId;
              return (
                <PressableBase
                  onPress={() => setPickedId(item.id)}
                  disabled={uploading}
                  accessibilityRole="radio"
                  accessibilityLabel={item.title}
                  accessibilityState={{ selected, disabled: uploading }}
                  android_ripple={{ color: '#D1FAE5' }}
                  pressFeedback={0.75}
                  // Layout NEVER goes in a style callback — see `PressableBase`.
                  style={{
                    minHeight: 56,
                    borderWidth: 2,
                    borderColor: selected ? colors.primary : '#E2E8F0',
                    backgroundColor: selected ? '#F0FDF4' : '#F8FAFC',
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    justifyContent: 'center',
                  }}
                >
                  <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '600', color: '#0F172A' }}>
                    {item.title}
                  </Text>
                  <Text style={{ fontSize: 13, color: '#475569' }}>{formatRecordingDate(item.starts_at)}</Text>
                </PressableBase>
              );
            }}
            ListFooterComponent={
              <View style={{ gap: 8, marginTop: 16 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#0F172A' }}>2. Choose the recording</Text>
                <NotesButton
                  label={file ? 'Choose a different file' : 'Choose video or audio file'}
                  variant="secondary"
                  disabled={uploading}
                  onPress={() => void choose()}
                />
                {file ? (
                  <Text numberOfLines={2} style={{ fontSize: 14, color: '#0F172A' }}>
                    {file.name}
                    {file.size !== undefined ? `  (${formatSize(file.size)})` : ''}
                  </Text>
                ) : (
                  <Text style={{ fontSize: 12, color: '#475569' }}>
                    MP4, MOV, M4A, MP3 and similar. Up to 500 MB.
                  </Text>
                )}
                {fileError ? (
                  <Text accessibilityRole="alert" style={{ fontSize: 14, color: '#B91C1C' }}>
                    {fileError}
                  </Text>
                ) : null}
              </View>
            }
          />

          <BottomActionBar>
            {uploading ? (
              <View style={{ gap: 6 }} accessibilityLiveRegion="polite">
                <View
                  accessibilityRole="progressbar"
                  accessibilityLabel={`Uploading, ${percent} percent`}
                  accessibilityValue={{ min: 0, max: 100, now: percent }}
                  style={{ height: 8, borderRadius: 4, backgroundColor: colors.primaryMuted, overflow: 'hidden' }}
                >
                  <View style={{ height: 8, width: `${percent}%`, backgroundColor: colors.primary }} />
                </View>
                <Text style={{ fontSize: 13, color: '#475569' }}>
                  {`Uploading ${percent}%. Keep this screen open until it finishes; long videos can take a while.`}
                </Text>
              </View>
            ) : null}
            {uploadError ? (
              <Text accessibilityRole="alert" style={{ fontSize: 14, color: '#B91C1C' }}>
                {uploadError}
              </Text>
            ) : null}
            {failedRecordingId ? (
              // The file is already uploaded: offer the retry that finishes the job, never a
              // second upload of the same recording.
              <View style={{ gap: 8 }}>
                <NotesButton
                  label="Retry transcription"
                  busy={retrying}
                  disabled={retrying}
                  onPress={() => void retryHandoff()}
                />
                <NotesButton
                  label="Open recording"
                  variant="secondary"
                  disabled={retrying}
                  onPress={() => router.replace(`/notes/${failedRecordingId}`)}
                />
              </View>
            ) : (
              <NotesButton
                label={uploadError ? 'Try again' : 'Upload recording'}
                busy={uploading}
                disabled={!ready}
                onPress={() => void upload()}
              />
            )}
          </BottomActionBar>
        </>
      )}
    </NotesScreenShell>
  );
}
