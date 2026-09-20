export const TITLE_MAX_LENGTH = 80;
const MIN_LEAD_MS = 60_000;

export type ScheduleFormValues = { title: string; date: string; time: string };
export type ScheduleFormErrors = { title?: string; date?: string; time?: string; when?: string };
export type ScheduleFormResult =
  | { ok: true; title: string; startsAt: Date }
  | { ok: false; errors: ScheduleFormErrors };

/** Strict `YYYY-MM-DD` that must be a real calendar day. */
export function parseDateInput(input: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(input.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const probe = new Date(y, m - 1, d);
  if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) return null;
  return { y, m, d };
}

/** `H:MM` / `HH:MM` (24h) or `h:MM am|pm` (also `6pm`). */
export function parseTimeInput(input: string): { h: number; min: number } | null {
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(input.trim());
  if (!match) return null;
  let h = Number(match[1]);
  const min = match[2] === undefined ? 0 : Number(match[2]);
  const meridiem = match[3]?.toLowerCase();
  if (min > 59) return null;
  if (meridiem) {
    if (h < 1 || h > 12) return null;
    if (meridiem === 'pm' && h !== 12) h += 12;
    if (meridiem === 'am' && h === 12) h = 0;
  } else if (match[2] === undefined || h > 23) {
    // A bare number without am/pm or minutes ("18") is ambiguous; require H:MM.
    return null;
  }
  return { h, min };
}

/** Builds the start instant from the user's LOCAL wall-clock date and time. */
export function toLocalDate(date: { y: number; m: number; d: number }, time: { h: number; min: number }): Date {
  return new Date(date.y, date.m - 1, date.d, time.h, time.min, 0, 0);
}

export function validateScheduleForm(values: ScheduleFormValues, now: Date = new Date()): ScheduleFormResult {
  const errors: ScheduleFormErrors = {};
  const title = values.title.trim();
  if (!title) errors.title = 'Enter a class title.';
  else if (title.length > TITLE_MAX_LENGTH) errors.title = `Keep the title under ${TITLE_MAX_LENGTH} characters.`;

  const date = parseDateInput(values.date);
  if (!date) errors.date = 'Use the date format YYYY-MM-DD, e.g. 2026-10-03.';
  const time = parseTimeInput(values.time);
  if (!time) errors.time = 'Use a time like 18:00 or 6:00 pm.';

  if (date && time) {
    const startsAt = toLocalDate(date, time);
    if (startsAt.getTime() < now.getTime() + MIN_LEAD_MS) errors.when = 'Pick a time in the future.';
    else if (Object.keys(errors).length === 0) return { ok: true, title, startsAt };
  }
  return { ok: false, errors };
}

export function formatDateInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatTimeInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export type QuickPick = { label: string; date: string; time: string };

function atHour(base: Date, dayOffset: number, hour: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset, hour, 0, 0, 0);
}

/** Convenience chips. "Tonight 6pm" is omitted once 6pm has passed. */
export function quickPicks(now: Date = new Date()): QuickPick[] {
  const candidates: { label: string; at: Date }[] = [
    { label: 'Tonight 6pm', at: atHour(now, 0, 18) },
    { label: 'Tomorrow 7am', at: atHour(now, 1, 7) },
    { label: 'Tomorrow 6pm', at: atHour(now, 1, 18) },
  ];
  const daysToSaturday = ((6 - now.getDay() + 7) % 7) || 7;
  candidates.push({ label: 'Saturday 9am', at: atHour(now, daysToSaturday, 9) });
  return candidates
    .filter((c) => c.at.getTime() > now.getTime() + MIN_LEAD_MS)
    .map((c) => ({ label: c.label, date: formatDateInput(c.at), time: formatTimeInput(c.at) }));
}

function randomToken(length: number): string {
  let out = '';
  while (out.length < length) out += Math.random().toString(36).slice(2);
  return out.slice(0, length);
}

/** `dbf-<coach8>-<random8>`; the column is unique, so callers retry on a 23505 collision. */
export function generateChannelName(coachId: string): string {
  return `dbf-${coachId.replace(/-/g, '').slice(0, 8)}-${randomToken(8)}`;
}
