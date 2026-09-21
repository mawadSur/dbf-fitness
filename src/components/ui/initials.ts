/**
 * Name tokens that are a TITLE rather than part of the person's name.
 *
 * The seeded coaches are called "Coach Dana Reyes" and "Coach Marcus Bell", so
 * a first-letter avatar drew a "C" for both of them and the picker's avatars
 * distinguished nobody. The honorific is dropped before initials are taken, so
 * those two read "DR" and "MB" — the same rule the group roster already used
 * for members ("RP", "SR").
 *
 * Matched case-insensitively and without trailing punctuation, so "Dr.", "dr"
 * and "DR" are all the same token. A name that is ONLY an honorific keeps it:
 * dropping every token would leave nothing to draw.
 */
export const HONORIFICS: ReadonlySet<string> = new Set([
  'coach',
  'dr',
  'prof',
  'mr',
  'mrs',
  'ms',
  'mx',
  'miss',
  'sir',
]);

function isHonorific(word: string): boolean {
  return HONORIFICS.has(word.replace(/[.,]+$/, '').toLowerCase());
}

/**
 * Up to two uppercase initials for an avatar; "?" when the name has no letters.
 *
 * The one implementation, used by both the community roster and the coaching
 * avatars — two streams that had drifted onto a one-letter and a two-letter
 * rule for the same visual element.
 */
export function initialsOf(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  // Only leading honorifics are dropped, and never the last remaining word.
  let start = 0;
  while (start < words.length - 1 && isHonorific(words[start])) start += 1;
  const named = words.slice(start);
  if (named.length === 0) return '?';

  const first = Array.from(named[0])[0] ?? '';
  const last = named.length > 1 ? (Array.from(named[named.length - 1])[0] ?? '') : '';
  const initials = `${first}${last}`.toUpperCase();
  return initials.length > 0 ? initials : '?';
}
