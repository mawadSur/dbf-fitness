import { TRANSCRIPTION_LEASE_MS, type RecordingStatus } from '../../services/transcription/types';
import {
  canRetry,
  HANDOFF_GRACE_MS,
  retryAction,
  uploadHref,
  isInFlight,
  POLL_INTERVAL_MS,
  pollIntervalFor,
  RETRY_COPY,
  retryReason,
  STALLED_POLL_INTERVAL_MS,
  STATUS_UI,
  statusUi,
  type RetryCandidate,
} from './status';

const ALL: RecordingStatus[] = ['uploading', 'transcribing', 'draft', 'published', 'failed'];

const NOW = Date.UTC(2026, 8, 19, 12, 0, 0);
const FRESH_CLAIM = new Date(NOW - 60_000).toISOString();
const EXPIRED_CLAIM = new Date(NOW - TRANSCRIPTION_LEASE_MS - 1000).toISOString();

function rec(overrides: Partial<RetryCandidate> = {}): RetryCandidate {
  return { status: 'draft', hasFile: true, claimedAt: null, ...overrides };
}

describe('status mapping', () => {
  it('covers all five statuses with a label and description', () => {
    expect(Object.keys(STATUS_UI).sort()).toEqual([...ALL].sort());
    for (const status of ALL) {
      expect(statusUi(status).label.length).toBeGreaterThan(0);
      expect(statusUi(status).description.length).toBeGreaterThan(0);
    }
  });

  it('uses distinct labels', () => {
    expect(new Set(ALL.map((s) => statusUi(s).label)).size).toBe(5);
  });

  it('failed is the only danger tone; published the only success', () => {
    expect(ALL.filter((s) => statusUi(s).tone === 'danger')).toEqual(['failed']);
    expect(ALL.filter((s) => statusUi(s).tone === 'success')).toEqual(['published']);
  });
});

describe('polling policy', () => {
  it('polls every ~3 s only while uploading or transcribing', () => {
    expect(POLL_INTERVAL_MS).toBe(3000);
    expect(pollIntervalFor(rec({ status: 'uploading', hasFile: false }), NOW)).toBe(3000);
    expect(pollIntervalFor(rec({ status: 'transcribing', claimedAt: FRESH_CLAIM }), NOW)).toBe(3000);
  });

  it('stops for terminal/resting states and before the first fetch', () => {
    expect(pollIntervalFor(rec({ status: 'draft' }), NOW)).toBe(false);
    expect(pollIntervalFor(rec({ status: 'published' }), NOW)).toBe(false);
    expect(pollIntervalFor(rec({ status: 'failed' }), NOW)).toBe(false);
    expect(pollIntervalFor(undefined, NOW)).toBe(false);
    expect(pollIntervalFor(null, NOW)).toBe(false);
  });

  it('backs off instead of hammering a recording nothing is working on', () => {
    expect(pollIntervalFor(rec({ status: 'uploading', hasFile: true }), NOW)).toBe(STALLED_POLL_INTERVAL_MS);
    expect(pollIntervalFor(rec({ status: 'transcribing', claimedAt: EXPIRED_CLAIM }), NOW)).toBe(
      STALLED_POLL_INTERVAL_MS
    );
    expect(STALLED_POLL_INTERVAL_MS).toBeGreaterThan(POLL_INTERVAL_MS);
  });

  it('isInFlight matches the polling states', () => {
    expect(ALL.filter(isInFlight)).toEqual(['uploading', 'transcribing']);
  });
});

describe('retryReason', () => {
  it('offers a retry for a failed recording', () => {
    expect(retryReason(rec({ status: 'failed' }), NOW)).toBe('failed');
  });

  it('offers a retry when the file is up but the pipeline hand-off was lost', () => {
    expect(retryReason(rec({ status: 'uploading', hasFile: true }), NOW)).toBe('upload_stalled');
  });

  it('offers nothing while the file is still going up', () => {
    expect(retryReason(rec({ status: 'uploading', hasFile: false }), NOW)).toBeNull();
  });

  it('offers a retry once a transcription lease has expired, but not before', () => {
    expect(retryReason(rec({ status: 'transcribing', claimedAt: FRESH_CLAIM }), NOW)).toBeNull();
    expect(retryReason(rec({ status: 'transcribing', claimedAt: EXPIRED_CLAIM }), NOW)).toBe(
      'transcription_stalled'
    );
    // A transcribing row with no lease at all was left behind by a run that is long gone.
    expect(retryReason(rec({ status: 'transcribing', claimedAt: null }), NOW)).toBe('transcription_stalled');
  });

  it('never offers a retry for a finished recording', () => {
    for (const status of ['draft', 'published'] as RecordingStatus[]) {
      expect(retryReason(rec({ status, claimedAt: EXPIRED_CLAIM }), NOW)).toBeNull();
      expect(canRetry(rec({ status }), NOW)).toBe(false);
    }
  });

  it('has copy for every reason', () => {
    for (const reason of ['failed', 'upload_stalled', 'transcription_stalled'] as const) {
      expect(RETRY_COPY[reason].label.length).toBeGreaterThan(0);
      expect(RETRY_COPY[reason].explanation.length).toBeGreaterThan(0);
    }
  });
});

describe('abandoned uploads and hand-off grace', () => {
  const old = new Date(NOW - 2 * 3600_000).toISOString();
  const fresh = new Date(NOW - 60_000).toISOString();

  it('file-less uploading: null while young, upload_incomplete once abandoned, then polling stops', () => {
    expect(retryReason(rec({ status: 'uploading', hasFile: false, createdAt: fresh }), NOW)).toBeNull();
    expect(pollIntervalFor(rec({ status: 'uploading', hasFile: false, createdAt: fresh }), NOW)).toBe(POLL_INTERVAL_MS);
    const abandoned = rec({ status: 'uploading', hasFile: false, createdAt: old });
    expect(retryReason(abandoned, NOW)).toBe('upload_incomplete');
    expect(pollIntervalFor(abandoned, NOW)).toBe(false);
    expect(RETRY_COPY.upload_incomplete.label).toBe('Retry upload');
    expect(retryAction('upload_incomplete')).toBe('upload');
    expect(retryAction('failed')).toBe('transcribe');
  });

  it('file just seen: no alarm inside the grace window, stalled after it', () => {
    const base = { status: 'uploading' as const, hasFile: true };
    expect(retryReason(rec({ ...base, fileSeenAt: NOW - 5_000 }), NOW)).toBeNull();
    expect(retryReason(rec({ ...base, fileSeenAt: NOW - HANDOFF_GRACE_MS - 1 }), NOW)).toBe('upload_stalled');
    expect(retryReason(rec({ ...base, fileSeenAt: null }), NOW)).toBe('upload_stalled');
  });

  it('uploadHref keeps the class', () => {
    expect(uploadHref('a b')).toBe('/notes/upload?classId=a%20b');
    expect(uploadHref(null)).toBe('/notes/upload');
  });
});
