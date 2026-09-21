import { canJoin, displayStateOf, formatClassTiming, joinBlockedMessage } from './status';

const NOW = new Date('2026-09-19T12:00:00.000Z');
const minutesFromNow = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

describe('displayStateOf', () => {
  it('shows a scheduled class inside the window as starting soon', () => {
    expect(displayStateOf('scheduled', minutesFromNow(15), NOW)).toBe('starting-soon');
  });

  it('shows a scheduled class outside the window as scheduled', () => {
    expect(displayStateOf('scheduled', minutesFromNow(16), NOW)).toBe('scheduled');
    expect(displayStateOf('scheduled', minutesFromNow(2 * 24 * 60), NOW)).toBe('scheduled');
  });

  it('shows a scheduled class whose start already passed as scheduled, not starting soon', () => {
    expect(displayStateOf('scheduled', minutesFromNow(-5), NOW)).toBe('scheduled');
  });

  it('lets a non-scheduled status win regardless of the clock', () => {
    expect(displayStateOf('live', minutesFromNow(-30), NOW)).toBe('live');
    expect(displayStateOf('live', minutesFromNow(5), NOW)).toBe('live');
    expect(displayStateOf('ended', minutesFromNow(5), NOW)).toBe('ended');
    expect(displayStateOf('cancelled', minutesFromNow(5), NOW)).toBe('cancelled');
  });
});

describe('canJoin / joinBlockedMessage', () => {
  it('allows scheduled and live classes, however far away', () => {
    expect(canJoin('scheduled')).toBe(true);
    expect(canJoin('live')).toBe(true);
    expect(joinBlockedMessage('scheduled')).toBeNull();
    expect(joinBlockedMessage('live')).toBeNull();
  });

  it('blocks ended and cancelled classes with a clear reason', () => {
    expect(canJoin('ended')).toBe(false);
    expect(canJoin('cancelled')).toBe(false);
    expect(joinBlockedMessage('ended')).toMatch(/ended/);
    expect(joinBlockedMessage('cancelled')).toMatch(/cancelled/);
  });
});

describe('formatClassTiming — status wins over the clock', () => {
  // The bug this exists for: a coach starts the class early (or cancels it) and
  // the card kept counting down to a start time the server had already moved past.
  it.each([-90, -5, 5, 90, 60 * 48])(
    'says "Live now" for a live class started %i minutes from now',
    (offset) => {
      expect(formatClassTiming('live', minutesFromNow(offset), NOW)).toBe('Live now');
    }
  );

  it.each([-90, -5, 5, 90, 60 * 48])(
    'says "Cancelled" for a cancelled class %i minutes from now',
    (offset) => {
      expect(formatClassTiming('cancelled', minutesFromNow(offset), NOW)).toBe('Cancelled');
    }
  );

  it.each([-90, -5, 5, 90, 60 * 48])(
    'says "Ended" for an ended class %i minutes from now',
    (offset) => {
      expect(formatClassTiming('ended', minutesFromNow(offset), NOW)).toBe('Ended');
    }
  );

  it('falls back to the countdown only while the class is still scheduled', () => {
    expect(formatClassTiming('scheduled', minutesFromNow(14), NOW)).toBe('Starts in 14 min');
    expect(formatClassTiming('scheduled', minutesFromNow(0), NOW)).toBe('Starting now');
    expect(formatClassTiming('scheduled', minutesFromNow(-5), NOW)).toBe('Started 5 min ago');
  });

  it('never says "Starts in" or "Starting now" for a class that is not scheduled', () => {
    for (const status of ['live', 'ended', 'cancelled'] as const) {
      const text = formatClassTiming(status, minutesFromNow(30), NOW);
      expect(text).not.toMatch(/Start/);
    }
  });
});
