import type { CoachProfileFieldErrors, CoachProfileInput } from './types';

export const BIO_MAX = 500;
export const SPECIALTIES_MAX_COUNT = 8;
export const SPECIALTY_MAX_LENGTH = 30;

/** Length in Unicode code points (matches Postgres char_length), not UTF-16 units. */
function length(s: string): number {
  return Array.from(s).length;
}

/** Returns an error message, or null when valid. Surrounding whitespace is ignored. */
export function validateBio(bio: string): string | null {
  return length(bio.trim()) > BIO_MAX ? `Bio must be ${BIO_MAX} characters or fewer.` : null;
}

/** Trim, drop empties, dedupe case-insensitively (first spelling wins). */
export function normalizeSpecialties(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const item = raw.trim();
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export type SpecialtiesResult = { value: string[]; error: string | null };

export function validateSpecialties(items: readonly string[]): SpecialtiesResult {
  const value = normalizeSpecialties(items);
  if (value.length > SPECIALTIES_MAX_COUNT) {
    return { value, error: `Add at most ${SPECIALTIES_MAX_COUNT} specialties.` };
  }
  if (value.some((s) => length(s) > SPECIALTY_MAX_LENGTH)) {
    return {
      value,
      error: `Each specialty must be ${SPECIALTY_MAX_LENGTH} characters or fewer.`,
    };
  }
  return { value, error: null };
}

export type CoachProfileValidation = {
  ok: boolean;
  errors: CoachProfileFieldErrors;
  /** Normalized values, safe to save when ok. */
  value: CoachProfileInput;
};

export function validateCoachProfile(input: CoachProfileInput): CoachProfileValidation {
  const errors: CoachProfileFieldErrors = {};
  const bioError = validateBio(input.bio);
  if (bioError) errors.bio = bioError;
  const spec = validateSpecialties(input.specialties);
  if (spec.error) errors.specialties = spec.error;
  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: {
      bio: input.bio.trim(),
      specialties: spec.value,
      acceptingMembers: input.acceptingMembers,
    },
  };
}
