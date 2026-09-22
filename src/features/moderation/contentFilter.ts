import { ALLOWLIST, OBJECTIONABLE_WORDS } from './objectionableWords';

/**
 * A small, locale-neutral objectionable-text check for the three free-text fields other
 * members can see: the sign-up display name, the coach bio and the live-class title.
 *
 * Apple guideline 1.2 asks an app with user-generated content for "a method for filtering
 * objectionable material". This is that method's automated half; the other half is the
 * report/block flow and admin review, which stay the real backstop (see `objectionableWords.ts`).
 *
 * Deliberately modest: no ML, no network call, no per-user state. It runs on every keystroke's
 * submit, so it must be fast and must never reject a legitimate name.
 */

/** Leet substitutions folded before matching, so `f4ggot` and `sh!t` are caught. */
const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  '@': 'a',
  $: 's',
  '!': 'i',
  '+': 't',
};

/**
 * Folds text to a comparison form: NFKD decomposition, combining marks removed, lowercased
 * without a locale, leet digits mapped back to letters, runs of the same letter collapsed
 * (`fuuuuck` -> `fuck`), and every non-letter turned into a single space so word boundaries
 * survive `f.u.c.k` and `f_u_c_k`.
 *
 * `toLowerCase()` (not `toLocaleLowerCase()`) is intentional: the locale-sensitive form maps
 * Turkish `I` to `ı`, which would make the same string pass on one phone and fail on another.
 */
export function fold(input: string): string {
  const decomposed = input.normalize('NFKD').replace(/\p{M}+/gu, '');
  let out = '';
  for (const char of decomposed.toLowerCase()) {
    const mapped = LEET[char] ?? char;
    out += /\p{L}/u.test(mapped) ? mapped : ' ';
  }
  // Collapse trebled+ letters to a single letter; keep doubles, which are normal ("bball").
  return out.replace(/(\p{L})\1{2,}/gu, '$1').replace(/\s+/g, ' ').trim();
}

/** Collapses a doubled letter too, for a second pass that catches `fuckk` / `shiit`. */
function squeeze(folded: string): string {
  return folded.replace(/(\p{L})\1+/gu, '$1');
}

export type ContentField = 'displayName' | 'bio' | 'classTitle';

export type ContentFilterResult =
  | { ok: true }
  | { ok: false; reason: 'objectionable'; match: string }
  | { ok: false; reason: 'empty' }
  | { ok: false; reason: 'too_long'; max: number };

/** Field length caps, kept here so the inline error and the DB agree. */
export const MAX_LENGTH: Record<ContentField, number> = {
  // 120 = `FULL_NAME_MAX_LENGTH` and the `profiles_text_bounds` CHECK. Keeping the filter's cap
  // AT the server bound matters: a lower one here would reject names the app already accepts.
  displayName: 120,
  // `BIO_MAX` in src/features/coaching/validators.ts and `TITLE_MAX_LENGTH` in
  // src/features/liveClasses/scheduleForm.ts — same reason: never stricter than the form.
  bio: 500,
  classTitle: 80,
};

const FIELD_LABEL: Record<ContentField, string> = {
  displayName: 'name',
  bio: 'bio',
  classTitle: 'class title',
};

/**
 * WHOLE-TOKEN matching only.
 *
 * An earlier version also flagged a token that merely STARTED or ENDED with a listed word and
 * was at most four characters longer. That is the Scunthorpe problem wearing a disguise: it
 * rejected "Analysis" (starts with "anal", 8 <= 4+4) and "Cockburn", i.e. a real surname and an
 * ordinary fitness word. Missing "xxfuckxx" is a far cheaper mistake than refusing to let
 * someone sign up under their own name, and the report/block flow plus admin review are the
 * real backstop — so the prefix/suffix heuristic is deliberately gone.
 *
 * Each token is tested in two forms: as folded, and with repeated letters squeezed
 * ("shiit" -> "shit"). Squeezing per token, not across the whole string, keeps "Shiatsu"
 * ("shiatsu", no repeats) clear of "shit".
 */
function findObjectionableToken(folded: string): string | null {
  for (const token of folded.split(' ')) {
    if (!token) continue;
    const squeezed = squeeze(token);
    // An allowlisted place or surname is never a hit, wherever it sits in the sentence.
    if (ALLOWLIST.includes(token) || ALLOWLIST.includes(squeezed)) continue;
    for (const word of OBJECTIONABLE_WORDS) {
      if (token === word || squeezed === word) return word;
    }
  }
  return null;
}

/**
 * Checks one field. Returns the offending word so the caller can name it in the error — telling
 * a member "your name contains X" is far less confusing than a bare "not allowed".
 */
export function checkContent(value: string, field: ContentField): ContentFilterResult {
  const trimmed = value.trim();
  if (!trimmed) return { ok: false, reason: 'empty' };
  if (trimmed.length > MAX_LENGTH[field]) {
    return { ok: false, reason: 'too_long', max: MAX_LENGTH[field] };
  }

  const match = findObjectionableToken(fold(trimmed));
  return match ? { ok: false, reason: 'objectionable', match } : { ok: true };
}

/**
 * The friendly inline message. Never silent: a rejected value always says which field and why,
 * because a submit button that quietly does nothing is the worst possible moderation UX.
 */
export function contentFilterMessage(
  result: ContentFilterResult,
  field: ContentField,
): string | null {
  if (result.ok) return null;
  const label = FIELD_LABEL[field];
  switch (result.reason) {
    case 'empty':
      return `Please enter a ${label}.`;
    case 'too_long':
      return `Your ${label} is too long (maximum ${result.max} characters).`;
    case 'objectionable':
      return `Your ${label} contains a word we do not allow (“${result.match}”). Please choose something else — other members can see this.`;
  }
}

/** Convenience for a form: returns the message to show, or null when the value is fine. */
export function validateContent(value: string, field: ContentField): string | null {
  return contentFilterMessage(checkContent(value, field), field);
}
