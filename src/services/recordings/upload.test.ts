import {
  ALLOWED_RECORDING_MIME_TYPES,
  buildStoragePath,
  isAllowedRecordingMimeType,
  MAX_RECORDING_BYTES,
  normalizeMimeType,
  recordingUploadErrorMessage,
  RecordingUploadError,
  sanitizeFileName,
  validateRecordingFile,
} from './upload';

// upload.ts pulls in the Supabase client (and through it AsyncStorage's native module), which
// does not exist under Jest. These cases only exercise the pure helpers, so the client is stubbed.
jest.mock('../supabase/client', () => ({ supabase: {} }));

const COACH = '11111111-1111-1111-1111-111111111111';
const RECORDING = '33333333-3333-3333-3333-333333333333';

describe('sanitizeFileName', () => {
  it('keeps an already-safe name', () => {
    expect(sanitizeFileName('saturday-conditioning.mp4')).toBe('saturday-conditioning.mp4');
  });

  it('strips any directory part, so traversal cannot reach another prefix', () => {
    expect(sanitizeFileName('../../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('../../other-uid/session.mp4')).toBe('session.mp4');
    expect(sanitizeFileName('C:\\videos\\class.mov')).toBe('class.mov');
    expect(sanitizeFileName('..')).toBe('recording.mp4');
  });

  it('never leaves a path separator or a double dot behind', () => {
    for (const name of ['a/b/c.mp4', 'a\\b.mp4', '..%2f..%2fx.mp4', 'x/../../y.mp4', '....//..mp4']) {
      const safe = sanitizeFileName(name);
      expect(safe).not.toContain('/');
      expect(safe).not.toContain('\\');
      expect(safe).not.toContain('..');
    }
  });

  it('replaces spaces, unicode and control characters', () => {
    expect(sanitizeFileName('my class 🏋️.mp4')).toBe('my-class-.mp4');
    expect(sanitizeFileName('bad\u0000name\u001f.mp4')).toBe('badname.mp4');
  });

  it('falls back when nothing usable is left', () => {
    expect(sanitizeFileName('')).toBe('recording.mp4');
    expect(sanitizeFileName('   ')).toBe('recording.mp4');
    expect(sanitizeFileName('...')).toBe('recording.mp4');
    expect(sanitizeFileName('///')).toBe('recording.mp4');
  });

  it('truncates a very long name but keeps the extension', () => {
    const safe = sanitizeFileName(`${'a'.repeat(400)}.mp4`);
    expect(safe.length).toBeLessThanOrEqual(100);
    expect(safe.endsWith('.mp4')).toBe(true);
  });
});

describe('normalizeMimeType / isAllowedRecordingMimeType', () => {
  it('drops parameters and lowercases', () => {
    expect(normalizeMimeType('Video/MP4; codecs="avc1"')).toBe('video/mp4');
    expect(isAllowedRecordingMimeType('VIDEO/MP4')).toBe(true);
  });

  it('accepts every type the bucket allows', () => {
    for (const type of ALLOWED_RECORDING_MIME_TYPES) {
      expect(isAllowedRecordingMimeType(type)).toBe(true);
    }
  });

  it('refuses everything else', () => {
    for (const type of ['application/pdf', 'text/html', 'image/png', 'application/x-sh', '', null, undefined]) {
      expect(isAllowedRecordingMimeType(type)).toBe(false);
    }
  });
});

describe('validateRecordingFile', () => {
  const valid = { uri: 'file:///tmp/a.mp4', name: 'a.mp4', mimeType: 'video/mp4', size: 1024 };

  it('accepts a normal recording, and one with an unknown size', () => {
    expect(() => validateRecordingFile(valid)).not.toThrow();
    expect(() => validateRecordingFile({ ...valid, size: undefined })).not.toThrow();
  });

  it('refuses an unsupported type', () => {
    expect(() => validateRecordingFile({ ...valid, mimeType: 'application/pdf' })).toThrow(RecordingUploadError);
    try {
      validateRecordingFile({ ...valid, mimeType: 'application/pdf' });
    } catch (error) {
      expect((error as RecordingUploadError).code).toBe('unsupported_type');
    }
  });

  it('refuses a file over the bucket ceiling but allows one exactly at it', () => {
    expect(() => validateRecordingFile({ ...valid, size: MAX_RECORDING_BYTES })).not.toThrow();
    expect(() => validateRecordingFile({ ...valid, size: MAX_RECORDING_BYTES + 1 })).toThrow(/larger than/);
  });

  it('refuses an empty file or a file with no location', () => {
    expect(() => validateRecordingFile({ ...valid, size: 0 })).toThrow(/empty/);
    expect(() => validateRecordingFile({ ...valid, uri: '' })).toThrow(/no location/);
  });
});

describe('buildStoragePath', () => {
  it('builds <coach uid>/<recording id>/<safe name>', () => {
    expect(buildStoragePath(COACH, RECORDING, 'Saturday Class.mp4')).toBe(
      `${COACH}/${RECORDING}/Saturday-Class.mp4`
    );
  });

  it('cannot be steered out of the coach prefix by a hostile file name', () => {
    const path = buildStoragePath(COACH, RECORDING, '../../99999999-9999-9999-9999-999999999999/x.mp4');
    expect(path.startsWith(`${COACH}/`)).toBe(true);
    expect(path).toBe(`${COACH}/${RECORDING}/x.mp4`);
    expect(path.split('/')).toHaveLength(3);
  });

  it('refuses a non-uuid uploader or recording id', () => {
    expect(() => buildStoragePath('not-a-uuid', RECORDING, 'a.mp4')).toThrow(RecordingUploadError);
    expect(() => buildStoragePath(COACH, 'nope', 'a.mp4')).toThrow(RecordingUploadError);
  });
});

describe('recordingUploadErrorMessage', () => {
  it('returns copy for every known code and a safe default otherwise', () => {
    expect(recordingUploadErrorMessage(new RecordingUploadError('file_too_large', 'x'))).toMatch(/500 MB/);
    expect(recordingUploadErrorMessage(new RecordingUploadError('nonsense' as never, 'x'))).toMatch(
      /upload did not finish/
    );
    expect(recordingUploadErrorMessage(new Error('boom'))).toMatch(/upload did not finish/);
  });

  it('keeps the recording id on a post-create failure so the caller can retry', () => {
    const error = new RecordingUploadError('transcribe_failed', 'x', RECORDING);
    expect(error.recordingId).toBe(RECORDING);
  });
});
