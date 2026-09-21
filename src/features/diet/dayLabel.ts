/**
 * The date header on Food, and the copy that goes with a part-done day.
 *
 * The screen's day is the UTC day (see `dates.ts`), so the label is formatted
 * from the same `YYYY-MM-DD` string the check-ins are filed under — formatting
 * a `new Date()` in the device's zone would sometimes name a different day than
 * the one the ticks belong to.
 */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Sunday 20 September" for a `YYYY-MM-DD` day; the raw string if it is not one. */
export function dayHeading(dateString: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (!match) return dateString;

  const [, year, month, day] = match;
  const monthIndex = Number(month) - 1;
  if (monthIndex < 0 || monthIndex > 11) return dateString;

  const date = new Date(Date.UTC(Number(year), monthIndex, Number(day)));
  if (Number.isNaN(date.getTime())) return dateString;

  return `${WEEKDAYS[date.getUTCDay()]} ${Number(day)} ${MONTHS[monthIndex]}`;
}

/** "2 of 5 eaten" — the Food equivalent of the day detail's progress line. */
export function dietProgress(checked: number, total: number): string {
  return `${checked} of ${total} ticked off`;
}
