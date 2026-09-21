import {
  formatDistance,
  formatPrescription,
  formatSeconds,
  PRESCRIPTION_MODES,
} from './prescription';

describe('formatSeconds', () => {
  it.each([
    [1, '1s'],
    [45, '45s'],
    [59, '59s'],
    [60, '1 min'],
    [90, '1:30'],
    [120, '2 min'],
    [605, '10:05'],
  ])('renders %i seconds as %s', (seconds, expected) => {
    expect(formatSeconds(seconds)).toBe(expected);
  });
});

describe('formatDistance', () => {
  it.each([
    [400, '400 m'],
    [999, '999 m'],
    [1000, '1 km'],
    [1500, '1.5 km'],
    [1234, '1.23 km'],
  ])('renders %i m as %s', (metres, expected) => {
    expect(formatDistance(metres)).toBe(expected);
  });
});

/**
 * The shipped bug: every prescription was badged with a CLOCK, so "12 reps"
 * read as twelve of something temporal. The icon now follows the MEANING.
 */
describe('formatPrescription — the clock only means time', () => {
  it('gives a rep count the rep mark, never the clock', () => {
    const reps = formatPrescription({ prescriptionMode: 'reps', sets: 3, repsMin: 12 });
    expect(reps.text).toBe('3 × 12 reps');
    expect(reps.icon).toBe('workout');
    expect(reps.timeBased).toBe(false);
  });

  it('gives a hold the clock', () => {
    const hold = formatPrescription({ prescriptionMode: 'seconds', sets: 3, seconds: 45 });
    expect(hold.text).toBe('3 × 45s');
    expect(hold.icon).toBe('clock');
    expect(hold.timeBased).toBe(true);
  });

  it('gives a distance neither — it is not time and not a count', () => {
    const run = formatPrescription({ prescriptionMode: 'distance', distanceM: 400, sets: 4 });
    expect(run.text).toBe('4 × 400 m');
    expect(run.icon).toBe('arrow-right');
    expect(run.timeBased).toBe(false);
  });
});

describe('formatPrescription — the structured shape (D1b columns)', () => {
  it('renders a rep RANGE as a range', () => {
    const out = formatPrescription({ prescriptionMode: 'range', sets: 4, repsMin: 8, repsMax: 12 });
    expect(out.text).toBe('4 × 8–12 reps');
  });

  it('collapses a range whose bounds are equal', () => {
    const out = formatPrescription({ prescriptionMode: 'range', sets: 4, repsMin: 10, repsMax: 10 });
    expect(out.text).toBe('4 × 10 reps');
  });

  it('says "each side" for a per-side prescription', () => {
    const out = formatPrescription({ prescriptionMode: 'per_side', sets: 3, repsMin: 10 });
    expect(out.text).toBe('3 × 10 reps each side');
  });

  it('renders AMRAP, with its time cap when there is one', () => {
    expect(formatPrescription({ prescriptionMode: 'amrap' }).text).toBe('AMRAP');
    expect(formatPrescription({ prescriptionMode: 'amrap', seconds: 300 }).text).toBe(
      'AMRAP in 5 min',
    );
  });

  it('passes a notes-mode prescription through as the coach wrote it', () => {
    const out = formatPrescription({ prescriptionMode: 'notes', notes: 'Work up to a heavy single' });
    expect(out.text).toBe('Work up to a heavy single');
    expect(out.icon).toBe('info');
  });

  it('drops the sets prefix when there is only the one set', () => {
    expect(formatPrescription({ prescriptionMode: 'seconds', seconds: 60 }).text).toBe('1 min');
  });

  it('puts load and rest in the secondary line, not in the chip', () => {
    const out = formatPrescription({
      prescriptionMode: 'reps',
      sets: 5,
      repsMin: 5,
      weight: 60,
      weightUnit: 'kg',
      restSeconds: 90,
    });
    expect(out.text).toBe('5 × 5 reps');
    expect(out.detail).toBe('60 kg · 1:30 rest');
  });

  it('defaults an unset weight unit to kg rather than dropping the load', () => {
    expect(formatPrescription({ prescriptionMode: 'reps', repsMin: 5, weight: 40 }).detail).toBe(
      '40 kg',
    );
  });

  it('honours pounds when the coach chose them', () => {
    expect(
      formatPrescription({ prescriptionMode: 'reps', repsMin: 5, weight: 95, weightUnit: 'lb' })
        .detail,
    ).toBe('95 lb');
  });
});

describe('formatPrescription — the legacy shape still works', () => {
  it('falls back to reps_or_duration when no mode is set (old rows, old clients)', () => {
    expect(formatPrescription({ repsOrDuration: '12 reps' })).toMatchObject({
      text: '12 reps',
      icon: 'workout',
      timeBased: false,
    });
  });

  it('still reads a duration out of the legacy text', () => {
    expect(formatPrescription({ repsOrDuration: '45 sec hold' })).toMatchObject({
      icon: 'clock',
      timeBased: true,
    });
    expect(formatPrescription({ repsOrDuration: '1:30' })).toMatchObject({ icon: 'clock' });
  });

  it('does not mistake "400m" for four hundred minutes', () => {
    expect(formatPrescription({ repsOrDuration: '400m run' }).timeBased).toBe(false);
  });

  it('falls back to the legacy text for a HALF-migrated row (mode set, numbers missing)', () => {
    const out = formatPrescription({
      prescriptionMode: 'reps',
      repsOrDuration: '12 reps each leg',
      repsMin: null,
      repsMax: null,
    });
    expect(out.text).toBe('12 reps each leg');
  });

  it('ignores a mode value the client does not know', () => {
    const out = formatPrescription({ prescriptionMode: 'tempo', repsOrDuration: '3011 tempo' });
    expect(out.text).toBe('3011 tempo');
  });

  it('never renders an empty chip', () => {
    expect(formatPrescription({}).text).toBe('Prescription to come');
    expect(formatPrescription({ repsOrDuration: '   ' }).text).toBe('Prescription to come');
  });

  it('returns a usable result for every declared mode, with nothing else set', () => {
    for (const mode of PRESCRIPTION_MODES) {
      const out = formatPrescription({ prescriptionMode: mode, repsOrDuration: '10 reps' });
      expect(out.text.length).toBeGreaterThan(0);
      expect(out.icon.length).toBeGreaterThan(0);
    }
  });
});
