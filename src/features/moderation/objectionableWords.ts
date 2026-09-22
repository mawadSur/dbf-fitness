/**
 * The ONE place the objectionable-word list lives.
 *
 * Scope and honesty: this is a first line of defence, NOT a guarantee. It catches the lazy,
 * obvious cases (a slur typed into a display name, a porn word in a class title) at the moment
 * of typing, so the value never reaches other members' screens. It will miss obfuscation,
 * context, images, speech in a live class, and every language we have not listed. Human admin
 * review plus the report/block flow remain the real backstop — see `docs/legal/terms-of-service.md`
 * for the 24-hour commitment Apple guideline 1.2 expects.
 *
 * Locale-neutral by construction: matching is done on a NFKD-folded, diacritic-stripped,
 * lowercase form via `String.prototype.normalize`, never via a locale-sensitive comparison, so
 * the same input is judged identically on a Turkish phone (the dotless-i trap) and an English one.
 *
 * Curation rules for anyone editing this list:
 *  - whole words only — substrings cause the Scunthorpe problem (a member called "Cassandra"
 *    must not be rejected). `contentFilter` enforces word boundaries; do not add fragments.
 *  - no reclaimed or medical vocabulary: "breast", "sex" and similar belong in a fitness and
 *    health app and are deliberately absent.
 *  - no names of protected groups on their own — only slurs.
 */

/** Slurs and sexual/graphic terms that have no legitimate use in a name, bio or class title. */
export const OBJECTIONABLE_WORDS: readonly string[] = [
  // Sexual / adult
  'anal',
  'blowjob',
  'cock',
  'cum',
  'cunt',
  'deepthroat',
  'dildo',
  'handjob',
  'jizz',
  'porn',
  'porno',
  'pornhub',
  'pussy',
  'rape',
  'rapist',
  'whore',
  // Profanity strong enough to reject in a public-facing name
  'bastard',
  'bitch',
  'fuck',
  'fucker',
  'fucking',
  'motherfucker',
  'shit',
  'wanker',
  // Slurs (racial, ethnic, religious, homophobic, transphobic, ableist)
  'chink',
  'coon',
  'dyke',
  'fag',
  'faggot',
  'kike',
  'nigga',
  'nigger',
  'paki',
  'raghead',
  'retard',
  'retarded',
  'spic',
  'tranny',
  'wetback',
  // Violent / illegal solicitation
  'childporn',
  // NOTE: the two-letter abbreviation for the same thing is deliberately NOT listed — as a
  // whole word it collides with ordinary initials, and a two-letter rule is all false positives.
  'pedo',
  'pedophile',
];

/**
 * Words that look like a hit under leet-speak folding but are ordinary English. Checked BEFORE
 * the word list so `contentFilter` does not reject them.
 */
export const ALLOWLIST: readonly string[] = ['scunthorpe', 'cockburn', 'penistone', 'cumbria'];
