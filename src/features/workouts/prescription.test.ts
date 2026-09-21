import {
  formatPrescription,
  formatPrescriptionText,
  formatRest,
  isTimeBasedPrescription,
  prescriptionOf,
  type Prescription,
} from './prescription';

/**
 * PARITY FIXTURE.
 *
 * Every expected string below was produced by running
 * `public.format_prescription_text()` on the local database with exactly these
 * arguments (psql, 2026-09-21) and pasting the result. The point of the table
 * is that it is NOT independently reasoned TypeScript: if the two renderers
 * ever diverge, this file is what notices.
 */
const SQL_PARITY: [Prescription, string | null][] = [
  [{ mode: 'reps', sets: 3, reps_min: 12 }, '3x12 reps'],
  [{ mode: 'reps', reps_min: 8 }, '8 reps'],
  [{ mode: 'reps', sets: 3 }, null],
  [{ mode: 'range', sets: 4, reps_min: 8, reps_max: 12 }, '4x8-12 reps'],
  [{ mode: 'range', reps_min: 8 }, null],
  [{ mode: 'seconds', sets: 3, seconds: 45 }, '3x45s'],
  [{ mode: 'seconds', seconds: 120 }, '2 min'],
  [{ mode: 'seconds', sets: 2, seconds: 90 }, '2x90s'],
  [{ mode: 'per_side', sets: 3, reps_min: 10 }, '3x10 reps/side'],
  [{ mode: 'per_side', sets: 3, reps_min: 8, reps_max: 12 }, '3x8-12 reps/side'],
  [{ mode: 'per_side', sets: 3, seconds: 30 }, '3x30s/side'],
  [{ mode: 'per_side' }, null],
  [{ mode: 'amrap', sets: 5, seconds: 600 }, 'AMRAP 10 min'],
  [{ mode: 'amrap' }, 'AMRAP'],
  [{ mode: 'distance', distance_m: 400 }, '400m'],
  [{ mode: 'distance', sets: 3, distance_m: 2000 }, '3x2km'],
  [{ mode: 'distance', distance_m: 1500 }, '1500m'],
  [{ mode: 'notes', sets: 3, weight: 20, weight_unit: 'kg', notes: 'Coach cue here' }, 'Coach cue here'],
  [{ mode: 'notes', notes: '   ' }, null],
  [{ mode: 'reps', sets: 3, reps_min: 10, weight: 20, weight_unit: 'kg' }, '3x10 reps @ 20kg'],
  [{ mode: 'reps', sets: 3, reps_min: 10, weight: 22.5, weight_unit: 'lb' }, '3x10 reps @ 22.5lb'],
  [{ mode: 'reps', sets: 3, reps_min: 10, weight: 0.5 }, '3x10 reps @ 0.5kg'],
  [{ mode: 'range', sets: 3, reps_min: 8, reps_max: 10, weight: 100, weight_unit: 'kg' }, '3x8-10 reps @ 100kg'],
  [{ mode: 'seconds', sets: 3, seconds: 60, weight: 12.25, weight_unit: 'kg' }, '3x1 min @ 12.25kg'],
];

describe('formatPrescriptionText', () => {
  it.each(SQL_PARITY)('renders %j exactly as format_prescription_text does', (prescription, expected) => {
    expect(formatPrescriptionText(prescription)).toBe(expected);
  });

  it('returns null rather than guessing when there is no prescription', () => {
    expect(formatPrescriptionText(null)).toBeNull();
    expect(formatPrescriptionText(undefined)).toBeNull();
  });

  it('rejects a mode the database would not accept', () => {
    expect(formatPrescriptionText({ mode: 'tabata' as never, seconds: 20 })).toBeNull();
  });

  it('never prefixes AMRAP or notes with a set count', () => {
    expect(formatPrescriptionText({ mode: 'amrap', sets: 4, seconds: 300 })).toBe('AMRAP 5 min');
    expect(formatPrescriptionText({ mode: 'notes', sets: 4, notes: 'As discussed' })).toBe('As discussed');
  });

  it('never appends a weight to free-text notes', () => {
    expect(formatPrescriptionText({ mode: 'notes', notes: 'Easy pace', weight: 40, weight_unit: 'kg' })).toBe(
      'Easy pace',
    );
  });

  it('prefers minutes only when the seconds divide evenly', () => {
    expect(formatPrescriptionText({ mode: 'seconds', seconds: 59 })).toBe('59s');
    expect(formatPrescriptionText({ mode: 'seconds', seconds: 60 })).toBe('1 min');
    expect(formatPrescriptionText({ mode: 'seconds', seconds: 61 })).toBe('61s');
  });
});

