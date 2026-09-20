import { buildReportReason, isReportReason, MAX_REPORT_DETAILS_LENGTH, REPORT_REASONS } from './reportReasons';

describe('isReportReason', () => {
  it('accepts every preset and rejects anything else', () => {
    for (const reason of REPORT_REASONS) expect(isReportReason(reason)).toBe(true);

    expect(isReportReason('harassment')).toBe(false);
    expect(isReportReason('')).toBe(false);
    expect(isReportReason(null)).toBe(false);
    expect(isReportReason(3)).toBe(false);
  });
});

describe('buildReportReason', () => {
  it('rejects a missing or unknown preset', () => {
    expect(buildReportReason(null, '')).toEqual({ ok: false, error: 'Pick a reason.' });
    expect(buildReportReason('Made up', 'details')).toEqual({ ok: false, error: 'Pick a reason.' });
  });

  it('returns the bare preset when there are no details', () => {
    expect(buildReportReason('Spam', '')).toEqual({ ok: true, reason: 'Spam' });
    expect(buildReportReason('Harassment', '   \n ')).toEqual({ ok: true, reason: 'Harassment' });
  });

  it('appends trimmed details to the preset', () => {
    expect(buildReportReason('Inappropriate content', '  sent a rude photo ')).toEqual({
      ok: true,
      reason: 'Inappropriate content: sent a rude photo',
    });
  });

  it('requires details for "Other"', () => {
    expect(buildReportReason('Other', '  ')).toEqual({ ok: false, error: 'Tell us what happened.' });
    expect(buildReportReason('Other', 'Impersonating my coach')).toEqual({
      ok: true,
      reason: 'Other: Impersonating my coach',
    });
  });

  it('enforces the details length limit after trimming', () => {
    const atLimit = 'x'.repeat(MAX_REPORT_DETAILS_LENGTH);

    expect(buildReportReason('Spam', ` ${atLimit} `).ok).toBe(true);
    expect(buildReportReason('Spam', `${atLimit}x`).ok).toBe(false);
  });
});
