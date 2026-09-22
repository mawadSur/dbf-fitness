import { formatPrescription, prescriptionLabel } from './itemPrescription';

describe('formatPrescription', () => {
  describe('plain counts', () => {
    it.each([
      ['10', '10 reps'],
      ['12', '12 reps'],
      ['100', '100 reps'],
      ['1', '1 rep'],
    ])('%s -> %s', (input, expected) => {
      expect(formatPrescription(input)).toBe(expected);
    });
  });

  describe('ranges', () => {
    it.each([
      ['8-10', '8-10 reps'],
      ['8 - 10', '8-10 reps'],
      ['8–10', '8-10 reps'],
      ['8 to 10', '8-10 reps'],
      ['12-15', '12-15 reps'],
    ])('%s -> %s', (input, expected) => {
      expect(formatPrescription(input)).toBe(expected);
    });
  });

  describe('durations never say "reps"', () => {
    it.each([
      ['30s', '30 sec'],
      ['45 sec', '45 sec'],
      ['45 secs', '45 sec'],
      ['90 seconds', '90 sec'],
      ['2 min', '2 min'],
      ['2 minutes', '2 min'],
      ['1 minute', '1 min'],
      ['1 hour', '1 hr'],
      ['1h', '1 hr'],
      ['30-45s', '30-45 sec'],
      ['1:30', '1:30'],
      ['10:00', '10:00'],
    ])('%s -> %s', (input, expected) => {
      expect(formatPrescription(input)).toBe(expected);
    });

    it('never appends the repetition unit to a time', () => {
      for (const value of ['30s', '45 sec', '2 min', '1:30', '30-45s']) {
        expect(formatPrescription(value)).not.toMatch(/rep/i);
      }
    });
  });

  describe('per-side work', () => {
    it.each([
      ['10/side', '10 reps per side'],
      ['10 / side', '10 reps per side'],
      ['10 each leg', '10 reps per leg'],
      ['12 per arm', '12 reps per arm'],
      ['8-10 each side', '8-10 reps per side'],
      ['30s/side', '30 sec per side'],
      ['10/legs', '10 reps per leg'],
    ])('%s -> %s', (input, expected) => {
      expect(formatPrescription(input)).toBe(expected);
    });
  });

  describe('a value that already names its unit is not doubled', () => {
    it.each([
      ['10 reps', '10 reps'],
      ['8-10 reps', '8-10 reps'],
      ['1 rep', '1 rep'],
      ['10 repetitions', '10 reps'],
    ])('%s -> %s', (input, expected) => {
      expect(formatPrescription(input)).toBe(expected);
    });
  });

  describe('free text is the coach’s words, untouched', () => {
    it.each([
      ['AMRAP', 'AMRAP'],
      ['to failure', 'to failure'],
      ['max effort', 'max effort'],
      ['as many as you can', 'as many as you can'],
      ['400m', '400m'],
      ['until the timer', 'until the timer'],
      ['max reps', 'max reps'],
    ])('%s is left alone', (input, expected) => {
      expect(formatPrescription(input)).toBe(expected);
    });
  });

  describe('missing or blank', () => {
    it.each([
      [undefined, null],
      [null, null],
      ['', null],
      ['   ', null],
    ])('%s -> null', (input, expected) => {
      expect(formatPrescription(input)).toBe(expected);
    });
  });

  it('collapses inner whitespace so one prescription has one spelling', () => {
    expect(formatPrescription('  8   -   10  ')).toBe('8-10 reps');
    expect(formatPrescription('45    sec')).toBe('45 sec');
  });
});

describe('prescriptionLabel', () => {
  it('joins sets and reps with the multiplication sign', () => {
    expect(prescriptionLabel({ sets: 4, reps: '8-10' })).toBe('4 sets × 8-10 reps');
  });

  it('is the regression this formatter exists for: a timed hold keeps its unit', () => {
    expect(prescriptionLabel({ sets: 3, reps: '30s' })).toBe('3 sets × 30 sec');
    expect(prescriptionLabel({ sets: 1, reps: '45s' })).toBe('1 set × 45 sec');
  });

  it('singularises one set', () => {
    expect(prescriptionLabel({ sets: 1 })).toBe('1 set');
    expect(prescriptionLabel({ sets: 2 })).toBe('2 sets');
  });

  it('shows the reps alone when the item prescribes no sets', () => {
    expect(prescriptionLabel({ reps: '10' })).toBe('10 reps');
    expect(prescriptionLabel({ reps: '2 min' })).toBe('2 min');
  });

  it('is null when the item prescribes neither', () => {
    expect(prescriptionLabel({})).toBeNull();
    expect(prescriptionLabel({ reps: '' })).toBeNull();
  });

  it('keeps a zero set count visible rather than treating it as absent', () => {
    expect(prescriptionLabel({ sets: 0, reps: '10' })).toBe('0 sets × 10 reps');
  });
});