describe('prescriptionOf', () => {
  it('reads the structured columns off a row', () => {
    expect(
      prescriptionOf({
        reps_or_duration: '3x8-12 reps',
        prescription_mode: 'range',
        sets: 3,
        reps_min: 8,
        reps_max: 12,
      }),
    ).toMatchObject({ mode: 'range', sets: 3, reps_min: 8, reps_max: 12 });
  });

  it('is null for a legacy row that has never been through the migration', () => {
    expect(prescriptionOf({ reps_or_duration: '12 reps' })).toBeNull();
    expect(prescriptionOf({ reps_or_duration: '12 reps', prescription_mode: null })).toBeNull();
  });

  it('drops a weight unit the CHECK constraint would not allow', () => {
    expect(prescriptionOf({ prescription_mode: 'reps', reps_min: 5, weight_unit: 'stone' })?.weight_unit).toBeNull();
  });
});

describe('formatPrescription', () => {
  it('renders the structure when the row has one', () => {
    expect(
      formatPrescription({ reps_or_duration: 'stale text', prescription_mode: 'reps', sets: 3, reps_min: 12 }),
    ).toBe('3x12 reps');
  });

  it('falls back to the legacy text for a row written by an older client', () => {
    expect(formatPrescription({ reps_or_duration: '10 reps each side' })).toBe('10 reps each side');
  });

  it('falls back when the structure is too incomplete to render', () => {
    expect(formatPrescription({ reps_or_duration: 'as many as you can', prescription_mode: 'reps' })).toBe(
      'as many as you can',
    );
  });

  it('is an empty string, never "undefined", for a row with neither', () => {
    expect(formatPrescription({})).toBe('');
    expect(formatPrescription(null)).toBe('');
  });
});

describe('isTimeBasedPrescription', () => {
  it('is true for durations and false for repetitions', () => {
    expect(isTimeBasedPrescription({ prescription_mode: 'seconds', seconds: 45 })).toBe(true);
    expect(isTimeBasedPrescription({ prescription_mode: 'reps', reps_min: 12 })).toBe(false);
    expect(isTimeBasedPrescription({ prescription_mode: 'range', reps_min: 8, reps_max: 12 })).toBe(false);
    expect(isTimeBasedPrescription({ prescription_mode: 'distance', distance_m: 400 })).toBe(false);
  });

  it('decides per_side and amrap on which field is actually set', () => {
    expect(isTimeBasedPrescription({ prescription_mode: 'per_side', seconds: 30 })).toBe(true);
    expect(isTimeBasedPrescription({ prescription_mode: 'per_side', reps_min: 10 })).toBe(false);
    expect(isTimeBasedPrescription({ prescription_mode: 'amrap', seconds: 300 })).toBe(true);
    expect(isTimeBasedPrescription({ prescription_mode: 'amrap' })).toBe(false);
  });

  it('abstains — rather than guessing false — for a legacy row', () => {
    expect(isTimeBasedPrescription({ reps_or_duration: '30s' })).toBeNull();
  });
});

describe('formatRest', () => {
  it('renders the rest interval when there is one', () => {
    expect(formatRest({ prescription_mode: 'reps', reps_min: 10, rest_seconds: 90 })).toBe('90s rest');
    expect(formatRest({ prescription_mode: 'reps', reps_min: 10, rest_seconds: 120 })).toBe('2 min rest');
  });

  it('is null when rest is absent or zero', () => {
    expect(formatRest({ prescription_mode: 'reps', reps_min: 10 })).toBeNull();
    expect(formatRest({ prescription_mode: 'reps', reps_min: 10, rest_seconds: 0 })).toBeNull();
    expect(formatRest({ reps_or_duration: '10 reps' })).toBeNull();
  });
});
