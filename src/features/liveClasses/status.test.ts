import { canJoin, displayStateOf, joinBlockedMessage } from './status';

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
