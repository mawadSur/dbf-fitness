export const REPORT_REASONS = ['Harassment', 'Spam', 'Inappropriate content', 'Other'] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export const MAX_REPORT_DETAILS_LENGTH = 500;

export type ReportReasonResult = { ok: true; reason: string } | { ok: false; error: string };

export function isReportReason(value: unknown): value is ReportReason {
  return typeof value === 'string' && (REPORT_REASONS as readonly string[]).includes(value);
}

/**
 * Validates the report form and builds the `moderation_reports.reason` text:
 * the preset alone, or "<preset>: <details>" when the reporter added free text.
 * "Other" has no meaning on its own, so it requires details.
 */
export function buildReportReason(preset: string | null, details: string): ReportReasonResult {
  if (!isReportReason(preset)) return { ok: false, error: 'Pick a reason.' };

  const trimmed = details.trim();
  if (trimmed.length > MAX_REPORT_DETAILS_LENGTH) {
    return { ok: false, error: `Keep details under ${MAX_REPORT_DETAILS_LENGTH} characters.` };
  }
  if (preset === 'Other' && trimmed === '') {
    return { ok: false, error: 'Tell us what happened.' };
  }

  return { ok: true, reason: trimmed === '' ? preset : `${preset}: ${trimmed}` };
}
